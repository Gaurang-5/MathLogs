export const MARKETPLACE_CITY = 'Muzaffarnagar' as const;

export const MARKETPLACE_CITY_OPTIONS = [
  { value: MARKETPLACE_CITY, label: MARKETPLACE_CITY },
] as const;

export function normalizeMarketplaceCitySelection(value: string): typeof MARKETPLACE_CITY {
  const key = value.trim().toLowerCase();
  if (key === 'muzaffarnagar' || key === 'muaffarnagar') return MARKETPLACE_CITY;
  throw new Error('Marketplace city must be Muzaffarnagar');
}
