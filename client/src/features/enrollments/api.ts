import { api } from '../../utils/api';
import type { EnrollmentCandidate, EnrollmentFeeChoice, EnrollmentResult } from './types';

type ApiResult<T> = { success: boolean; data: T };

export async function searchEnrollmentCandidates(batchId: string, query: string) {
  const response = await api.get<ApiResult<EnrollmentCandidate[]>>(
    `/batches/${batchId}/enrollment-candidates?q=${encodeURIComponent(query)}`,
  );
  return response.data;
}

export async function previewEnrollment(batchId: string, studentId: string, startedAt: string, fee: EnrollmentFeeChoice) {
  const response = await api.post<ApiResult<unknown>>(`/batches/${batchId}/enrollments/preview`, { studentId, startedAt, fee });
  return response.data;
}

export async function enrollExisting(batchId: string, studentId: string, startedAt: string, fee: EnrollmentFeeChoice) {
  const response = await api.post<ApiResult<EnrollmentResult>>(`/batches/${batchId}/enrollments`, {
    studentId, startedAt, fee, idempotencyKey: crypto.randomUUID(),
  });
  return response.data;
}

export async function sendRegistrationInvite(batchId: string, whatsappNumber: string, fee: EnrollmentFeeChoice) {
  return api.post(`/batches/${batchId}/invite`, { whatsappNumber, fee });
}

export async function endEnrollment(batchId: string, enrollmentId: string, reason: string, idempotencyKey = crypto.randomUUID()) {
  const response = await api.delete<ApiResult<EnrollmentResult>>(`/batches/${batchId}/enrollments/${enrollmentId}`, {
    reason, idempotencyKey,
  });
  return response.data;
}

export async function resendEnrollmentNotification(enrollmentId: string) {
  return api.post(`/enrollments/${enrollmentId}/notification/resend`, { idempotencyKey: crypto.randomUUID() });
}

export async function listIdentityReviews() {
  const response = await api.get<ApiResult<any[]>>('/identity-reviews');
  return response.data;
}

export async function resolveIdentityReview(reviewId: string, action: 'USE_EXISTING' | 'CREATE_NEW', studentId: string | undefined, fee: EnrollmentFeeChoice) {
  const response = await api.post<ApiResult<EnrollmentResult>>(`/identity-reviews/${reviewId}/resolve`, {
    action, studentId, fee, startedAt: new Date().toISOString(), idempotencyKey: crypto.randomUUID(),
  });
  return response.data;
}
