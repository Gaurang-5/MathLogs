import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MarketplaceApiError, marketplaceApi } from './api';
import type { MarketplaceListingDetail } from './types';

const latest: MarketplaceListingDetail = {
  id: 'listing-1', name: 'Latest Academy', isPubliclyListed: true, isVerified: false,
  updatedAt: '2026-08-15T01:00:00.000Z',
};

describe('marketplace API', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    localStorage.clear();
  });

  it('turns a structured 409 listing response into a conflict error with the latest listing', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(new Response(JSON.stringify({
      success: false, message: 'Listing was updated by another operator', data: latest,
    }), { status: 409, headers: { 'Content-Type': 'application/json' } }));

    const error = await marketplaceApi.updateListing('listing-1', {
      name: 'My draft', teacherName: '', phoneNumber: '', publicPhone: '', whatsappPhone: '', city: '', area: '',
      address: '', tagline: '', aboutUs: '', logoUrl: '', subjectsOffered: [], classesOffered: [],
      isPubliclyListed: true, isVerified: false, expectedUpdatedAt: '2026-08-15T00:00:00.000Z',
    }).catch(reason => reason);

    expect(error).toBeInstanceOf(MarketplaceApiError);
    expect(error).toMatchObject({
      message: 'Listing was updated by another operator',
      status: 409,
      latestListing: latest,
    });
  });
});
