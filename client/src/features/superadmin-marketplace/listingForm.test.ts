import { describe, expect, it } from 'vitest';
import { buildListingUpdate, hasListingChanges, listingFormFromDetail } from './listingForm';
import type { MarketplaceListingDetail } from './types';

const listing: MarketplaceListingDetail = {
  id: 'listing-1',
  name: '  Apex Academy  ',
  slug: 'apex-academy',
  teacherName: '  Riya  ',
  phoneNumber: '+91 98765 43210',
  publicPhone: ' 98765 43210 ',
  whatsappPhone: '98765-43210',
  city: ' Muaffarnagar ',
  area: ' Rohini ',
  address: ' Sector 7 ',
  tagline: ' Learn better ',
  aboutUs: ' Detail ',
  logoUrl: ' https://example.test/logo.png ',
  subjectsOffered: [' Mathematics ', '', 'Physics'],
  classesOffered: [' Class 10 ', ''],
  isPubliclyListed: true,
  isVerified: false,
  updatedAt: '2026-08-15T00:00:00.000Z',
  googlePlaceId: 'google-place',
  googleRating: 4.8,
  googleReviewCount: 21,
  googleLastSyncedAt: '2026-08-15T01:00:00.000Z',
  googleMapsUrl: 'https://maps.example.test',
};

describe('listing form helpers', () => {
  it('maps detail values into an editable form without Google fields', () => {
    expect(listingFormFromDetail(listing)).toMatchObject({
      name: '  Apex Academy  ',
      subjectsText: ' Mathematics ,,Physics',
      classesText: ' Class 10 ,',
    });
    expect(listingFormFromDetail(listing)).not.toHaveProperty('googleRating');
  });

  it('trims, normalizes and removes blank subject/class entries for an update', () => {
    expect(buildListingUpdate(listingFormFromDetail(listing))).toEqual({
      name: 'Apex Academy', teacherName: 'Riya', phoneNumber: '9876543210', publicPhone: '9876543210',
      whatsappPhone: '9876543210', city: 'Muzaffarnagar', area: 'Rohini', address: 'Sector 7', tagline: 'Learn better',
      aboutUs: 'Detail', logoUrl: 'https://example.test/logo.png', subjectsOffered: ['Mathematics', 'Physics'],
      classesOffered: ['Class 10'], isPubliclyListed: true, isVerified: false,
    });
  });

  it('rejects an empty coaching name and detects edited values', () => {
    const form = listingFormFromDetail(listing);
    form.name = '   ';
    expect(() => buildListingUpdate(form)).toThrow('Coaching name is required');
    expect(hasListingChanges(listingFormFromDetail(listing), listing)).toBe(false);
    expect(hasListingChanges({ ...listingFormFromDetail(listing), city: 'Noida' }, listing)).toBe(true);
  });
});
