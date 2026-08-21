import type { Request, Response } from 'express';
import { MonthCoverageError } from '../domain/monthCoverage/types';
import {
  createMonthCoveragePayment,
  previewMonthCoveragePayment,
  previewVoidMonthCoveragePayment,
  updateMonthCoveragePayment,
  voidMonthCoveragePayment,
  type CreateMonthCoveragePaymentInput,
  type MonthCoveragePaymentResult,
  type PreviewMonthCoveragePaymentInput,
  type UpdateMonthCoveragePaymentInput,
  type VoidMonthCoveragePaymentInput,
} from '../services/monthCoveragePaymentService';
import {
  getMonthCoverageSummary,
  type MonthCoverageSummaryQuery,
  type MonthCoverageSummaryResponse,
} from '../services/monthCoverageSummaryService';
import {
  pendingMonthReportRows,
  getMonthCoverageTransactionReportRows,
  renderMonthCoveragePdf,
  sendMonthCoverageReminders,
} from '../services/monthCoverageReportService';

export type MonthCoverageControllerDeps = {
  summary(input: MonthCoverageSummaryQuery): Promise<MonthCoverageSummaryResponse>;
  preview(input: PreviewMonthCoveragePaymentInput): ReturnType<typeof previewMonthCoveragePayment>;
  create(input: CreateMonthCoveragePaymentInput): Promise<MonthCoveragePaymentResult>;
  update(input: UpdateMonthCoveragePaymentInput): Promise<MonthCoveragePaymentResult>;
  voidPreview(input: { instituteId: string; paymentId: string }): ReturnType<typeof previewVoidMonthCoveragePayment>;
  voidPayment(input: VoidMonthCoveragePaymentInput): ReturnType<typeof voidMonthCoveragePayment>;
  reminders(input: Parameters<typeof sendMonthCoverageReminders>[0]): ReturnType<typeof sendMonthCoverageReminders>;
  pendingReport(input: MonthCoverageSummaryQuery): Promise<Buffer>;
  transactionReport(input: MonthCoverageSummaryQuery, month: number, year: number): Promise<Buffer>;
};

const defaultDeps: MonthCoverageControllerDeps = {
  summary: getMonthCoverageSummary,
  preview: previewMonthCoveragePayment,
  create: createMonthCoveragePayment,
  update: updateMonthCoveragePayment,
  voidPreview: previewVoidMonthCoveragePayment,
  voidPayment: voidMonthCoveragePayment,
  reminders: sendMonthCoverageReminders,
  async pendingReport(input) {
    const summary = await getMonthCoverageSummary(input);
    const rows = pendingMonthReportRows(summary);
    return renderMonthCoveragePdf(
      'Pending Month Coverage Report',
      ['Student', 'Batch', 'Fee Start', 'Fee End', 'Received', 'Pending', 'Overdue', 'Oldest Overdue'],
      rows.map(row => [row.student, row.batch, row.feeStart, row.feeEnd, row.received, row.pending, row.overdue, row.oldestOverdueMonth]),
    );
  },
  async transactionReport(input, month, year) {
    const rows = await getMonthCoverageTransactionReportRows({
      instituteId: input.instituteId,
      teacherId: input.teacherId!,
      month,
      year,
    });
    return renderMonthCoveragePdf(
      'Month Coverage Collections',
      ['Date', 'Student', 'Batch', 'Amount', 'Coverage Months'],
      rows.map(row => [row.paymentDate.slice(0, 10), row.studentName, row.batchName, row.amountRupees, row.coverageMonths.join(', ')]),
    );
  },
};

function context(req: Request, res: Response): { instituteId: string; actorId: string } | null {
  const instituteId = req.user?.instituteId;
  const actorId = req.user?.id;
  if (!instituteId || !actorId) {
    res.status(401).json({ error: 'Missing institute context' });
    return null;
  }
  return { instituteId, actorId };
}

function errorStatus(code: string): number {
  if (['MONTH_ALREADY_COVERED', 'COVERAGE_GAP_REQUIRES_CONFIRMATION', 'FEE_MODE_MISMATCH', 'PROFILE_CONTEXT_MISMATCH'].includes(code)) return 409;
  if (code === 'ACTOR_NOT_AUTHORIZED') return 403;
  if (['STUDENT_NOT_FOUND', 'PAYMENT_NOT_FOUND', 'PROFILE_NOT_FOUND', 'BATCH_NOT_FOUND', 'INSTITUTE_NOT_FOUND'].includes(code)) return 404;
  return 400;
}

function fail(res: Response, error: unknown): Response {
  if (error instanceof MonthCoverageError) return res.status(errorStatus(error.code)).json({ error: error.code });
  console.error('Month coverage controller error:', error);
  return res.status(500).json({ error: 'MONTH_COVERAGE_OPERATION_FAILED' });
}

function serializePaymentResult(result: MonthCoveragePaymentResult) {
  const { amountPaise, ...payment } = result.payment;
  return { ...result, payment: { ...payment, amount: amountPaise / 100 } };
}

export function createMonthCoverageHandlers(deps: MonthCoverageControllerDeps = defaultDeps) {
  return {
    summary: async (req: Request, res: Response) => {
      const auth = context(req, res); if (!auth) return;
      try {
        return res.json(await deps.summary({
          instituteId: auth.instituteId,
          teacherId: auth.actorId,
          batchId: typeof req.query.batchId === 'string' && req.query.batchId ? req.query.batchId : undefined,
          status: typeof req.query.status === 'string' && req.query.status ? req.query.status : undefined,
          now: new Date(),
        }));
      } catch (error) { return fail(res, error); }
    },

    recentPayments: async (req: Request, res: Response) => {
      const auth = context(req, res); if (!auth) return;
      try {
        const summary = await deps.summary({ instituteId: auth.instituteId, teacherId: auth.actorId, now: new Date() });
        return res.json({ feeMode: 'MONTH_COVERAGE', payments: summary.recentPayments });
      } catch (error) { return fail(res, error); }
    },

    previewPayment: async (req: Request, res: Response) => {
      const auth = context(req, res); if (!auth) return;
      try {
        return res.json(await deps.preview({
          instituteId: auth.instituteId,
          studentId: req.body.studentId,
          duration: req.body.duration,
          requestedStartMonth: req.body.requestedStartMonth ?? null,
          allowGap: req.body.allowGap === true,
          now: new Date(),
        }));
      } catch (error) { return fail(res, error); }
    },

    createPayment: async (req: Request, res: Response) => {
      const auth = context(req, res); if (!auth) return;
      const rawKey = req.headers['idempotency-key'];
      const idempotencyKey = Array.isArray(rawKey) ? rawKey[0] : rawKey;
      if (!idempotencyKey || !idempotencyKey.trim()) return res.status(400).json({ error: 'IDEMPOTENCY_KEY_REQUIRED' });
      try {
        const result = await deps.create({
          instituteId: auth.instituteId,
          actorId: auth.actorId,
          studentId: req.body.studentId,
          amountRupees: req.body.amount,
          paymentDate: new Date(req.body.paymentDate),
          paymentMethod: req.body.paymentMethod,
          duration: req.body.duration,
          requestedStartMonth: req.body.requestedStartMonth ?? null,
          allowGap: req.body.allowGap === true,
          note: req.body.note,
          idempotencyKey: idempotencyKey.trim(),
        });
        return res.status(result.idempotent ? 200 : 201).json(serializePaymentResult(result));
      } catch (error) { return fail(res, error); }
    },

    updatePayment: async (req: Request, res: Response) => {
      const auth = context(req, res); if (!auth) return;
      try {
        const result = await deps.update({
          instituteId: auth.instituteId,
          actorId: auth.actorId,
          paymentId: String(req.params.paymentId),
          studentId: req.body.studentId,
          amountRupees: req.body.amount,
          paymentDate: new Date(req.body.paymentDate),
          paymentMethod: req.body.paymentMethod,
          duration: req.body.duration,
          requestedStartMonth: req.body.requestedStartMonth ?? null,
          allowGap: req.body.allowGap === true,
          note: req.body.note,
          reason: req.body.reason,
        });
        return res.json(serializePaymentResult(result));
      } catch (error) { return fail(res, error); }
    },

    voidPreview: async (req: Request, res: Response) => {
      const auth = context(req, res); if (!auth) return;
      try { return res.json(await deps.voidPreview({ instituteId: auth.instituteId, paymentId: String(req.params.paymentId) })); }
      catch (error) { return fail(res, error); }
    },

    voidPayment: async (req: Request, res: Response) => {
      const auth = context(req, res); if (!auth) return;
      try {
        const result = await deps.voidPayment({
          instituteId: auth.instituteId,
          actorId: auth.actorId,
          paymentId: String(req.params.paymentId),
          reason: req.body?.reason,
          now: new Date(),
        });
        const { amountPaise, ...payment } = result.payment;
        return res.json({ ...result, payment: { ...payment, amount: amountPaise / 100 } });
      } catch (error) { return fail(res, error); }
    },

    sendReminders: async (req: Request, res: Response) => {
      const auth = context(req, res); if (!auth) return;
      try {
        return res.json(await deps.reminders({
          instituteId: auth.instituteId,
          teacherId: auth.actorId,
          batchId: req.body.batchId,
          studentIds: req.body.studentIds,
          now: new Date(),
        }));
      } catch (error) { return fail(res, error); }
    },

    pendingReport: async (req: Request, res: Response) => {
      const auth = context(req, res); if (!auth) return;
      try {
        const pdf = await deps.pendingReport({
          instituteId: auth.instituteId,
          teacherId: auth.actorId,
          batchId: typeof req.query.batchId === 'string' ? req.query.batchId : undefined,
          now: new Date(),
        });
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', 'attachment; filename="month-coverage-pending.pdf"');
        return res.send(pdf);
      } catch (error) { return fail(res, error); }
    },

    transactionReport: async (req: Request, res: Response) => {
      const auth = context(req, res); if (!auth) return;
      const month = Number(req.query.month);
      const year = Number(req.query.year);
      if (!Number.isInteger(month) || month < 1 || month > 12 || !Number.isInteger(year) || year < 2000 || year > 9999) {
        return res.status(400).json({ error: 'INVALID_REPORT_PERIOD' });
      }
      try {
        const pdf = await deps.transactionReport({ instituteId: auth.instituteId, teacherId: auth.actorId, now: new Date() }, month, year);
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename="month-coverage-transactions-${year}-${String(month).padStart(2, '0')}.pdf"`);
        return res.send(pdf);
      } catch (error) { return fail(res, error); }
    },
  };
}

export const monthCoverageHandlers = createMonthCoverageHandlers();
