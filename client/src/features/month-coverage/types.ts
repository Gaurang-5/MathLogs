export type CoachingFeeMode = 'CURRENT_DUE_BASED' | 'MONTH_COVERAGE';
export type MonthCoverageDuration = 'MONTHLY' | 'QUARTERLY' | 'HALF_YEARLY' | 'YEARLY';
export type MonthCoverageProfileStatus = 'PENDING_SETUP' | 'ACTIVE' | 'CLOSED';
export type MonthCoveragePaymentStatus = 'ACTIVE' | 'VOID';
export type MonthCoveragePaymentMethod = 'CASH' | 'UPI' | 'BANK' | 'CARD' | 'OTHER';

export type MonthCoveragePreview = {
  studentId: string;
  duration: MonthCoverageDuration;
  monthCount: number;
  coverageMonths: string[];
  oldestPendingMonth: string;
  gapWarning: { skippedMonths: string[] } | null;
  remainingMonthsAfterPayment: number;
};

export type MonthCoverageStudentSummary = {
  studentId: string;
  name: string;
  humanId?: string | null;
  parentWhatsapp?: string | null;
  batchId: string;
  batchName: string;
  setupRequired: boolean;
  feeStartMonth: string | null;
  feeEndMonth: string | null;
  applicableMonths: number;
  receivedMonths: number;
  pendingMonths: number;
  overdueMonths: number;
  nextPendingMonth: string | null;
  oldestOverdueMonth: string | null;
  progressPercent: number;
};

export type MonthCoveragePayment = {
  id: string;
  studentId: string;
  amount: number;
  paymentDate: string;
  paymentMethod: MonthCoveragePaymentMethod;
  duration: MonthCoverageDuration;
  note: string | null;
  status: MonthCoveragePaymentStatus;
  coverageMonths?: string[];
};

export type MonthCoveragePaymentSummary = {
  id: string;
  studentId: string;
  studentName: string;
  batchName: string;
  amountRupees: number;
  paymentDate: string;
  duration: MonthCoverageDuration;
  coverageMonths: string[];
  paymentMethod?: string;
  status?: 'ACTIVE';
  actorName?: string;
};

export type MonthCoverageSummary = {
  feeMode: 'MONTH_COVERAGE';
  totals: {
    collectedRupees: number;
    receivedMonths: number;
    pendingMonths: number;
    overdueMonths: number;
    applicableMonths: number;
    progressPercent: number;
  };
  students: MonthCoverageStudentSummary[];
  recentPayments: MonthCoveragePaymentSummary[];
};

export type MonthCoveragePaymentInput = {
  studentId: string;
  amount: number;
  paymentDate: string;
  paymentMethod: MonthCoveragePaymentMethod;
  duration: MonthCoverageDuration;
  requestedStartMonth: string | null;
  allowGap: boolean;
  note?: string;
};

export type MonthCoveragePreviewInput = Pick<
  MonthCoveragePaymentInput,
  'studentId' | 'duration' | 'requestedStartMonth' | 'allowGap'
>;

export type MonthCoveragePaymentResult = {
  payment: MonthCoveragePayment;
  coverageMonths: string[];
  preview: MonthCoveragePreview | null;
  idempotent: boolean;
};

export type MonthCoverageProfile = {
  id: string;
  studentId: string;
  batchId: string;
  feeStartMonth: string | null;
  feeEndMonth: string | null;
  status: MonthCoverageProfileStatus;
};
