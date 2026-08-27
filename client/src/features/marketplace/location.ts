export const MARKETPLACE_CITY = 'Muzaffarnagar' as const;

export const MARKETPLACE_CITY_OPTIONS = [
  { value: MARKETPLACE_CITY, label: MARKETPLACE_CITY },
] as const;

export function normalizeMarketplaceCitySelection(value: string): typeof MARKETPLACE_CITY {
  const key = value.trim().toLowerCase();
  if (key === 'muzaffarnagar' || key === 'muaffarnagar') return MARKETPLACE_CITY;
  throw new Error('Marketplace city must be Muzaffarnagar');
}

export type MarketplaceLandingRouteParams = {
  areaSlug?: string;
  classSlug?: string;
  subjectSlug?: string;
};

export type MarketplaceLandingFilters = {
  area?: string;
  className?: string;
  subject?: string;
};

export function marketplaceFacetSlug(value: string): string {
  return value
    .trim()
    .toLocaleLowerCase('en-IN')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export function buildMarketplaceLandingPath(filters: MarketplaceLandingFilters): string {
  let path = '/coaching/muzaffarnagar';
  if (filters.area) path += `/areas/${marketplaceFacetSlug(filters.area)}`;
  if (filters.className) path += `/classes/${marketplaceFacetSlug(filters.className)}`;
  if (filters.subject) path += `/subjects/${marketplaceFacetSlug(filters.subject)}`;
  return path;
}

export function parseMarketplaceLandingParams(params: Record<string, string | undefined>): MarketplaceLandingRouteParams {
  return {
    ...(params.areaSlug ? { areaSlug: params.areaSlug } : {}),
    ...(params.classSlug ? { classSlug: params.classSlug } : {}),
    ...(params.subjectSlug ? { subjectSlug: params.subjectSlug } : {}),
  };
}
