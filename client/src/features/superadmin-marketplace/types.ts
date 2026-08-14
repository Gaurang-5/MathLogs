export type MarketplaceSection = 'overview' | 'listings' | 'claims' | 'reviews' | 'leads';
export type ClaimStatus = 'NEW' | 'CONTACTED' | 'APPROVED' | 'REJECTED';
export type CommunicationStatus = 'NOT_SENT' | 'QUEUED' | 'SENT' | 'FAILED';
export type LeadDeliveryStatus = 'HELD' | 'QUEUED' | 'DELIVERED' | 'FAILED';
export type ReviewStatus = 'PENDING' | 'APPROVED' | 'REJECTED';

export interface MarketplaceMetrics {
  totalListings: number;
  publishedListings: number;
  verifiedListings: number;
  claimedListings: number;
  googleConnected: number;
  pendingClaims: number;
  pendingReviews: number;
  newLeads: number;
  heldLeads: number;
  failedLeadNotifications: number;
  incompleteListings: number;
}

export interface MarketplaceListing {
  id: string;
  name: string;
  slug?: string | null;
  teacherName?: string | null;
  city?: string | null;
  area?: string | null;
  logoUrl?: string | null;
  status?: string | null;
  plan?: string | null;
  ownershipStatus?: 'CLAIMED' | 'UNCLAIMED' | string;
  isPubliclyListed: boolean;
  isVerified: boolean;
  googlePlaceId?: string | null;
  googleMapsUrl?: string | null;
  googleRating?: number | null;
  googleReviewCount?: number | null;
  googleLastSyncedAt?: string | null;
  profileCompleteness?: number;
  _count?: { reviews?: number; leadInquiries?: number };
  updatedAt?: string;
}

export interface MarketplaceListingDetail extends MarketplaceListing {
  phoneNumber?: string | null;
  publicPhone?: string | null;
  whatsappPhone?: string | null;
  address?: string | null;
  tagline?: string | null;
  aboutUs?: string | null;
  subjectsOffered?: string[] | null;
  classesOffered?: string[] | null;
  updatedAt: string;
}

export interface ListingUpdateInput {
  name: string;
  teacherName: string;
  phoneNumber: string;
  publicPhone: string;
  whatsappPhone: string;
  city: string;
  area: string;
  address: string;
  tagline: string;
  aboutUs: string;
  logoUrl: string;
  subjectsOffered: string[];
  classesOffered: string[];
  isPubliclyListed: boolean;
  isVerified: boolean;
  expectedUpdatedAt?: string;
}

export interface MarketplaceClaim {
  id: string;
  status: ClaimStatus;
  claimantName: string;
  phone: string;
  normalizedPhone?: string;
  email?: string | null;
  proofNote?: string | null;
  verificationNote?: string | null;
  rejectionReason?: string | null;
  contactedAt?: string | null;
  decidedAt?: string | null;
  communicationStatus: CommunicationStatus;
  communicationError?: string | null;
  communicationRetryCount?: number;
  createdAt: string;
  updatedAt?: string;
  institute: { id: string; name: string; slug?: string | null; city?: string | null; ownershipStatus?: string; isVerified?: boolean };
  history?: MarketplaceClaim[];
}

export interface MarketplaceReview {
  id: string;
  reviewerName: string;
  reviewerRole?: string | null;
  rating: number;
  comment: string;
  source: string;
  status: ReviewStatus;
  createdAt: string;
  institute: { id: string; name: string; slug?: string | null };
}

export interface MarketplaceLead {
  id: string;
  studentName: string;
  phone: string;
  subject?: string | null;
  classGrade?: string | null;
  message?: string | null;
  status?: string | null;
  deliveryStatus: LeadDeliveryStatus;
  destinationPhone?: string | null;
  notificationSentAt?: string | null;
  notificationError?: string | null;
  notificationRetryCount?: number;
  releasedAt?: string | null;
  possibleDuplicate?: boolean;
  createdAt: string;
  institute: { id: string; name: string; ownershipStatus: string; teacherName?: string | null };
}

export interface MarketplaceActivity {
  id: string;
  action: string;
  entityType: string;
  entityId: string;
  createdAt: string;
  institute?: { id: string; name: string } | null;
  actor?: { id: string; username?: string | null; name?: string | null } | null;
}

export interface MarketplaceOverview {
  metrics: MarketplaceMetrics;
  incompleteListings: MarketplaceListing[];
  recentActivity: MarketplaceActivity[];
}
