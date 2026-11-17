export interface BatchAssessmentTest {
  id: string;
  name: string;
  maxMarks: number;
  date: string;
  isQuiz?: boolean;
}

export interface BatchAssessmentStudent {
  id: string;
  marks?: Array<{ id?: string; score: number; test: BatchAssessmentTest }>;
}

export interface BatchAssessmentInsight extends BatchAssessmentTest {
  average: number | null;
  recorded: number;
  enrolled: number;
}

/** Marks are scoped by the batch endpoint. Unrecorded/invalid marks never become zero. */
export function getBatchAssessmentInsights(
  students: BatchAssessmentStudent[],
  tests: BatchAssessmentTest[],
): BatchAssessmentInsight[] {
  const uniqueTests = new Map(tests.map(test => [test.id, test]));
  return [...uniqueTests.values()].map(test => {
    const scores: number[] = [];
    const seenStudents = new Set<string>();
    for (const student of students) {
      if (seenStudents.has(student.id)) continue;
      seenStudents.add(student.id);
      const mark = student.marks?.find(item => item.test.id === test.id &&
        Number.isFinite(item.score) && item.score >= 0 && item.score <= test.maxMarks);
      if (mark && Number.isFinite(test.maxMarks) && test.maxMarks > 0) {
        scores.push(mark.score / test.maxMarks * 100);
      }
    }
    return {
      ...test,
      recorded: scores.length,
      enrolled: new Set(students.map(student => student.id)).size,
      average: scores.length ? scores.reduce((sum, score) => sum + score, 0) / scores.length : null,
    };
  }).sort((a, b) => (Date.parse(a.date) || 0) - (Date.parse(b.date) || 0));
}

export interface BatchFeeInstallment {
  id: string;
  name?: string;
  amount: number;
  studentId?: string | null;
  createdAt?: string;
}

export interface BatchFeeStudent {
  id: string;
  feeDecision?: string;
  enrollmentStartedAt?: string;
  createdAt?: string;
  feeAssignments?: Array<{ installmentId: string }>;
  feePayments?: Array<{ installmentId: string; amountPaid: number }>;
}

/** Matches the web applicability contract; deliberately does not allocate student-wide legacy payments. */
export function isBatchInstallmentApplicable(student: BatchFeeStudent, installment: BatchFeeInstallment): boolean {
  if (installment.studentId) return installment.studentId === student.id;
  if (student.feeAssignments?.some(item => item.installmentId === installment.id) ||
      student.feePayments?.some(item => item.installmentId === installment.id)) return true;
  if (student.feeDecision && student.feeDecision !== 'LEGACY') return false;
  const joined = student.enrollmentStartedAt || student.createdAt;
  const joinedAt = joined ? Date.parse(joined) : 0;
  const createdAt = installment.createdAt ? Date.parse(installment.createdAt) : NaN;
  return Number.isFinite(joinedAt) && Number.isFinite(createdAt) && createdAt >= joinedAt;
}

export interface BatchInviteData {
  id: string;
  name: string;
  coachingFeeMode?: 'CURRENT_DUE_BASED' | 'MONTH_COVERAGE';
  timezone?: string;
  startDate?: string | null;
  endDate?: string | null;
  feeInstallments: BatchFeeInstallment[];
}

export type BatchInviteFee =
  | { mode: 'MONTH_COVERAGE'; feeStartMonth: string }
  | { mode: 'CURRENT_DUE_BASED'; decision: 'SELECTED' | 'NO_FEE' | 'LATER'; installmentIds: string[];
      amounts?: Record<string, number>; applyFutureInstallments: boolean };

export function monthInBatchTimezone(value: string | Date, timezone = 'Asia/Kolkata'): string | null {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return null;
  try {
    const parts = new Intl.DateTimeFormat('en', { timeZone: timezone, year: 'numeric', month: '2-digit' }).formatToParts(date);
    return `${parts.find(part => part.type === 'year')?.value}-${parts.find(part => part.type === 'month')?.value}`;
  } catch { return null; }
}

export function getBatchMonthBounds(batch: BatchInviteData): { first: string; last: string } | null {
  const first = batch.startDate && monthInBatchTimezone(batch.startDate, batch.timezone);
  const last = batch.endDate && monthInBatchTimezone(batch.endDate, batch.timezone);
  return first && last && first <= last ? { first, last } : null;
}

export function initialBatchFeeMonth(batch: BatchInviteData, now = new Date()): string {
  const bounds = getBatchMonthBounds(batch);
  const current = monthInBatchTimezone(now, batch.timezone);
  return !bounds || !current ? '' : current < bounds.first ? bounds.first : current > bounds.last ? bounds.last : current;
}

export function normalizeBatchInvitePhone(value: string): string {
  const digits = value.replace(/\D/g, '');
  // The existing invitation controller sends to an Indian ten-digit number.
  if (digits.length === 12 && digits.startsWith('91')) return digits.slice(2);
  return digits;
}

export function buildBatchInvitePayload(batch: BatchInviteData, input: {
  phone: string; decision: 'SELECTED' | 'NO_FEE' | 'LATER' | '';
  installmentIds: string[]; applyFutureInstallments: boolean; feeStartMonth: string;
}): { whatsappNumber: string; fee: BatchInviteFee } {
  const whatsappNumber = normalizeBatchInvitePhone(input.phone);
  if (!/^\d{10}$/.test(whatsappNumber)) throw new Error('Enter a 10-digit WhatsApp number, optionally with +91.');
  if (batch.coachingFeeMode === 'MONTH_COVERAGE') {
    const bounds = getBatchMonthBounds(batch);
    if (!bounds) throw new Error('Set valid batch start and end dates before inviting students.');
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(input.feeStartMonth) || input.feeStartMonth < bounds.first || input.feeStartMonth > bounds.last) {
      throw new Error(`Choose a fee start month between ${bounds.first} and ${bounds.last}.`);
    }
    return { whatsappNumber, fee: { mode: 'MONTH_COVERAGE', feeStartMonth: input.feeStartMonth } };
  }
  if (!input.decision) throw new Error('Choose the fee plan before continuing.');
  if (input.decision !== 'SELECTED') {
    return { whatsappNumber, fee: { mode: 'CURRENT_DUE_BASED', decision: input.decision, installmentIds: [], applyFutureInstallments: false } };
  }
  const ids = [...new Set(input.installmentIds)];
  if (!ids.length) throw new Error('Select at least one installment, or choose no fee / decide later.');
  const amounts: Record<string, number> = {};
  for (const id of ids) {
    const installment = batch.feeInstallments.find(item => item.id === id && !item.studentId);
    if (!installment || !Number.isFinite(installment.amount) || installment.amount <= 0) {
      throw new Error('The fee plan changed. Refresh the batch and select the fees again.');
    }
    amounts[id] = installment.amount;
  }
  return { whatsappNumber, fee: { mode: 'CURRENT_DUE_BASED', decision: input.decision,
    installmentIds: ids, amounts, applyFutureInstallments: input.applyFutureInstallments } };
}
