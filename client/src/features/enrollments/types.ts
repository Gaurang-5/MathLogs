export type EnrollmentFeeChoice =
  | { mode: 'MONTH_COVERAGE'; feeStartMonth: string }
  | { mode: 'CURRENT_DUE_BASED'; installmentIds: string[]; decision?: 'SELECTED' | 'NO_FEE' | 'LATER'; applyFutureInstallments?: boolean; amounts?: Record<string, number> };

export type EnrollmentCandidate = {
  studentId: string;
  humanId: string | null;
  name: string;
  parentName: string;
  parentWhatsapp: string;
  schoolName: string | null;
  currentBatches: Array<{ id: string; name: string }>;
  previousBatches: Array<{ id: string; name: string }>;
  balance: number;
  matchReasons: string[];
};

export type EnrollmentResult = {
  outcome: 'CREATED' | 'REENROLLED' | 'ALREADY_ENROLLED';
  enrollmentId: string;
  notification?: { status: 'QUEUED' | 'ALREADY_QUEUED' | 'FAILED_RETRYABLE'; eventKey: string };
};

export type EnrollmentBatch = {
  id: string;
  name: string;
  coachingFeeMode?: 'MONTH_COVERAGE' | 'CURRENT_DUE_BASED';
  startDate?: string | null;
  endDate?: string | null;
  feeInstallments: Array<{ id: string; name: string; amount: number; studentId?: string | null }>;
};
