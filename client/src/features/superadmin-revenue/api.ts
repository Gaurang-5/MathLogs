import { apiRequest } from '../../utils/api';
import type { AutoPayBillingHistory, BillingOperation, BillingOperationDraft, BillingPreview, RevenueOverviewData, SubscriptionResponse } from './types';

type Envelope<T> = { success: boolean; data: T; error?: string; message?: string; replay?: boolean };
async function request<T>(path: string, method: 'GET' | 'POST' = 'GET', body?: unknown, headers?: Record<string, string>) {
  const response = await apiRequest<Envelope<T>>(path, method, body, { headers });
  if (!response.success) throw new Error(response.error || response.message || 'Revenue request failed');
  return response.data;
}

const query = (values: Record<string, string | number | undefined>) => { const params = new URLSearchParams(); Object.entries(values).forEach(([key, value]) => { if (value !== undefined && value !== '') params.set(key, String(value)); }); return params.toString() ? `?${params}` : ''; };

export const superAdminRevenueApi = {
  overview: () => request<RevenueOverviewData>('/super-admin/revenue/overview'),
  subscriptions: (filters: { q?: string; plan?: string; page?: number; pageSize?: number }) => request<SubscriptionResponse>(`/super-admin/revenue/subscriptions${query(filters)}`),
  preview: (instituteId: string, draft: BillingOperationDraft) => request<BillingPreview>(`/super-admin/institutes/${instituteId}/billing-operations/preview`, 'POST', draft),
  apply: (instituteId: string, draft: BillingOperationDraft, idempotencyKey: string, challengeId?: string) => request<BillingOperation>(`/super-admin/institutes/${instituteId}/billing-operations`, 'POST', draft, { 'Idempotency-Key': idempotencyKey, ...(challengeId ? { 'X-Superadmin-Challenge': challengeId } : {}) }),
  history: (instituteId: string) => request<AutoPayBillingHistory>(`/super-admin/institutes/${instituteId}/billing-history`)
};
