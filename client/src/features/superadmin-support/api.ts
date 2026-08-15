import { apiRequest } from '../../utils/api';
import type { InternalCase, SupportStatus, SupportTicket } from './types';

type Method = 'GET' | 'POST' | 'PATCH';
type Envelope<T> = { success: boolean; data: T; error?: string; message?: string };

async function request<T>(path: string, method: Method = 'GET', body?: unknown, headers?: Record<string, string>) {
  const response = await apiRequest<Envelope<T>>(path, method, body, { headers });
  if (!response.success) throw new Error(response.error || response.message || 'Support request failed');
  return response.data;
}

function query(values: Record<string, string | undefined>) {
  const params = new URLSearchParams();
  Object.entries(values).forEach(([key, value]) => { if (value) params.set(key, value); });
  return params.size ? `?${params.toString()}` : '';
}

export const superAdminSupportApi = {
  tickets: (filters: { q?: string; status?: string; priority?: string; category?: string; instituteId?: string }) => request<SupportTicket[]>(`/super-admin/support/tickets${query(filters)}`),
  ticket: (id: string) => request<SupportTicket>(`/super-admin/support/tickets/${id}`),
  reply: (id: string, value: { visibility: 'PUBLIC' | 'INTERNAL'; body: string; expectedUpdatedAt: string }) => request<SupportTicket>(`/super-admin/support/tickets/${id}/messages`, 'POST', value),
  transition: (id: string, value: { status: SupportStatus; resolutionSummary?: string; expectedUpdatedAt: string }) => request<SupportTicket>(`/super-admin/support/tickets/${id}/status`, 'PATCH', value),
  cases: (filters: { instituteId?: string; status?: string } = {}) => request<InternalCase[]>(`/super-admin/support/cases${query(filters)}`),
  createCase: (value: { instituteId: string; title: string; category: string; priority: SupportPriority; followUpAt?: string; linkedType?: string; linkedId?: string }) => request<InternalCase>('/super-admin/support/cases', 'POST', value),
  addCaseNote: (id: string, body: string) => request(`/super-admin/support/cases/${id}/notes`, 'POST', { body }),
  startSession: (value: { instituteId: string; ticketId?: string; caseId?: string; reason: string }, challengeId: string) => request<{ session: { id: string; expiresAt: string }; supportToken: string }>('/super-admin/support-sessions', 'POST', value, { 'X-Superadmin-Challenge': challengeId })
};

export const instituteSupportApi = {
  tickets: () => request<SupportTicket[]>('/support/tickets'),
  ticket: (id: string) => request<SupportTicket>(`/support/tickets/${id}`),
  create: (value: { category: string; subject: string; description: string; priority: SupportPriority }) => request<SupportTicket>('/support/tickets', 'POST', value),
  reply: (id: string, value: { body: string; expectedUpdatedAt: string }) => request<SupportTicket>(`/support/tickets/${id}/messages`, 'POST', value)
};
