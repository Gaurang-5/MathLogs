import { Prisma } from '@prisma/client';
import { normalizeMarketplaceCity } from '../domain/marketplace/location';
import { prisma } from '../prisma';

export type MarketplaceSearchFilters = {
  q?: string;
  city?: string;
  area?: string;
  className?: string;
  subject?: string;
  sortBy?: 'rating' | 'reviews' | 'newest';
  page?: number;
  limit?: number;
};

export type MarketplaceCard = {
  id: string;
  name: string;
  slug: string;
  teacherName: string;
  phone: string | null;
  whatsappPhone: string | null;
  city: string;
  area: string;
  address: string;
  tagline: string;
  aboutUs: string;
  logoUrl: string | null;
  googleMapsUrl: string | null;
  googleRating: number | null;
  googleReviewCount: number;
  subjectsOffered: string[];
  classesOffered: string[];
  isExclusive: boolean;
  isVerified: boolean;
  avgRating: number;
  reviewCount: number;
};

export type MarketplaceSearchResult = {
  items: MarketplaceCard[];
  total: number;
  page: number;
  limit: number;
  availableFilters: {
    cities: string[];
    areas: string[];
    classes: string[];
    subjects: string[];
  };
};

const listingSelect = {
  id: true,
  name: true,
  slug: true,
  teacherName: true,
  publicPhone: true,
  phoneNumber: true,
  whatsappPhone: true,
  city: true,
  area: true,
  address: true,
  tagline: true,
  aboutUs: true,
  logoUrl: true,
  googleMapsUrl: true,
  googleRating: true,
  googleReviewCount: true,
  subjectsOffered: true,
  classesOffered: true,
  plan: true,
  isExclusive: true,
  isVerified: true,
  createdAt: true,
  reviews: {
    where: { status: 'APPROVED' as const },
    select: { rating: true },
  },
} satisfies Prisma.InstituteSelect;

type ListingRecord = Prisma.InstituteGetPayload<{ select: typeof listingSelect }>;

const normalized = (value: string) => value.trim().toLocaleLowerCase('en-IN');
const stringArray = (value: Prisma.JsonValue): string[] => (
  Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : []
);
const exactArrayMatch = (values: string[], target?: string) => (
  !target || values.some(value => normalized(value) === normalized(target))
);

function toMarketplaceCard(institute: ListingRecord): MarketplaceCard {
  const mathlogsReviewCount = institute.reviews.length;
  const mathlogsAverage = mathlogsReviewCount > 0
    ? Number((institute.reviews.reduce((total, review) => total + review.rating, 0) / mathlogsReviewCount).toFixed(1))
    : 0;
  const city = normalizeMarketplaceCity(institute.city) || institute.city || '';

  return {
    id: institute.id,
    name: institute.name,
    slug: institute.slug || institute.id,
    teacherName: institute.teacherName || 'Faculty',
    phone: institute.publicPhone || institute.phoneNumber || null,
    whatsappPhone: institute.whatsappPhone || institute.publicPhone || institute.phoneNumber || null,
    city,
    area: institute.area || '',
    address: institute.address || '',
    tagline: institute.tagline || '',
    aboutUs: institute.aboutUs || '',
    logoUrl: institute.logoUrl || null,
    googleMapsUrl: institute.googleMapsUrl || null,
    googleRating: institute.googleRating || null,
    googleReviewCount: institute.googleReviewCount || 0,
    subjectsOffered: stringArray(institute.subjectsOffered),
    classesOffered: stringArray(institute.classesOffered),
    isExclusive: institute.isExclusive || ['QUIZ', 'ENTERPRISE'].includes(institute.plan),
    isVerified: institute.isVerified,
    avgRating: institute.googleRating || mathlogsAverage,
    reviewCount: (institute.googleReviewCount || 0) + mathlogsReviewCount,
  };
}

export async function searchMarketplaceListings(
  filters: MarketplaceSearchFilters,
): Promise<MarketplaceSearchResult> {
  const page = Math.max(1, filters.page || 1);
  const limit = Math.min(500, Math.max(1, filters.limit || 12));
  const requestedCity = filters.city?.trim();
  const canonicalCity = requestedCity ? normalizeMarketplaceCity(requestedCity) : null;
  const where: Prisma.InstituteWhereInput = {
    isPubliclyListed: true,
    status: 'ACTIVE',
    ...(requestedCity ? {
      city: { equals: canonicalCity || requestedCity, mode: 'insensitive' },
    } : {}),
    ...(filters.area?.trim() ? {
      area: { equals: filters.area.trim(), mode: 'insensitive' },
    } : {}),
  };

  if (filters.q?.trim()) {
    const query = filters.q.trim();
    where.AND = [{ OR: [
      { name: { contains: query, mode: 'insensitive' } },
      { teacherName: { contains: query, mode: 'insensitive' } },
      { tagline: { contains: query, mode: 'insensitive' } },
      { area: { contains: query, mode: 'insensitive' } },
      { city: { contains: query, mode: 'insensitive' } },
    ] }];
  }

  const records = await prisma.institute.findMany({ where, select: listingSelect });
  const filtered = records.filter(record => (
    exactArrayMatch(stringArray(record.subjectsOffered), filters.subject)
    && exactArrayMatch(stringArray(record.classesOffered), filters.className)
  ));
  const cards = filtered.map(toMarketplaceCard);
  const createdAtById = new Map(records.map(record => [record.id, record.createdAt.getTime()]));

  cards.sort((left, right) => {
    if (filters.sortBy === 'newest') {
      return (createdAtById.get(right.id) || 0) - (createdAtById.get(left.id) || 0);
    }
    if (filters.sortBy === 'reviews') return right.reviewCount - left.reviewCount;
    if (right.avgRating !== left.avgRating) return right.avgRating - left.avgRating;
    return right.reviewCount - left.reviewCount;
  });

  const uniqueSorted = (values: Array<string | null>) => Array.from(new Set(
    values.filter((value): value is string => Boolean(value?.trim())).map(value => value.trim()),
  )).sort((left, right) => left.localeCompare(right));

  return {
    items: cards.slice((page - 1) * limit, page * limit),
    total: cards.length,
    page,
    limit,
    availableFilters: {
      cities: uniqueSorted(records.map(record => normalizeMarketplaceCity(record.city) || record.city)),
      areas: uniqueSorted(records.map(record => record.area)),
      classes: uniqueSorted(records.flatMap(record => stringArray(record.classesOffered))),
      subjects: uniqueSorted(records.flatMap(record => stringArray(record.subjectsOffered))),
    },
  };
}
