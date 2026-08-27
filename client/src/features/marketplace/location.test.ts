import { describe, expect, it } from 'vitest';
import {
  MARKETPLACE_CITY,
  MARKETPLACE_CITY_OPTIONS,
  buildMarketplaceLandingPath,
  normalizeMarketplaceCitySelection,
  parseMarketplaceLandingParams,
} from './location';

describe('marketplace city controls', () => {
  it('offers only canonical Muzaffarnagar', () => {
    expect(MARKETPLACE_CITY_OPTIONS).toEqual([
      { value: 'Muzaffarnagar', label: 'Muzaffarnagar' },
    ]);
    expect(normalizeMarketplaceCitySelection('muaffarnagar')).toBe(MARKETPLACE_CITY);
    expect(() => normalizeMarketplaceCitySelection('Jaipur')).toThrow(/Muzaffarnagar/);
  });

  it('builds and parses fixed-order marketplace landing routes', () => {
    expect(buildMarketplaceLandingPath({
      area: 'Gandhi Colony',
      className: 'Class 9',
      subject: 'Mathematics',
    })).toBe('/coaching/muzaffarnagar/areas/gandhi-colony/classes/class-9/subjects/mathematics');

    expect(parseMarketplaceLandingParams({
      areaSlug: 'gandhi-colony',
      classSlug: 'class-9',
      subjectSlug: 'mathematics',
    })).toEqual({
      areaSlug: 'gandhi-colony',
      classSlug: 'class-9',
      subjectSlug: 'mathematics',
    });
  });
});
