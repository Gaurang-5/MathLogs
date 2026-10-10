import { compareMonths, parseMonth } from '../domain/monthCoverage/calendar';
import type { EnrollmentFeeChoice } from '../domain/enrollments/types';

export type EnrollmentFeeContext = {
  instituteId: string;
  studentId: string;
  batchId: string;
};

export type EnrollmentRef = EnrollmentFeeContext & { id: string };

export type EnrollmentFeePreview =
  | { mode: 'MONTH_COVERAGE'; feeStartMonth: string }
  | { mode: 'CURRENT_DUE_BASED'; installmentIds: string[]; assignedAmount: number };

export type AppliedEnrollmentFees = EnrollmentFeePreview & { assignmentIds: string[] };

export type EnrollmentFeeDeps = {
  loadContext(input: EnrollmentFeeContext): Promise<{
    feeMode: 'MONTH_COVERAGE' | 'CURRENT_DUE_BASED';
    batchStartMonth: string | null;
    batchEndMonth: string | null;
    installments: Array<{ id: string; amount: number }>;
  } | null>;
  createMonthProfile(input: {
    enrollmentId: string;
    instituteId: string;
    batchId: string;
    studentId: string;
    feeStartMonth: string;
  }): Promise<void>;
  saveFeeDecision?(enrollmentId: string, decision: string, applyFutureInstallments: boolean): Promise<void>;
  assignInstallments(studentId: string, installmentIds: string[]): Promise<string[]>;
};

export async function previewEnrollmentFees(
  context: EnrollmentFeeContext,
  choice: EnrollmentFeeChoice,
  deps: EnrollmentFeeDeps,
): Promise<EnrollmentFeePreview> {
  const loaded = await deps.loadContext(context);
  if (!loaded) throw new Error('ENROLLMENT_FEE_CONTEXT_NOT_FOUND');
  if (loaded.feeMode !== choice.mode) throw new Error('FEE_MODE_MISMATCH');

  if (choice.mode === 'MONTH_COVERAGE') {
    parseMonth(choice.feeStartMonth);
    if (!loaded.batchStartMonth || !loaded.batchEndMonth) throw new Error('BATCH_DATES_REQUIRED');
    if (
      compareMonths(choice.feeStartMonth, loaded.batchStartMonth) < 0
      || compareMonths(choice.feeStartMonth, loaded.batchEndMonth) > 0
    ) {
      throw new Error('INVALID_FEE_START_MONTH');
    }
    return { mode: choice.mode, feeStartMonth: choice.feeStartMonth };
  }

  if (choice.decision === 'SELECTED' && choice.installmentIds.length === 0) throw new Error('SELECT_INSTALLMENTS_REQUIRED');
  if ((choice.decision === 'NO_FEE' || choice.decision === 'LATER') && (choice.installmentIds.length || choice.applyFutureInstallments)) throw new Error('INVALID_FEE_DECISION');
  const available = new Map(loaded.installments.map(item => [item.id, item]));
  const requested = [...new Set(choice.installmentIds)];
  if (requested.some(id => !available.has(id))) throw new Error('INVALID_INSTALLMENT_SELECTION');
  if (choice.amounts && requested.some(id => choice.amounts![id] !== available.get(id)!.amount)) throw new Error('FEE_AMOUNT_CHANGED_REFRESH_REQUIRED');
  return {
    mode: choice.mode,
    installmentIds: requested,
    assignedAmount: requested.reduce((sum, id) => sum + available.get(id)!.amount, 0),
  };
}

export async function applyEnrollmentFees(
  enrollment: EnrollmentRef,
  choice: EnrollmentFeeChoice,
  deps: EnrollmentFeeDeps,
): Promise<AppliedEnrollmentFees> {
  const preview = await previewEnrollmentFees(enrollment, choice, deps);
  if (preview.mode === 'MONTH_COVERAGE') {
    await deps.createMonthProfile({
      enrollmentId: enrollment.id,
      instituteId: enrollment.instituteId,
      batchId: enrollment.batchId,
      studentId: enrollment.studentId,
      feeStartMonth: preview.feeStartMonth,
    });
    return { ...preview, assignmentIds: [] };
  }

  if (choice.mode === 'CURRENT_DUE_BASED') {
    await deps.saveFeeDecision?.(enrollment.id, choice.decision || (choice.installmentIds.length ? 'SELECTED' : 'LATER'), choice.applyFutureInstallments === true);
  }
  const assignmentIds = await deps.assignInstallments(enrollment.studentId, preview.installmentIds);
  return { ...preview, assignmentIds };
}
