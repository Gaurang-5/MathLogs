import {
  MARKETPLACE_CITY,
  canonicalMarketplaceFacetPath,
  marketplaceFacetSlug,
} from '../domain/marketplace/location';
import {
  searchMarketplaceListings,
  type MarketplaceCard,
} from './marketplaceSearchService';

export type MarketplaceFacetSource = {
  id: string;
  name: string;
  slug: string;
  area: string | null;
  classesOffered: string[];
  subjectsOffered: string[];
} & Partial<Omit<MarketplaceCard, 'id' | 'name' | 'slug' | 'area' | 'classesOffered' | 'subjectsOffered'>>;

export type MarketplaceFacetCatalog = {
  listings: MarketplaceFacetSource[];
  areasBySlug: Map<string, string[]>;
  classesBySlug: Map<string, string[]>;
  subjectsBySlug: Map<string, string[]>;
};

export type MarketplaceProfileSeoInput = {
  name: string;
  slug: string;
  teacherName: string;
  city: string;
  area?: string | null;
  classesOffered: string[];
  subjectsOffered: string[];
  duplicateName: boolean;
};

export type MarketplaceLandingRequest = {
  areaSlug?: string;
  classSlug?: string;
  subjectSlug?: string;
};

export type MarketplaceLandingPage = {
  valid: boolean;
  indexable: boolean;
  canonicalPath: string;
  title: string;
  description: string;
  heading: string;
  introduction: string;
  filters: {
    city: typeof MARKETPLACE_CITY;
    area?: string;
    className?: string;
    subject?: string;
  };
  breadcrumbs: Array<{ name: string; path: string }>;
  relatedLinks: Array<{ label: string; path: string }>;
  items: MarketplaceCard[];
  total: number;
};

const normalized = (value: string) => value.trim().toLocaleLowerCase('en-IN');
const nonEmpty = (values: string[]) => values.map(value => value.trim()).filter(Boolean);

function addFacetValue(map: Map<string, string[]>, value: string) {
  const clean = value.trim();
  if (!clean) return;
  const slug = marketplaceFacetSlug(clean);
  if (!slug) return;
  const current = map.get(slug) || [];
  if (!current.some(item => normalized(item) === normalized(clean))) current.push(clean);
  map.set(slug, current);
}

export function buildMarketplaceFacetCatalog(listings: MarketplaceFacetSource[]): MarketplaceFacetCatalog {
  const catalog: MarketplaceFacetCatalog = {
    listings,
    areasBySlug: new Map(),
    classesBySlug: new Map(),
    subjectsBySlug: new Map(),
  };

  for (const listing of listings) {
    if (listing.area) addFacetValue(catalog.areasBySlug, listing.area);
    for (const className of nonEmpty(listing.classesOffered)) addFacetValue(catalog.classesBySlug, className);
    for (const subject of nonEmpty(listing.subjectsOffered)) addFacetValue(catalog.subjectsBySlug, subject);
  }
  return catalog;
}

function uniqueFacet(map: Map<string, string[]>, slug?: string): string | undefined | null {
  if (!slug) return undefined;
  const matches = map.get(slug);
  return matches?.length === 1 ? matches[0] : null;
}

function listingMatches(listing: MarketplaceFacetSource, filters: MarketplaceLandingPage['filters']) {
  return (!filters.area || normalized(listing.area || '') === normalized(filters.area))
    && (!filters.className || listing.classesOffered.some(value => normalized(value) === normalized(filters.className!)))
    && (!filters.subject || listing.subjectsOffered.some(value => normalized(value) === normalized(filters.subject!)));
}

function sourceToCard(source: MarketplaceFacetSource): MarketplaceCard {
  return {
    id: source.id,
    name: source.name,
    slug: source.slug,
    teacherName: source.teacherName || 'Faculty',
    phone: source.phone || null,
    whatsappPhone: source.whatsappPhone || null,
    city: source.city || MARKETPLACE_CITY,
    area: source.area || '',
    address: source.address || '',
    tagline: source.tagline || '',
    aboutUs: source.aboutUs || '',
    logoUrl: source.logoUrl || null,
    googleMapsUrl: source.googleMapsUrl || null,
    googleRating: source.googleRating || null,
    googleReviewCount: source.googleReviewCount || 0,
    classesOffered: source.classesOffered,
    subjectsOffered: source.subjectsOffered,
    isExclusive: source.isExclusive || false,
    isVerified: source.isVerified || false,
    avgRating: source.avgRating || 0,
    reviewCount: source.reviewCount || 0,
  };
}

function pageCopy(filters: MarketplaceLandingPage['filters']) {
  const offering = [filters.className, filters.subject].filter(Boolean).join(' ') || 'Coaching Classes';
  const location = [filters.area, MARKETPLACE_CITY].filter(Boolean).join(', ');
  const heading = `Best ${offering} in ${location}`;
  return {
    heading,
    title: `${offering} in ${location} | MathLogs`,
    description: `Compare coaching institutes for ${offering} in ${location}. View real classes, subjects, locations and contact details on MathLogs.`,
    introduction: `Explore active MathLogs coaching listings for ${offering} in ${location}.`,
  };
}

function breadcrumbs(filters: MarketplaceLandingPage['filters']) {
  const items = [{ name: `Coaching in ${MARKETPLACE_CITY}`, path: '/coaching' }];
  if (filters.area) items.push({
    name: filters.area,
    path: canonicalMarketplaceFacetPath({ area: filters.area }),
  });
  if (filters.className) items.push({
    name: filters.className,
    path: canonicalMarketplaceFacetPath({ area: filters.area, className: filters.className }),
  });
  if (filters.subject) items.push({
    name: filters.subject,
    path: canonicalMarketplaceFacetPath({
      area: filters.area,
      className: filters.className,
      subject: filters.subject,
    }),
  });
  return items;
}

export function resolveMarketplaceLandingFromCatalog(
  catalog: MarketplaceFacetCatalog,
  request: MarketplaceLandingRequest,
): MarketplaceLandingPage {
  const area = uniqueFacet(catalog.areasBySlug, request.areaSlug);
  const className = uniqueFacet(catalog.classesBySlug, request.classSlug);
  const subject = uniqueFacet(catalog.subjectsBySlug, request.subjectSlug);
  const requestedFacetCount = [request.areaSlug, request.classSlug, request.subjectSlug].filter(Boolean).length;
  const resolvedFacetCount = [area, className, subject].filter(value => typeof value === 'string').length;
  const valid = requestedFacetCount > 0 && requestedFacetCount === resolvedFacetCount;
  const filters: MarketplaceLandingPage['filters'] = {
    city: MARKETPLACE_CITY,
    ...(typeof area === 'string' ? { area } : {}),
    ...(typeof className === 'string' ? { className } : {}),
    ...(typeof subject === 'string' ? { subject } : {}),
  };
  const matches = valid ? catalog.listings.filter(listing => listingMatches(listing, filters)) : [];
  const copy = pageCopy(filters);
  const canonicalPath = valid
    ? canonicalMarketplaceFacetPath({ area: filters.area, className: filters.className, subject: filters.subject })
    : '/coaching';
  const relatedPaths = new Set(matches.flatMap(listing => enumerateMarketplaceLandingPathsFromListings([listing])));
  relatedPaths.delete(canonicalPath);

  return {
    valid,
    indexable: valid && matches.length > 0,
    canonicalPath,
    ...copy,
    filters,
    breadcrumbs: breadcrumbs(filters),
    relatedLinks: Array.from(relatedPaths).slice(0, 12).map(path => ({
      label: `Explore ${decodeURIComponent(path.split('/').slice(-1)[0] || '').replace(/-/g, ' ')}`,
      path,
    })),
    items: matches.map(sourceToCard),
    total: matches.length,
  };
}

export function enumerateMarketplaceLandingPathsFromListings(listings: MarketplaceFacetSource[]): string[] {
  const paths = new Set<string>();
  for (const listing of listings) {
    const areas = listing.area?.trim() ? [listing.area.trim()] : [];
    const classes = nonEmpty(listing.classesOffered);
    const subjects = nonEmpty(listing.subjectsOffered);
    for (const area of areas) paths.add(canonicalMarketplaceFacetPath({ area }));
    for (const className of classes) paths.add(canonicalMarketplaceFacetPath({ className }));
    for (const subject of subjects) paths.add(canonicalMarketplaceFacetPath({ subject }));
    for (const area of areas) for (const className of classes) {
      paths.add(canonicalMarketplaceFacetPath({ area, className }));
    }
    for (const area of areas) for (const subject of subjects) {
      paths.add(canonicalMarketplaceFacetPath({ area, subject }));
    }
    for (const className of classes) for (const subject of subjects) {
      paths.add(canonicalMarketplaceFacetPath({ className, subject }));
    }
    for (const area of areas) for (const className of classes) for (const subject of subjects) {
      paths.add(canonicalMarketplaceFacetPath({ area, className, subject }));
    }
  }
  return Array.from(paths).sort();
}

export async function resolveMarketplaceLanding(request: MarketplaceLandingRequest) {
  const result = await searchMarketplaceListings({ city: MARKETPLACE_CITY, limit: 500 });
  return resolveMarketplaceLandingFromCatalog(buildMarketplaceFacetCatalog(result.items.map(item => ({
    ...item,
    area: item.area || null,
  }))), request);
}

export async function enumerateMarketplaceLandingPaths() {
  const result = await searchMarketplaceListings({ city: MARKETPLACE_CITY, limit: 500 });
  return enumerateMarketplaceLandingPathsFromListings(result.items.map(item => ({
    ...item,
    area: item.area || null,
  })));
}

export function getMarketplaceProfileSeo(profile: MarketplaceProfileSeoInput) {
  const locality = profile.area?.trim();
  const location = [locality, profile.city].filter(Boolean).join(', ');
  const disambiguation = profile.duplicateName
    ? ` in ${locality || profile.city} — ${profile.teacherName}`
    : ` in ${location}`;
  const classText = nonEmpty(profile.classesOffered).join(', ');
  const subjectText = nonEmpty(profile.subjectsOffered).join(', ');
  const details = [
    `Discover ${profile.name} in ${location}.`,
    classText ? `Classes: ${classText}.` : '',
    subjectText ? `Subjects: ${subjectText}.` : '',
    `View verified details and contact information on MathLogs.`,
  ].filter(Boolean).join(' ');
  return {
    title: `${profile.name}${disambiguation} | Classes & Contact`,
    description: details,
    canonicalPath: `/coaching/${profile.slug}`,
    heading: profile.name,
  };
}
