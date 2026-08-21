import { API_URL, api } from '../../utils/api';
import type {
  MonthCoveragePaymentInput,
  MonthCoveragePaymentResult,
  MonthCoveragePreview,
  MonthCoveragePreviewInput,
  MonthCoverageProfile,
  MonthCoverageSummary,
} from './types';

export const monthCoverageKeys = {
  all: ['monthCoverage'] as const,
  summary: (filters: { batchId?: string; status?: string } = {}) => [...monthCoverageKeys.all, 'summary', filters] as const,
  recent: () => [...monthCoverageKeys.all, 'recent'] as const,
  student: (studentId: string) => [...monthCoverageKeys.all, 'student', studentId] as const,
};

function queryString(values: Record<string, string | undefined>): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(values)) if (value) params.set(key, value);
  const query = params.toString();
  return query ? `?${query}` : '';
}

export function createPaymentAttemptId(): string {
  return crypto.randomUUID();
}

export function loadMonthCoverageSummary(filters: { batchId?: string; status?: string } = {}) {
  return api.get<MonthCoverageSummary>(`/month-coverage/summary${queryString(filters)}`);
}

export function previewMonthCoveragePayment(input: MonthCoveragePreviewInput) {
  return api.post<MonthCoveragePreview>('/month-coverage/payments/preview', input);
}

export async function createMonthCoveragePayment(input: MonthCoveragePaymentInput, idempotencyKey: string) {
  const preview = await previewMonthCoveragePayment(input);
  const result = await api.post<MonthCoveragePaymentResult>('/month-coverage/payments', input, {
    headers: { 'Idempotency-Key': idempotencyKey },
  });
  return { preview, result };
}

export async function updateMonthCoveragePayment(
  paymentId: string,
  input: MonthCoveragePaymentInput & { reason?: string },
) {
  const preview = await previewMonthCoveragePayment(input);
  const result = await api.put<MonthCoveragePaymentResult>(`/month-coverage/payments/${paymentId}`, input);
  return { preview, result };
}

export function confirmStudentFeeProfile(studentId: string, feeStartMonth: string) {
  return api.put<{ profile: MonthCoverageProfile; warning: 'BACKDATED_BEFORE_JOIN' | null }>(
    `/month-coverage/students/${studentId}/profile`,
    { feeStartMonth },
  );
}

export function previewVoidPayment(paymentId: string) {
  return api.get<{ paymentId: string; amountRupees: number; reopenedMonths: string[] }>(
    `/month-coverage/payments/${paymentId}/void-preview`,
  );
}

export function voidPayment(paymentId: string, reason?: string) {
  return api.delete(`/month-coverage/payments/${paymentId}`, { reason });
}

export function sendMonthCoverageReminders(input: { batchId?: string; studentIds?: string[] }) {
  return api.post<{ queued: number; skipped: number }>('/month-coverage/reminders', input);
}

export function scanMonthCoverageReceipt(image: File) {
  const form = new FormData();
  form.append('image', image);
  return api.post<{ amount?: number; date?: string; confidence?: number }>('/month-coverage/scan-receipt', form);
}

export const monthCoverageReportUrl = {
  pending: (batchId?: string) => `${API_URL}/month-coverage/reports/pending${queryString({ batchId })}`,
  transactions: (month: number, year: number) => `${API_URL}/month-coverage/reports/transactions?month=${month}&year=${year}`,
};
