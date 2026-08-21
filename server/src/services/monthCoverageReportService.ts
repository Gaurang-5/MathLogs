import PDFDocument from 'pdfkit';
import type { MonthCoverageSummaryResponse } from './monthCoverageSummaryService';
import { getMonthCoverageSummary } from './monthCoverageSummaryService';
import { parseMonth } from '../domain/monthCoverage/calendar';
import { prisma } from '../prisma';

function monthLabel(month: string): string {
  const parsed = parseMonth(month);
  return new Intl.DateTimeFormat('en-IN', { month: 'long', year: 'numeric', timeZone: 'UTC' })
    .format(new Date(Date.UTC(parsed.year, parsed.month - 1, 1)));
}

function monthList(months: string[]): string {
  const labels = months.map(monthLabel);
  if (labels.length <= 1) return labels[0] ?? '';
  const last = labels.pop();
  const sharedYear = labels.every(label => label.slice(-4) === last!.slice(-4));
  if (sharedYear) {
    const year = last!.slice(-4);
    const names = [...labels.map(label => label.replace(` ${year}`, '')), last!.replace(` ${year}`, '')];
    return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]} ${year}`;
  }
  return `${labels.join(', ')} and ${last}`;
}

export function buildMonthCoverageReminderBody(input: {
  studentName: string;
  batchName: string;
  instituteName: string;
  overdueMonths: string[];
}): string {
  return `Dear Parent/Guardian,

This is a gentle fee record reminder for ${input.studentName} (${input.batchName}). Our records show that ${monthList(input.overdueMonths)} ${input.overdueMonths.length === 1 ? 'is' : 'are'} still pending.

Please contact the teacher if this record needs correction.

Regards,
${input.instituteName}`;
}

export function pendingMonthReportRows(summary: MonthCoverageSummaryResponse) {
  return summary.students.filter(student => !student.setupRequired).map(student => ({
    student: student.name,
    batch: student.batchName,
    feeStart: student.feeStartMonth,
    feeEnd: student.feeEndMonth,
    received: student.receivedMonths,
    pending: student.pendingMonths,
    overdue: student.overdueMonths,
    oldestOverdueMonth: student.oldestOverdueMonth,
  }));
}

export function transactionMonthReportRows(summary: MonthCoverageSummaryResponse, month: number, year: number) {
  return summary.recentPayments.filter(payment => {
    const date = new Date(payment.paymentDate);
    return date.getUTCFullYear() === year && date.getUTCMonth() + 1 === month;
  });
}

export type MonthCoverageTransactionReportSource = {
  id: string;
  studentName: string;
  batchName: string;
  amountPaise: number;
  paymentDate: Date;
  coverageMonths: string[];
};

export type MonthCoverageTransactionReportDeps = {
  loadPayments(input: {
    instituteId: string;
    teacherId: string;
    from: Date;
    to: Date;
  }): Promise<MonthCoverageTransactionReportSource[]>;
};

export async function getMonthCoverageTransactionReportRows(
  input: { instituteId: string; teacherId: string; month: number; year: number },
  deps: MonthCoverageTransactionReportDeps = prismaMonthCoverageTransactionReportDeps,
) {
  const from = new Date(Date.UTC(input.year, input.month - 1, 1));
  const to = new Date(Date.UTC(input.year, input.month, 1));
  const payments = await deps.loadPayments({
    instituteId: input.instituteId,
    teacherId: input.teacherId,
    from,
    to,
  });
  return payments.map(payment => ({
    id: payment.id,
    studentName: payment.studentName,
    batchName: payment.batchName,
    amountRupees: payment.amountPaise / 100,
    paymentDate: payment.paymentDate.toISOString(),
    coverageMonths: [...payment.coverageMonths],
  }));
}

export const prismaMonthCoverageTransactionReportDeps: MonthCoverageTransactionReportDeps = {
  async loadPayments(input) {
    const rows = await prisma.monthCoveragePayment.findMany({
      where: {
        instituteId: input.instituteId,
        status: 'ACTIVE',
        paymentDate: { gte: input.from, lt: input.to },
        batch: { teacherId: input.teacherId },
      },
      select: {
        id: true,
        amountPaise: true,
        paymentDate: true,
        student: { select: { name: true } },
        batch: { select: { name: true } },
        allocations: { select: { coverageMonth: true }, orderBy: { coverageMonth: 'asc' } },
      },
      orderBy: { paymentDate: 'desc' },
    });
    return rows.map(row => ({
      id: row.id,
      studentName: row.student.name,
      batchName: row.batch.name,
      amountPaise: row.amountPaise,
      paymentDate: row.paymentDate,
      coverageMonths: row.allocations.map(allocation => allocation.coverageMonth),
    }));
  },
};

export async function renderMonthCoveragePdf(
  title: string,
  headers: string[],
  rows: Array<Array<string | number | null>>,
): Promise<Buffer> {
  const doc = new PDFDocument({ size: 'A4', margin: 36 });
  const chunks: Buffer[] = [];
  doc.on('data', chunk => chunks.push(Buffer.from(chunk)));
  const completed = new Promise<Buffer>((resolve, reject) => {
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
  });
  doc.fontSize(18).text(title);
  doc.moveDown();
  doc.fontSize(9).text(headers.join(' | '));
  doc.moveDown(0.5);
  for (const row of rows) {
    if (doc.y > 760) doc.addPage();
    doc.text(row.map(value => value ?? '').join(' | '));
  }
  doc.end();
  return completed;
}

export async function sendMonthCoverageReminders(input: {
  instituteId: string;
  teacherId: string;
  batchId?: string;
  studentIds?: string[];
  now: Date;
}) {
  const [summary, institute] = await Promise.all([
    getMonthCoverageSummary({
      instituteId: input.instituteId,
      teacherId: input.teacherId,
      batchId: input.batchId,
      now: input.now,
    }),
    prisma.institute.findUnique({ where: { id: input.instituteId }, select: { name: true } }),
  ]);
  const selected = summary.students.filter(student => (
    !student.setupRequired
    && student.overdueMonths > 0
    && (!input.studentIds || input.studentIds.includes(student.studentId))
  ));
  const contacts = await prisma.student.findMany({
    where: { instituteId: input.instituteId, id: { in: selected.map(student => student.studentId) } },
    select: { id: true, parentEmail: true },
  });
  const emailByStudent = new Map(contacts.map(contact => [contact.id, contact.parentEmail]));
  const jobs = selected.flatMap(student => {
    const recipient = emailByStudent.get(student.studentId);
    if (!recipient || !student.oldestOverdueMonth) return [];
    const overdueMonths = Array.from({ length: student.overdueMonths }, (_, index) => {
      const start = parseMonth(student.oldestOverdueMonth!);
      const ordinal = start.ordinal + index;
      const year = Math.floor(ordinal / 12);
      const month = ordinal % 12 + 1;
      return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}`;
    });
    return [{
      recipient,
      subject: `Fee record reminder for ${student.name}`,
      body: buildMonthCoverageReminderBody({
        studentName: student.name,
        batchName: student.batchName,
        instituteName: institute?.name ?? 'Coaching Administration',
        overdueMonths,
      }),
      status: 'PENDING' as const,
      instituteId: input.instituteId,
      options: { senderType: 'NOREPLY', purpose: 'MONTH_COVERAGE_REMINDER' },
    }];
  });
  if (jobs.length) await prisma.emailJob.createMany({ data: jobs });
  return { queued: jobs.length, skipped: selected.length - jobs.length };
}
