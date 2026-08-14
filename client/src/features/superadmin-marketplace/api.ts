import { apiRequest } from '../../utils/api';
import type {
  ListingUpdateInput, MarketplaceActivity, MarketplaceClaim, MarketplaceLead, MarketplaceListing,
  MarketplaceListingDetail, MarketplaceOverview, MarketplaceReview, ReviewStatus,
} from './types';

interface Envelope<T> { success?: boolean; data?: T; message?: string; }

const unwrap = <T>(response: Envelope<T> | T): T => {
  if (response && typeof response === 'object' && 'data' in response) {
    const envelope = response as Envelope<T>;
    if (envelope.success === false) throw new Error(envelope.message || 'Marketplace request failed');
    return envelope.data as T;
  }
  return response as T;
};

const request = async <T>(path: string, method: 'GET' | 'POST' | 'PATCH' = 'GET', body?: unknown) =>
  unwrap<T>(await apiRequest<Envelope<T>>(path, method, body));

const query = (values: Record<string, string | undefined>) => {
  const search = new URLSearchParams();
  Object.entries(values).forEach(([key, value]) => { if (value) search.set(key, value); });
  const result = search.toString();
  return result ? `?${result}` : '';
};

const collection = <T>(value: unknown, key: string): T[] => Array.isArray(value)
  ? value as T[]
  : Array.isArray((value as Record<string, unknown> | null)?.[key]) ? (value as Record<string, T[]>)[key]
    : [];

export const marketplaceApi = {
  getOverview: async (): Promise<MarketplaceOverview> => {
    const data = await request<MarketplaceOverview & { listings?: MarketplaceListing[] }>('/marketplace/super-admin/overview');
    return { metrics: data.metrics, incompleteListings: data.incompleteListings || data.listings || [], recentActivity: data.recentActivity || [] };
  },
  getListings: async (filters: { query?: string; filter?: string } = {}) => collection<MarketplaceListing>(await request<unknown>(`/marketplace/super-admin/listings${query(filters)}`), 'listings'),
  getListing: (id: string) => request<MarketplaceListingDetail>(`/marketplace/super-admin/listings/${id}`),
  updateListing: (id: string, values: ListingUpdateInput) => request<MarketplaceListingDetail>(`/marketplace/super-admin/listings/${id}`, 'PATCH', values),
  getClaims: async (filters: { status?: string; query?: string } = {}) => collection<MarketplaceClaim>(await request<unknown>(`/marketplace/super-admin/claims${query(filters)}`), 'claims'),
  getClaim: (id: string) => request<MarketplaceClaim>(`/marketplace/super-admin/claims/${id}`),
  contactClaim: (id: string) => request<MarketplaceClaim>(`/marketplace/super-admin/claims/${id}/contacted`, 'PATCH'),
  approveClaim: (id: string, verificationNote: string) => request<MarketplaceClaim>(`/marketplace/super-admin/claims/${id}/approve`, 'POST', { verificationNote }),
  rejectClaim: (id: string, verificationNote: string, rejectionReason: string) => request<MarketplaceClaim>(`/marketplace/super-admin/claims/${id}/reject`, 'POST', { verificationNote, rejectionReason }),
  resendClaimMessage: (id: string) => request<MarketplaceClaim>(`/marketplace/super-admin/claims/${id}/resend`, 'POST'),
  getReviews: async (filters: { status?: string; query?: string } = {}) => collection<MarketplaceReview>(await request<unknown>(`/marketplace/super-admin/reviews${query(filters)}`), 'reviews'),
  updateReview: (id: string, status: ReviewStatus) => request<MarketplaceReview>(`/marketplace/super-admin/reviews/${id}`, 'PATCH', { status }),
  getLeads: async (filters: { deliveryStatus?: string; query?: string } = {}) => collection<MarketplaceLead>(await request<unknown>(`/marketplace/super-admin/leads${query(filters)}`), 'leads'),
  retryLead: (id: string) => request<MarketplaceLead>(`/marketplace/super-admin/leads/${id}/retry`, 'POST'),
  releaseLead: (id: string) => request<MarketplaceLead>(`/marketplace/super-admin/leads/${id}/release`, 'POST'),
  getActivity: async (filters: { instituteId?: string; limit?: number } = {}) => collection<MarketplaceActivity>(await request<unknown>(`/marketplace/super-admin/activity${query({ instituteId: filters.instituteId, limit: filters.limit?.toString() })}`), 'activity'),
};
