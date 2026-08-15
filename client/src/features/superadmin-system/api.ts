import { apiRequest } from '../../utils/api';

type Envelope<T> = { success: boolean; data: T; error?: string; message?: string };
type Method = 'GET' | 'POST';
async function request<T>(path: string, method: Method = 'GET', body?: unknown, headers?: Record<string, string>) { const response = await apiRequest<Envelope<T>>(path, method, body, { headers }); if (!response.success) throw new Error(response.error || response.message || 'System request failed'); return response.data; }
const query = (values: Record<string, string | undefined>) => { const params = new URLSearchParams(); Object.entries(values).forEach(([key, value]) => { if (value) params.set(key, value); }); return params.size ? `?${params}` : ''; };

export type SystemOverview = { status: 'HEALTHY' | 'DEGRADED'; database: { status: string; latencyMs: number }; jobs: { email: Record<string, number>; whatsapp: Record<string, number>; failedTotal: number }; security: { authFailures24h: number; activeAdminSessions: number; activeSupportSessions: number }; operations: { pendingBillingOperations: number }; configuration: Record<'jwt' | 'email' | 'whatsapp' | 'razorpay' | 'gemini', boolean> };
export type SystemJob = { id: string; kind: 'EMAIL' | 'WHATSAPP'; status: string; destinationMasked: string; label: string; attempts: number; maxAttempts: number; error: string | null; entityType: string | null; entityId: string | null; instituteId: string | null; createdAt: string; updatedAt: string };
export type AuditItem = { id: string; action: string; entityType: string; entityId: string | null; instituteId: string | null; reason: string | null; correlationId: string | null; source: 'SUPER_ADMIN' | 'MARKETPLACE'; createdAt: string; actorAdmin: { id: string; username: string } };
export type SystemSecurity = { sessions: Array<{ id: string; deviceLabel: string | null; lastSeenAt: string; expiresAt: string; revokedAt: string | null; createdAt: string; admin: { id: string; username: string } }>; events: Array<{ id: string; eventType: string; success: boolean; deviceLabel: string | null; metadata: unknown; createdAt: string; admin: { id: string; username: string } | null }> };

export const superAdminSystemApi = {
  overview: () => request<SystemOverview>('/super-admin/system/overview'),
  jobs: (filters: { kind?: string; status?: string; q?: string }) => request<SystemJob[]>(`/super-admin/system/jobs${query(filters)}`),
  retry: (job: SystemJob, reason: string, idempotencyKey: string) => request<{ id: string; status: string }>(`/super-admin/system/jobs/${job.kind}/${job.id}/retry`, 'POST', { reason }, { 'Idempotency-Key': idempotencyKey }),
  audit: (filters: { q?: string; instituteId?: string }) => request<AuditItem[]>(`/super-admin/system/audit${query(filters)}`),
  security: () => request<SystemSecurity>('/super-admin/system/security'),
  revokeSession: (id: string, reason: string, challengeId: string) => request(`/super-admin/system/sessions/${id}/revoke`, 'POST', { reason }, { 'X-Superadmin-Challenge': challengeId })
};
