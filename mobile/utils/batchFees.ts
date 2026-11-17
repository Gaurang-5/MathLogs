import { isBatchInstallmentApplicable, monthInBatchTimezone, type BatchFeeInstallment, type BatchFeeStudent } from './batchInsights';

export interface FeeRosterStudent extends BatchFeeStudent {
  enrollmentId?: string;
  fees?: Array<{ amount: number; status: string }>;
  monthCoverageProfile?: { status?: string; feeStartMonth?: string | null; feeEndMonth?: string | null } | null;
}
export interface PaymentOption { id: string; amount: number; paid: number; remaining: number }
export interface CoverageSource {
  id: string;
  enrollments: Array<{
    id: string; status: string; batch: { id: string };
    monthCoverageProfile?: { status?: string; feeStartMonth?: string | null; feeEndMonth?: string | null } | null;
  }>;
  monthCoverageAllocations: Array<{ enrollmentId: string; coverageMonth: string; payment: { status: string } }>;
}
export interface RosterFeeStatus {
  status: 'paid' | 'pending' | 'no-fee' | 'setup' | 'unavailable' | 'not-started' | 'closed';
  title: string;
  detail: string;
  // These are rupees for installment mode, and months for coverage mode.
  expected: number;
  received: number;
  outstanding: number;
  items?: Array<{
    id: string;
    label: string;
    status: 'paid' | 'partial' | 'pending';
    amount: number;
    received: number;
    remaining: number;
  }>;
}

const money = (value: number) => `₹${value.toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;
const paise = (value: number) => Number.isFinite(value) && value >= 0 && Number.isSafeInteger(Math.round(value * 100)) ? Math.round(value * 100) : null;
const state = (status: RosterFeeStatus['status'], title: string, detail: string): RosterFeeStatus =>
  ({ status, title, detail, expected: 0, received: 0, outstanding: 0 });
export const unavailableFeeStatus = (detail = 'Refresh to load the fee status for this batch.') =>
  state('unavailable', 'Fee status unavailable', detail);
export const hasUnlinkedReceipts = (student: FeeRosterStudent) =>
  student.fees?.some(receipt => receipt.status === 'PAID' && receipt.amount > 0) ?? false;

/** Statuses supported by the batch response need no extra network request.
 * Undefined means this particular student needs an authoritative lookup. */
export function immediateBatchFeeStatus(student: FeeRosterStudent, mode: 'CURRENT_DUE_BASED' | 'MONTH_COVERAGE',
  installments: BatchFeeInstallment[], legacyBatchFee: number): RosterFeeStatus | undefined {
  if (mode === 'MONTH_COVERAGE') {
    const plan = student.monthCoverageProfile;
    // An omitted field can mean an older response. Resolve it from the profile endpoint.
    if (plan === undefined) return undefined;
    if (plan?.status === 'CLOSED') return state('closed', 'Fee coverage closed', 'Review this enrollment in Fee setup.');
    if (!plan || plan.status === 'PENDING_SETUP' || !plan.feeStartMonth || !plan.feeEndMonth) return state('setup', 'Fee setup pending', 'Confirm the first fee month.');
    return undefined;
  }
  if (hasUnlinkedReceipts(student) && installments.some(item => isBatchInstallmentApplicable(student, item))) return undefined;
  return installmentFeeStatus(student, installments, legacyBatchFee);
}

/** The payment-options endpoint allocates legacy receipts across all enrollments.
 * Never allocate those receipts again using only the current batch's records. */
export function installmentFeeStatus(student: FeeRosterStudent, installments: BatchFeeInstallment[], legacyBatchFee: number,
  options?: PaymentOption[]): RosterFeeStatus {
  const applicable = [...new Map(installments.filter(item => isBatchInstallmentApplicable(student, item)).map(item => [item.id, item])).values()];
  if (!applicable.length) {
    if (student.feeDecision === 'NO_FEE') return state('no-fee', 'No fee assigned', 'No fee is due for this enrollment.');
    if (student.feeDecision === 'LATER' || student.feeDecision === 'SELECTED') return state('setup', 'Fee setup pending', 'Confirm the student’s fee plan.');
    if (legacyBatchFee > 0) return unavailableFeeStatus('Legacy balance needs review in Fees.');
    return state('setup', 'Fee setup pending', 'Assign a fee plan or confirm no fee.');
  }
  const useOptions = hasUnlinkedReceipts(student);
  if (useOptions && !options) return unavailableFeeStatus('Checking previous receipts against this batch.');
  let expected = 0, received = 0;
  const items: NonNullable<RosterFeeStatus['items']> = [];
  for (const installment of applicable) {
    const amount = paise(installment.amount);
    if (amount === null) return unavailableFeeStatus('The fee plan needs review.');
    expected += amount;
    let installmentPaid = 0;
    if (useOptions) {
      const option = options?.find(item => item.id === installment.id);
      const remaining = option && paise(option.remaining);
      if (!option || paise(option.amount) !== amount || remaining === null || remaining === undefined || remaining > amount) {
        return unavailableFeeStatus('The fee plan changed. Refresh before collecting payment.');
      }
      installmentPaid = amount - remaining;
    } else {
      let paid = 0;
      for (const payment of student.feePayments || []) {
        if (payment.installmentId !== installment.id) continue;
        const value = paise(payment.amountPaid);
        if (value === null) return unavailableFeeStatus('A payment record needs review.');
        paid += value;
      }
      installmentPaid = Math.min(amount, paid);
    }
    received += installmentPaid;
    items.push({ id: installment.id, label: installment.name || 'Fee installment',
      status: installmentPaid >= amount ? 'paid' : installmentPaid > 0 ? 'partial' : 'pending',
      amount: amount / 100, received: installmentPaid / 100, remaining: (amount - installmentPaid) / 100 });
  }
  const outstanding = Math.max(0, expected - received);
  return {
    status: outstanding > 0 ? 'pending' : 'paid',
    title: outstanding > 0 ? `${money(outstanding / 100)} pending` : 'Fees paid',
    detail: `${money(received / 100)} paid of ${money(expected / 100)}`,
    expected: expected / 100, received: received / 100, outstanding: outstanding / 100, items,
  };
}

function monthIndex(month: string): number | null {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) return null;
  const [year, number] = month.split('-').map(Number);
  return year * 12 + number - 1;
}

export function coverageFeeStatus(student: FeeRosterStudent, batchId: string, profile: CoverageSource,
  timezone: string, now = new Date()): RosterFeeStatus {
  if (!profile || profile.id !== student.id || !Array.isArray(profile.enrollments) || !Array.isArray(profile.monthCoverageAllocations)) return unavailableFeeStatus();
  const enrollment = profile.enrollments.find(item => item?.batch?.id === batchId && item.status === 'ACTIVE'
    && (!student.enrollmentId || item.id === student.enrollmentId));
  if (!enrollment) return unavailableFeeStatus('This enrollment changed. Refresh the batch.');
  const plan = enrollment.monthCoverageProfile;
  if (plan?.status === 'CLOSED') return state('closed', 'Fee coverage closed', 'Review this enrollment in Fee setup.');
  if (!plan || plan.status === 'PENDING_SETUP' || !plan.feeStartMonth || !plan.feeEndMonth) return state('setup', 'Fee setup pending', 'Confirm the first fee month.');
  const first = monthIndex(plan.feeStartMonth), last = monthIndex(plan.feeEndMonth);
  const currentMonth = monthInBatchTimezone(now, timezone);
  const current = currentMonth ? monthIndex(currentMonth) : null;
  if (first === null || last === null || current === null || first > last || last - first > 1200) return unavailableFeeStatus('Coverage dates need review.');
  const covered = new Set(profile.monthCoverageAllocations
    .filter(item => item?.enrollmentId === enrollment.id && item.payment?.status === 'ACTIVE')
    .map(item => monthIndex(item.coverageMonth)).filter((value): value is number => value !== null && value >= first && value <= last));
  const expected = last - first + 1;
  let overdue = 0;
  for (let month = first; month <= Math.min(current, last); month++) if (!covered.has(month)) overdue++;
  const monthName = new Intl.DateTimeFormat('en', { month: 'long', timeZone: timezone }).format(now);
  const title = current < first ? 'Fees start later'
    : current > last ? overdue ? `${overdue} ${overdue === 1 ? 'month' : 'months'} pending` : 'Coverage paid'
      : `${monthName} ${covered.has(current) ? 'paid' : 'pending'}`;
  return {
    status: current < first ? 'not-started' : overdue > 0 ? 'pending' : 'paid', title,
    detail: `${covered.size} of ${expected} months paid${overdue ? ` · ${overdue} overdue` : current < first ? ` · Starts ${plan.feeStartMonth}` : ''}`,
    expected, received: covered.size, outstanding: expected - covered.size,
  };
}

export function summarizeBatchFees(rows: RosterFeeStatus[]) {
  const unavailable = rows.filter(row => row.status === 'unavailable').length;
  const setup = rows.filter(row => row.status === 'setup').length;
  const expected = rows.reduce((total, row) => total + row.expected, 0);
  const received = rows.reduce((total, row) => total + row.received, 0);
  return { expected, received, setup, unavailable,
    percent: unavailable || expected <= 0 ? null : Math.min(100, Math.round(received / expected * 100)) };
}
