import { apiRequest } from '../../utils/api';

type Method = 'GET' | 'POST' | 'PATCH';
type Envelope<T> = { success: boolean; data: T; error?: string; message?: string };
async function request<T>(path: string, method: Method = 'GET', body?: unknown, headers?: Record<string, string>) { const response = await apiRequest<Envelope<T>>(path, method, body, { headers }); if (!response.success) throw new Error(response.error || response.message || 'Communication request failed'); return response.data; }

export type CommunicationTemplate = { name: string; channel: 'EMAIL' | 'WHATSAPP'; label: string; configured: boolean };
export type CommunicationDraft = { channel: 'EMAIL' | 'WHATSAPP'; templateName: string; reason: string; audience: { instituteIds?: string[]; status?: string; plan?: string; city?: string; ownershipStatus?: string } };
export type CommunicationPreview = CommunicationDraft & { includedCount: number; excludedCount: number; recipients: Array<{ instituteId: string; instituteName: string; ownerName: string | null; destinationMasked: string | null; included: boolean; exclusionReason: string | null }> };
export type CommunicationHistory = { id: string; channel: string; templateName: string; reason: string; status: string; includedCount: number; excludedCount: number; dispatchedAt: string | null; createdAt: string; createdByAdmin: { username: string } };
export type CommunicationPreference = { instituteId: string; whatsappOperational: boolean; whatsappConsentedAt: string | null; emailOperational: boolean; emailConsentedAt: string | null; consentSource: string | null; updatedAt: string };

export const superAdminCommunicationApi = {
  templates: () => request<CommunicationTemplate[]>('/super-admin/communications/templates'),
  preview: (draft: CommunicationDraft) => request<CommunicationPreview>('/super-admin/communications/preview', 'POST', draft),
  dispatch: (draft: CommunicationDraft, challengeId: string, idempotencyKey: string) => request<{ id: string; includedCount: number; excludedCount: number; dispatchedAt: string }>('/super-admin/communications/dispatch', 'POST', draft, { 'X-Superadmin-Challenge': challengeId, 'Idempotency-Key': idempotencyKey }),
  history: () => request<CommunicationHistory[]>('/super-admin/communications/history')
};

export const instituteCommunicationApi = {
  get: () => request<CommunicationPreference>('/communication-preferences'),
  update: (value: { emailOperational: boolean; whatsappOperational: boolean }) => request<CommunicationPreference>('/communication-preferences', 'PATCH', value)
};
