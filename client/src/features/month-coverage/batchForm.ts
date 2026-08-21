import type { CoachingFeeMode } from './types';

export type BatchFormValues = {
  customName: string;
  subject: string;
  timeSlot: string;
  className: string;
  startDate: string;
  endDate: string;
};

export type CreateBatchPayload = {
  customName: string;
  subject: string;
  timeSlot: string;
  feeAmount: number;
  className?: string;
  startDate?: string;
  endDate?: string;
};

export function buildCreateBatchPayload(
  values: BatchFormValues,
  feeMode: CoachingFeeMode,
  requiresGrades: boolean,
): CreateBatchPayload {
  return {
    customName: values.customName,
    subject: values.subject,
    timeSlot: values.timeSlot,
    feeAmount: 0,
    ...(requiresGrades ? { className: values.className } : {}),
    ...(feeMode === 'MONTH_COVERAGE' ? {
      startDate: `${values.startDate}T00:00:00.000Z`,
      endDate: `${values.endDate}T23:59:59.999Z`,
    } : {}),
  };
}
