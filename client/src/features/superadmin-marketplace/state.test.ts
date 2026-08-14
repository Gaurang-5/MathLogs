import { describe, expect, it } from 'vitest';
import {
  attentionCounts,
  claimStatusLabel,
  getClaimActions,
  parseMarketplaceSection,
} from './state';

describe('marketplace operations state', () => {
  it('uses a supported section from the URL and otherwise opens overview', () => {
    expect(parseMarketplaceSection('?section=claims')).toBe('claims');
    expect(parseMarketplaceSection('?section=unknown')).toBe('overview');
  });

  it('maps pending work to its navigation badges', () => {
    expect(attentionCounts({ pendingClaims: 2, pendingReviews: 3, failedLeadNotifications: 4, heldLeads: 1 }))
      .toEqual({ claims: 2, reviews: 3, leads: 5 });
  });

  it('uses readable claim status labels and only exposes valid decisions', () => {
    expect(claimStatusLabel('CONTACTED')).toBe('Contacted');
    expect(getClaimActions('NEW')).toEqual(['contact', 'approve', 'reject']);
    expect(getClaimActions('APPROVED')).toEqual([]);
  });
});
