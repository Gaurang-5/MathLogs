import { ApiRequestError, apiRequest } from '../../utils/api';
import type { InstituteDirectoryResponse, InstituteWorkspaceData, OnboardingInput } from './types';

type Envelope<T> = { success: boolean; data: T; error?: string; message?: string; replay?: boolean };

async function request<T>(path: string, method: 'GET' | 'POST' | 'PATCH' = 'GET', body?: unknown, headers?: Record<string, string>) {
  const response = await apiRequest<Envelope<T>>(path, method, body, { headers });
  if (!response.success) throw new Error(response.error || response.message || 'Institute request failed');
  return response.data;
}

export class InstituteConflictError extends Error {
  constructor(public latest: InstituteWorkspaceData['overview']) { super('This institute was changed by another operation.'); }
}

const query = (values: Record<string, string | number | undefined>) => {
  const params = new URLSearchParams();
  Object.entries(values).forEach(([key, value]) => { if (value !== undefined && value !== '') params.set(key, String(value)); });
  return params.toString() ? `?${params}` : '';
};

export const superAdminInstituteApi = {
  list: (filters: { q?: string; status?: string; plan?: string; page?: number; pageSize?: number }) => request<InstituteDirectoryResponse>(`/super-admin/institutes${query(filters)}`),
  get: (id: string) => request<InstituteWorkspaceData>(`/super-admin/institutes/${id}`),
  updateDetails: async (id: string, value: Record<string, unknown>) => {
    try { return await request<InstituteWorkspaceData['overview']>(`/super-admin/institutes/${id}/details`, 'PATCH', value); }
    catch (error) {
      if (error instanceof ApiRequestError && error.status === 409) {
        const response = error.response as Envelope<InstituteWorkspaceData['overview']>;
        if (response.data) throw new InstituteConflictError(response.data);
      }
      throw error;
    }
  },
  updateConfiguration: (id: string, value: Record<string, unknown>) => request<InstituteWorkspaceData['usage'] & { updatedAt: string }>(`/super-admin/institutes/${id}/configuration`, 'PATCH', value),
  previewOnboarding: (value: OnboardingInput) => request<{ valid: boolean; errors: unknown[]; summary: unknown }>('/super-admin/institutes/onboarding/preview', 'POST', value),
  commitOnboarding: (value: OnboardingInput, idempotencyKey: string) => request<{ instituteId: string; name: string; status: string }>('/super-admin/institutes/onboarding/commit', 'POST', value, { 'Idempotency-Key': idempotencyKey })
};
