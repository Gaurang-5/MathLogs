export const MARKETPLACE_CITY = 'Muzaffarnagar' as const;

const LEGACY_CITY_KEYS = new Set(['muzaffarnagar', 'muaffarnagar']);

export type MarketplaceFacetSelection = {
  area?: string;
  className?: string;
  subject?: string;
};

export class MarketplaceCityValidationError extends Error {
  readonly code = 'UNSUPPORTED_MARKETPLACE_CITY';

  constructor(message: string) {
    super(message);
    this.name = 'MarketplaceCityValidationError';
  }
}

export function normalizeMarketplaceCity(value: unknown): typeof MARKETPLACE_CITY | null {
  if (typeof value !== 'string' || !value.trim()) return null;

  const key = value.trim().toLowerCase().replace(/\s+/g, ' ');
  return LEGACY_CITY_KEYS.has(key) ? MARKETPLACE_CITY : null;
}

export function requireMarketplaceCity(value: unknown): typeof MARKETPLACE_CITY {
  if (typeof value !== 'string' || !value.trim()) {
    throw new MarketplaceCityValidationError('Marketplace city is required and must be Muzaffarnagar');
  }

  const city = normalizeMarketplaceCity(value);
  if (!city) {
    throw new MarketplaceCityValidationError('Marketplace city must be Muzaffarnagar');
  }
  return city;
}

export function validateMarketplacePublication(input: {
  isPubliclyListed: boolean;
  city: unknown;
}): string | null {
  if (!input.isPubliclyListed) {
    return typeof input.city === 'string' && input.city.trim() ? input.city.trim() : null;
  }

  return requireMarketplaceCity(input.city);
}

export function marketplaceFacetSlug(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

export function canonicalMarketplaceFacetPath(facets: MarketplaceFacetSelection): string {
  const parts = ['/coaching/muzaffarnagar'];

  if (facets.area) parts.push('areas', marketplaceFacetSlug(facets.area));
  if (facets.className) parts.push('classes', marketplaceFacetSlug(facets.className));
  if (facets.subject) parts.push('subjects', marketplaceFacetSlug(facets.subject));

  return parts.join('/');
}
