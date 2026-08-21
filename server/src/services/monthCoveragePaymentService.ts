import type { MonthCoverageDuration } from '../domain/monthCoverage/types';
import { DURATION_MONTHS, MonthCoverageError } from '../domain/monthCoverage/types';
import { compareMonths, enumerateMonths } from '../domain/monthCoverage/calendar';
import { prisma } from '../prisma';

export type MonthCoverageStudentContext = {
  instituteId: string;
  batchId: string;
  studentId: string;
  coachingFeeMode: 'CURRENT_DUE_BASED' | 'MONTH_COVERAGE';
  timezone: string;
  profile: {
    status: 'PENDING_SETUP' | 'ACTIVE' | 'CLOSED';
    feeStartMonth: string | null;
    feeEndMonth: string | null;
  } | null;
};

export type MonthCoveragePaymentDeps = {
  loadStudentContext(instituteId: string, studentId: string): Promise<MonthCoverageStudentContext | null>;
  listCoveredMonths(instituteId: string, studentId: string): Promise<string[]>;
};

export type MonthCoveragePaymentRecord = {
  id: string;
  instituteId: string;
  batchId: string;
  studentId: string;
  amountPaise: number;
  paymentDate: Date;
  paymentMethod: string;
  duration: MonthCoverageDuration;
  note: string | null;
  status: 'ACTIVE' | 'VOID';
  idempotencyKey: string;
  createdById: string;
  coverageMonths?: string[];
};

export type MonthCoveragePaymentWrite = Omit<MonthCoveragePaymentRecord, 'id' | 'status' | 'coverageMonths'>;

export type MonthCoverageAllocationWrite = {
  instituteId: string;
  batchId: string;
  studentId: string;
  paymentId: string;
  coverageMonths: string[];
};

export type MonthCoverageAuditWrite = {
  instituteId: string;
  paymentId: string;
  actorId: string;
  action: 'CREATE';
  reason: null;
  before: null;
  after: {
    amountPaise: number;
    paymentDate: string;
    paymentMethod: string;
    duration: MonthCoverageDuration;
    note: string | null;
    status: 'ACTIVE';
    coverageMonths: string[];
  };
};

export type MonthCoveragePaymentTransaction = MonthCoveragePaymentDeps & {
  findPaymentByIdempotency(instituteId: string, idempotencyKey: string): Promise<MonthCoveragePaymentRecord | null>;
  createPayment(input: MonthCoveragePaymentWrite): Promise<MonthCoveragePaymentRecord>;
  createAllocations(input: MonthCoverageAllocationWrite): Promise<void>;
  createAuditEvent(input: MonthCoverageAuditWrite): Promise<void>;
};

export type MonthCoveragePaymentCreateDeps = MonthCoveragePaymentDeps & {
  loadActor(instituteId: string, actorId: string): Promise<{ id: string; instituteId: string } | null>;
  findPaymentByIdempotency(instituteId: string, idempotencyKey: string): Promise<MonthCoveragePaymentRecord | null>;
  runSerializable<T>(operation: (tx: MonthCoveragePaymentTransaction) => Promise<T>): Promise<T>;
};

export type PreviewMonthCoveragePaymentInput = {
  instituteId: string;
  studentId: string;
  duration: MonthCoverageDuration;
  requestedStartMonth: string | null;
  allowGap: boolean;
  now: Date;
};

export type MonthCoveragePreview = {
  studentId: string;
  duration: MonthCoverageDuration;
  monthCount: number;
  coverageMonths: string[];
  oldestPendingMonth: string;
  gapWarning: { skippedMonths: string[] } | null;
  remainingMonthsAfterPayment: number;
};

export type CreateMonthCoveragePaymentInput = {
  instituteId: string;
  actorId: string;
  studentId: string;
  amountRupees: number;
  paymentDate: Date;
  paymentMethod: 'CASH' | 'UPI' | 'BANK' | 'CARD' | 'OTHER';
  duration: MonthCoverageDuration;
  requestedStartMonth: string | null;
  allowGap: boolean;
  note?: string;
  idempotencyKey: string;
};

export type MonthCoveragePaymentResult = {
  payment: MonthCoveragePaymentRecord;
  coverageMonths: string[];
  preview: MonthCoveragePreview | null;
  idempotent: boolean;
};

type MonthCoveragePrismaClient = Pick<
  typeof prisma,
  'student' | 'admin' | 'monthCoverageAllocation' | 'monthCoveragePayment' | 'monthCoverageAuditEvent'
>;

function paymentRecord(row: {
  id: string;
  instituteId: string;
  batchId: string;
  studentId: string;
  amountPaise: number;
  paymentDate: Date;
  paymentMethod: string;
  duration: MonthCoverageDuration;
  note: string | null;
  status: 'ACTIVE' | 'VOID';
  idempotencyKey: string;
  createdById: string;
  allocations?: Array<{ coverageMonth: string }>;
}): MonthCoveragePaymentRecord {
  return {
    id: row.id,
    instituteId: row.instituteId,
    batchId: row.batchId,
    studentId: row.studentId,
    amountPaise: row.amountPaise,
    paymentDate: row.paymentDate,
    paymentMethod: row.paymentMethod,
    duration: row.duration,
    note: row.note,
    status: row.status,
    idempotencyKey: row.idempotencyKey,
    createdById: row.createdById,
    ...(row.allocations ? { coverageMonths: row.allocations.map(allocation => allocation.coverageMonth) } : {}),
  };
}

function prismaTransactionDeps(client: MonthCoveragePrismaClient): MonthCoveragePaymentTransaction {
  return {
    async loadStudentContext(instituteId, studentId) {
      const student = await client.student.findFirst({
        where: { id: studentId, instituteId, batch: { is: { instituteId } } },
        select: {
          id: true,
          instituteId: true,
          batchId: true,
          institute: { select: { coachingFeeMode: true, timezone: true } },
          monthCoverageProfile: {
            select: { status: true, feeStartMonth: true, feeEndMonth: true },
          },
        },
      });
      if (!student || !student.instituteId || !student.batchId || !student.institute) return null;
      return {
        instituteId: student.instituteId,
        batchId: student.batchId,
        studentId: student.id,
        coachingFeeMode: student.institute.coachingFeeMode,
        timezone: student.institute.timezone,
        profile: student.monthCoverageProfile,
      };
    },

    async listCoveredMonths(instituteId, studentId) {
      const rows = await client.monthCoverageAllocation.findMany({
        where: { instituteId, studentId, payment: { is: { status: 'ACTIVE' } } },
        select: { coverageMonth: true },
        orderBy: { coverageMonth: 'asc' },
      });
      return rows.map(row => row.coverageMonth);
    },

    async findPaymentByIdempotency(instituteId, idempotencyKey) {
      const row = await client.monthCoveragePayment.findUnique({
        where: { instituteId_idempotencyKey: { instituteId, idempotencyKey } },
        include: { allocations: { orderBy: { coverageMonth: 'asc' } } },
      });
      return row ? paymentRecord(row) : null;
    },

    async createPayment(input) {
      const row = await client.monthCoveragePayment.create({
        data: { ...input, status: 'ACTIVE' },
      });
      return paymentRecord(row);
    },

    async createAllocations(input) {
      await client.monthCoverageAllocation.createMany({
        data: input.coverageMonths.map(coverageMonth => ({
          instituteId: input.instituteId,
          batchId: input.batchId,
          studentId: input.studentId,
          paymentId: input.paymentId,
          coverageMonth,
        })),
      });
    },

    async createAuditEvent(input) {
      await client.monthCoverageAuditEvent.create({ data: input as never });
    },
  };
}

const prismaReadDeps = prismaTransactionDeps(prisma);

export const prismaMonthCoveragePaymentDeps: MonthCoveragePaymentCreateDeps = {
  loadStudentContext: prismaReadDeps.loadStudentContext,
  listCoveredMonths: prismaReadDeps.listCoveredMonths,
  findPaymentByIdempotency: prismaReadDeps.findPaymentByIdempotency,
  async loadActor(instituteId, actorId) {
    return prisma.admin.findFirst({
      where: { id: actorId, instituteId },
      select: { id: true, instituteId: true },
    }) as Promise<{ id: string; instituteId: string } | null>;
  },
  runSerializable(operation) {
    return prisma.$transaction(
      tx => operation(prismaTransactionDeps(tx)),
      { isolationLevel: 'Serializable' },
    );
  },
};

async function loadPreviewState(input: PreviewMonthCoveragePaymentInput, deps: MonthCoveragePaymentDeps) {
  const context = await deps.loadStudentContext(input.instituteId, input.studentId);
  if (!context || context.instituteId !== input.instituteId || context.studentId !== input.studentId) {
    throw new MonthCoverageError('STUDENT_NOT_FOUND');
  }
  if (context.coachingFeeMode !== 'MONTH_COVERAGE') throw new MonthCoverageError('FEE_MODE_MISMATCH');
  if (
    !context.profile
    || context.profile.status !== 'ACTIVE'
    || !context.profile.feeStartMonth
    || !context.profile.feeEndMonth
  ) {
    throw new MonthCoverageError('PROFILE_NOT_ACTIVE');
  }

  const applicableMonths = enumerateMonths(context.profile.feeStartMonth, context.profile.feeEndMonth);
  const covered = new Set(await deps.listCoveredMonths(input.instituteId, input.studentId));
  const uncoveredMonths = applicableMonths.filter(month => !covered.has(month));
  if (uncoveredMonths.length === 0) throw new MonthCoverageError('INSUFFICIENT_REMAINING_MONTHS');
  return { context, applicableMonths, covered, uncoveredMonths };
}

export async function previewMonthCoveragePayment(
  input: PreviewMonthCoveragePaymentInput,
  deps: MonthCoveragePaymentDeps = prismaMonthCoveragePaymentDeps,
): Promise<MonthCoveragePreview> {
  const { context, applicableMonths, covered, uncoveredMonths } = await loadPreviewState(input, deps);
  const monthCount = DURATION_MONTHS[input.duration];
  const oldestPendingMonth = uncoveredMonths[0];
  let coverageMonths: string[];
  let gapWarning: { skippedMonths: string[] } | null = null;

  if (input.requestedStartMonth) {
    const feeStartMonth = context.profile!.feeStartMonth!;
    const feeEndMonth = context.profile!.feeEndMonth!;
    if (
      compareMonths(input.requestedStartMonth, feeStartMonth) < 0
      || compareMonths(input.requestedStartMonth, feeEndMonth) > 0
    ) {
      throw new MonthCoverageError('COVERAGE_START_OUT_OF_RANGE');
    }
    if (covered.has(input.requestedStartMonth)) throw new MonthCoverageError('MONTH_ALREADY_COVERED');

    coverageMonths = enumerateMonths(input.requestedStartMonth, feeEndMonth).slice(0, monthCount);
    if (coverageMonths.length < monthCount) throw new MonthCoverageError('INSUFFICIENT_REMAINING_MONTHS');
    if (coverageMonths.some(month => covered.has(month))) throw new MonthCoverageError('MONTH_ALREADY_COVERED');

    const skippedMonths = applicableMonths.filter(month => (
      compareMonths(month, input.requestedStartMonth!) < 0 && !covered.has(month)
    ));
    if (skippedMonths.length > 0) {
      if (!input.allowGap) throw new MonthCoverageError('COVERAGE_GAP_REQUIRES_CONFIRMATION');
      gapWarning = { skippedMonths };
    }
  } else {
    if (uncoveredMonths.length < monthCount) throw new MonthCoverageError('INSUFFICIENT_REMAINING_MONTHS');
    coverageMonths = uncoveredMonths.slice(0, monthCount);
  }

  const selected = new Set(coverageMonths);
  return {
    studentId: input.studentId,
    duration: input.duration,
    monthCount,
    coverageMonths,
    oldestPendingMonth,
    gapWarning,
    remainingMonthsAfterPayment: uncoveredMonths.filter(month => !selected.has(month)).length,
  };
}

function isUniqueConflict(error: unknown): error is { code: 'P2002'; meta?: { target?: unknown } } {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === 'P2002';
}

function conflictTarget(error: { meta?: { target?: unknown } }): string {
  const target = error.meta?.target;
  return Array.isArray(target) ? target.join(',') : String(target ?? '');
}

function paiseFromRupees(amountRupees: number): number {
  if (!Number.isFinite(amountRupees) || amountRupees <= 0) throw new MonthCoverageError('INVALID_AMOUNT');
  const amountPaise = Math.round(amountRupees * 100);
  if (!Number.isSafeInteger(amountPaise) || amountPaise <= 0) throw new MonthCoverageError('INVALID_AMOUNT');
  return amountPaise;
}

function resultFromExisting(payment: MonthCoveragePaymentRecord): MonthCoveragePaymentResult {
  return {
    payment,
    coverageMonths: payment.coverageMonths ?? [],
    preview: null,
    idempotent: true,
  };
}

export async function createMonthCoveragePayment(
  input: CreateMonthCoveragePaymentInput,
  deps: MonthCoveragePaymentCreateDeps = prismaMonthCoveragePaymentDeps,
): Promise<MonthCoveragePaymentResult> {
  const amountPaise = paiseFromRupees(input.amountRupees);
  if (Number.isNaN(input.paymentDate.getTime())) throw new MonthCoverageError('INVALID_PAYMENT_DATE');

  const previewInput: PreviewMonthCoveragePaymentInput = {
    instituteId: input.instituteId,
    studentId: input.studentId,
    duration: input.duration,
    requestedStartMonth: input.requestedStartMonth,
    allowGap: input.allowGap,
    now: input.paymentDate,
  };
  await previewMonthCoveragePayment(previewInput, deps);

  const actor = await deps.loadActor(input.instituteId, input.actorId);
  if (!actor || actor.id !== input.actorId || actor.instituteId !== input.instituteId) {
    throw new MonthCoverageError('ACTOR_NOT_AUTHORIZED');
  }

  const existing = await deps.findPaymentByIdempotency(input.instituteId, input.idempotencyKey);
  if (existing) {
    if (existing.studentId !== input.studentId) throw new MonthCoverageError('PROFILE_CONTEXT_MISMATCH');
    return resultFromExisting(existing);
  }

  try {
    return await deps.runSerializable(async tx => {
      const concurrentExisting = await tx.findPaymentByIdempotency(input.instituteId, input.idempotencyKey);
      if (concurrentExisting) {
        if (concurrentExisting.studentId !== input.studentId) throw new MonthCoverageError('PROFILE_CONTEXT_MISMATCH');
        return resultFromExisting(concurrentExisting);
      }

      const preview = await previewMonthCoveragePayment(previewInput, tx);
      const context = await tx.loadStudentContext(input.instituteId, input.studentId);
      if (!context || context.instituteId !== input.instituteId || context.studentId !== input.studentId) {
        throw new MonthCoverageError('STUDENT_NOT_FOUND');
      }
      const payment = await tx.createPayment({
        instituteId: input.instituteId,
        batchId: context.batchId,
        studentId: input.studentId,
        amountPaise,
        paymentDate: input.paymentDate,
        paymentMethod: input.paymentMethod,
        duration: input.duration,
        note: input.note?.trim() || null,
        idempotencyKey: input.idempotencyKey,
        createdById: input.actorId,
      });
      await tx.createAllocations({
        instituteId: input.instituteId,
        batchId: context.batchId,
        studentId: input.studentId,
        paymentId: payment.id,
        coverageMonths: preview.coverageMonths,
      });
      await tx.createAuditEvent({
        instituteId: input.instituteId,
        paymentId: payment.id,
        actorId: input.actorId,
        action: 'CREATE',
        reason: null,
        before: null,
        after: {
          amountPaise,
          paymentDate: input.paymentDate.toISOString(),
          paymentMethod: input.paymentMethod,
          duration: input.duration,
          note: input.note?.trim() || null,
          status: 'ACTIVE',
          coverageMonths: preview.coverageMonths,
        },
      });
      return { payment, coverageMonths: preview.coverageMonths, preview, idempotent: false };
    });
  } catch (error) {
    if (isUniqueConflict(error)) {
      const target = conflictTarget(error);
      if (target.includes('idempotencyKey')) {
        const winningPayment = await deps.findPaymentByIdempotency(input.instituteId, input.idempotencyKey);
        if (!winningPayment) throw error;
        if (winningPayment.studentId !== input.studentId) throw new MonthCoverageError('PROFILE_CONTEXT_MISMATCH');
        return resultFromExisting(winningPayment);
      }
      if (target.includes('studentId') || target.includes('coverageMonth')) {
        throw new MonthCoverageError('MONTH_ALREADY_COVERED');
      }
    }
    throw error;
  }
}
