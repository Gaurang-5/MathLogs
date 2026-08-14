import type { ClaimStatus, MarketplaceMetrics, MarketplaceSection } from './types';

const sections: MarketplaceSection[] = ['overview', 'listings', 'claims', 'reviews', 'leads'];

export const parseMarketplaceSection = (search: string): MarketplaceSection => {
  const section = new URLSearchParams(search).get('section');
  return sections.includes(section as MarketplaceSection) ? section as MarketplaceSection : 'overview';
};

export const attentionCounts = (metrics: Pick<MarketplaceMetrics, 'pendingClaims' | 'pendingReviews' | 'failedLeadNotifications' | 'heldLeads'>) => ({
  claims: metrics.pendingClaims,
  reviews: metrics.pendingReviews,
  leads: metrics.failedLeadNotifications + metrics.heldLeads,
});

export const claimStatusLabel = (status: ClaimStatus) => status.charAt(0) + status.slice(1).toLowerCase();

export const getClaimActions = (status: ClaimStatus) => {
  if (status === 'NEW') return ['contact', 'approve', 'reject'] as const;
  if (status === 'CONTACTED') return ['approve', 'reject'] as const;
  return [] as const;
};

export const sectionTitle = (section: MarketplaceSection) => ({
  overview: 'Overview', listings: 'Listings', claims: 'Ownership claims', reviews: 'Reviews', leads: 'Lead delivery',
})[section];
