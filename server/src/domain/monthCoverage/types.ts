export const DURATION_MONTHS = {
  MONTHLY: 1,
  QUARTERLY: 3,
  HALF_YEARLY: 6,
  YEARLY: 12,
} as const;

export type MonthCoverageDuration = keyof typeof DURATION_MONTHS;

export type MonthCoverageErrorCode =
  | 'INVALID_MONTH_FORMAT'
  | 'INVALID_MONTH_RANGE'
  | 'INVALID_TIMEZONE'
  | 'INVALID_DATE'
  | 'BATCH_DATES_REQUIRED'
  | 'INVALID_BATCH_DATE_RANGE'
  | 'FEE_MODE_MISMATCH'
  | 'ACTOR_NOT_AUTHORIZED'
  | 'STUDENT_NOT_FOUND'
  | 'BATCH_NOT_FOUND'
  | 'INSTITUTE_NOT_FOUND'
  | 'FEE_START_OUT_OF_RANGE'
  | 'PROFILE_NOT_FOUND'
  | 'PROFILE_CONTEXT_MISMATCH'
  | 'PROFILE_NOT_ACTIVE'
  | 'MONTH_ALREADY_COVERED'
  | 'INSUFFICIENT_REMAINING_MONTHS'
  | 'COVERAGE_START_OUT_OF_RANGE'
  | 'COVERAGE_GAP_REQUIRES_CONFIRMATION'
  | 'INVALID_AMOUNT'
  | 'INVALID_PAYMENT_DATE'
  | 'PAYMENT_NOT_FOUND';

export class MonthCoverageError extends Error {
  constructor(public readonly code: MonthCoverageErrorCode) {
    super(code);
    this.name = 'MonthCoverageError';
  }
}

export type CanonicalMonth = {
  year: number;
  month: number;
  ordinal: number;
};
