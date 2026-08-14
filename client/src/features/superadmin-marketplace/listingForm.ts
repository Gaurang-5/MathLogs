import type { ListingUpdateInput, MarketplaceListingDetail } from './types';

export type ListingForm = Omit<ListingUpdateInput, 'subjectsOffered' | 'classesOffered' | 'expectedUpdatedAt'> & {
  subjectsText: string;
  classesText: string;
};

const normalizePhone = (value: string) => {
  const digits = value.replace(/\D/g, '');
  return digits.length === 12 && digits.startsWith('91') ? digits.slice(2) : digits;
};
const trimmed = (value?: string | null) => value?.trim() ?? '';
const list = (value: string) => value.split(',').map(item => item.trim()).filter(Boolean);

export const listingFormFromDetail = (listing: MarketplaceListingDetail): ListingForm => ({
  name: listing.name ?? '', teacherName: listing.teacherName ?? '', phoneNumber: listing.phoneNumber ?? '',
  publicPhone: listing.publicPhone ?? '', whatsappPhone: listing.whatsappPhone ?? '', city: listing.city ?? '',
  area: listing.area ?? '', address: listing.address ?? '', tagline: listing.tagline ?? '', aboutUs: listing.aboutUs ?? '',
  logoUrl: listing.logoUrl ?? '', subjectsText: (listing.subjectsOffered ?? []).join(','),
  classesText: (listing.classesOffered ?? []).join(','), isPubliclyListed: listing.isPubliclyListed,
  isVerified: listing.isVerified,
});

export const buildListingUpdate = (form: ListingForm): ListingUpdateInput => {
  const name = trimmed(form.name);
  if (!name) throw new Error('Coaching name is required');
  return {
    name, teacherName: trimmed(form.teacherName), phoneNumber: normalizePhone(form.phoneNumber),
    publicPhone: normalizePhone(form.publicPhone), whatsappPhone: normalizePhone(form.whatsappPhone), city: trimmed(form.city),
    area: trimmed(form.area), address: trimmed(form.address), tagline: trimmed(form.tagline), aboutUs: trimmed(form.aboutUs),
    logoUrl: trimmed(form.logoUrl), subjectsOffered: list(form.subjectsText), classesOffered: list(form.classesText),
    isPubliclyListed: form.isPubliclyListed, isVerified: form.isVerified,
  };
};

export const hasListingChanges = (form: ListingForm, listing: MarketplaceListingDetail) => {
  try {
    const update = buildListingUpdate(form);
    const original = buildListingUpdate(listingFormFromDetail(listing));
    return JSON.stringify(update) !== JSON.stringify(original);
  } catch {
    return true;
  }
};
