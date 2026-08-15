import { apiRequest } from '../../utils/api';
import type { InstituteSearchResult, SuperAdminActionClass, SuperAdminHomeData } from './types';

type Envelope<T> = { success: boolean; data: T; error?: string; message?: string };

async function request<T>(path: string, method: 'GET' | 'POST' = 'GET', body?: unknown, headers?: Record<string, string>): Promise<T> {
  const response = await apiRequest<Envelope<T>>(path, method, body, { headers });
  if (!response.success) throw new Error(response.error || response.message || 'Superadmin request failed');
  return response.data;
}

export const superAdminShellApi = {
  home: () => request<SuperAdminHomeData>('/super-admin/home'),
  search: (query: string) => request<InstituteSearchResult[]>(`/super-admin/search?q=${encodeURIComponent(query)}`),
  sendReauth: (actionClass: SuperAdminActionClass) => request<{
    challengeId: string;
    expiresAt: string;
    deliveryChannel: 'EMAIL' | 'WHATSAPP';
    destinationMasked: string;
  }>('/super-admin/security/reauth/send', 'POST', { actionClass }),
  verifyReauth: (challengeId: string, otp: string) => request<{ challengeId: string }>(
    '/super-admin/security/reauth/verify', 'POST', { challengeId, otp }
  )
};
