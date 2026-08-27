import { describe, expect, it } from 'vitest';
import {
  MARKETPLACE_CITY,
  MARKETPLACE_CITY_OPTIONS,
  normalizeMarketplaceCitySelection,
} from './location';

describe('marketplace city controls', () => {
  it('offers only canonical Muzaffarnagar', () => {
    expect(MARKETPLACE_CITY_OPTIONS).toEqual([
      { value: 'Muzaffarnagar', label: 'Muzaffarnagar' },
    ]);
    expect(normalizeMarketplaceCitySelection('muaffarnagar')).toBe(MARKETPLACE_CITY);
    expect(() => normalizeMarketplaceCitySelection('Jaipur')).toThrow(/Muzaffarnagar/);
  });
});
