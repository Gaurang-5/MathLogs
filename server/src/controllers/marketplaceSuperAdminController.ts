import type { NextFunction, Request, Response } from 'express';
import { Prisma } from '@prisma/client';
import { prisma } from '../prisma';
import {
  approveMarketplaceClaim,
  markMarketplaceClaimContacted,
  rejectMarketplaceClaim
} from '../services/marketplaceClaimService';
import {
  sendClaimApprovalNotification,
  sendClaimRejectionNotification
} from '../services/marketplaceNotificationService';
import {
  releaseMarketplaceLead,
  retryMarketplaceLeadNotification
} from '../services/marketplaceLeadService';
import { writeMarketplaceAudit } from '../services/marketplaceAuditService';
import { fetchGooglePlaceDetails, searchGooglePlaces } from '../services/googlePlacesService';
import {
  enqueueWhatsAppTracked,
  type MarketplaceWhatsAppTracking,
  type TrackedWhatsAppEnqueueResult
} from '../utils/whatsapp';

const LEGACY_CLAIM_MARKER = '[CLAIM REQUEST]';

const claimSelect = {
  id: true,
  instituteId: true,
  claimantName: true,
  phone: true,
  normalizedPhone: true,
  email: true,
  proofNote: true,
  notes: true,
  status: true,
  verificationNote: true,
  rejectionReason: true,
  contactedAt: true,
  decidedAt: true,
  decidedByAdminId: true,
  communicationStatus: true,
  communicationSentAt: true,
  communicationError: true,
  communicationRetryCount: true,
  whatsappJobId: true,
  createdAt: true,
  updatedAt: true,
  institute: {
    select: { id: true, name: true, slug: true, city: true, ownershipStatus: true, isVerified: true }
  }
} satisfies Prisma.MarketplaceClaimSelect;

const listingSelect = {
  id: true,
  name: true,
  slug: true,
  teacherName: true,
  phoneNumber: true,
  publicPhone: true,
  whatsappPhone: true,
  city: true,
  area: true,
  address: true,
  tagline: true,
  aboutUs: true,
  subjectsOffered: true,
  classesOffered: true,
  logoUrl: true,
  status: true,
  plan: true,
  ownershipStatus: true,
  claimedPhone: true,
  claimedAt: true,
  isPubliclyListed: true,
  isVerified: true,
  googlePlaceId: true,
  googleMapsUrl: true,
  googleRating: true,
  googleReviewCount: true,
  googleReviews: true,
  googlePhotos: true,
  googleLastSyncedAt: true,
  createdAt: true,
  updatedAt: true,
  _count: { select: { reviews: true, leadInquiries: true } }
} satisfies Prisma.InstituteSelect;

const reviewSelect = {
  id: true, reviewerName: true, reviewerRole: true, rating: true, comment: true,
  source: true, status: true, createdAt: true, updatedAt: true,
  institute: { select: { id: true, name: true, slug: true } }
} satisfies Prisma.ReviewSelect;

const leadSelect = {
  id: true, instituteId: true, studentName: true, phone: true, subject: true, classGrade: true,
  message: true, status: true, deliveryStatus: true, destinationPhone: true, notificationJobId: true,
  notificationSentAt: true, notificationError: true, notificationRetryCount: true, releasedAt: true,
  possibleDuplicate: true, duplicateOfId: true, createdAt: true, updatedAt: true,
  institute: { select: { id: true, name: true, ownershipStatus: true, teacherName: true, whatsappPhone: true, phoneNumber: true } }
} satisfies Prisma.LeadInquirySelect;

const activitySelect = {
  id: true, action: true, entityType: true, entityId: true, before: true, after: true, metadata: true,
  createdAt: true, institute: { select: { id: true, name: true } },
  actorAdmin: { select: { id: true, username: true } }
} satisfies Prisma.MarketplaceAuditLogSelect;

function json(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

function profileCompleteness(institute: any): number {
  const values = [
    institute.name, institute.teacherName, institute.city, institute.area, institute.publicPhone,
    institute.tagline, institute.aboutUs, institute.logoUrl,
    Array.isArray(institute.subjectsOffered) && institute.subjectsOffered.length > 0,
    Array.isArray(institute.classesOffered) && institute.classesOffered.length > 0
  ];
  return Math.round((values.filter(Boolean).length / 10) * 100);
}

function withCompleteness<T>(listing: T): T & { profileCompleteness: number } {
  return { ...listing, profileCompleteness: profileCompleteness(listing) };
}

function statusForError(error: any): number {
  if (['CLAIM_NOT_FOUND', 'LEAD_NOT_FOUND'].includes(error?.message)) return 404;
  if (['CLAIM_ALREADY_DECIDED', 'CLAIM_NOT_DECIDED', 'CLAIM_MESSAGE_NOT_RETRYABLE', 'LEAD_NOT_RETRYABLE', 'LEAD_NOT_HELD', 'INSTITUTE_NOT_CLAIMED'].includes(error?.message)) return 409;
  if (['VERIFICATION_NOTE_REQUIRED', 'REJECTION_REASON_REQUIRED', 'INVALID_PHONE', 'OWNER_PHONE_MISSING'].includes(error?.message)) return 400;
  return 500;
}

function failure(res: Response, error: any, fallback: string) {
  const status = statusForError(error);
  return res.status(status).json({ success: false, message: status === 500 ? fallback : error.message });
}

export function requireMarketplaceSuperAdmin(req: any, res: Response, next: NextFunction) {
  if (req.user?.role !== 'SUPER_ADMIN') {
    res.status(403).json({ success: false, message: 'Superadmin privileges required' });
    return;
  }
  next();
}

export async function listMarketplaceClaims(req: Request, res: Response) {
  const status = req.query.status ? String(req.query.status).toUpperCase() : undefined;
  const query = String(req.query.query || '').trim();
  if (status && !['OPEN', 'NEW', 'CONTACTED', 'APPROVED', 'REJECTED'].includes(status)) {
    return res.status(400).json({ success: false, message: 'Invalid claim status' });
  }
  const claims = await prisma.marketplaceClaim.findMany({
    where: {
      ...(status === 'OPEN'
        ? { status: { in: ['NEW', 'CONTACTED'] } }
        : status ? { status } : {}),
      ...(query ? { OR: [
        { claimantName: { contains: query, mode: 'insensitive' as const } },
        { phone: { contains: query } },
        { email: { contains: query, mode: 'insensitive' as const } },
        { institute: { name: { contains: query, mode: 'insensitive' as const } } }
      ] } : {})
    },
    select: claimSelect,
    orderBy: { createdAt: 'desc' },
    take: 200
  });
  return res.json({ success: true, data: claims });
}

export async function getMarketplaceClaim(req: Request, res: Response) {
  const claim = await prisma.marketplaceClaim.findUnique({ where: { id: String(req.params.id) }, select: claimSelect });
  if (!claim) return res.status(404).json({ success: false, message: 'Claim not found' });
  const history = await prisma.marketplaceClaim.findMany({
    where: { instituteId: claim.instituteId, id: { not: claim.id } }, select: claimSelect, orderBy: { createdAt: 'desc' }
  });
  return res.json({ success: true, data: { ...claim, history } });
}

export async function contactMarketplaceClaim(req: any, res: Response) {
  try {
    const before = await prisma.marketplaceClaim.findUnique({ where: { id: String(req.params.id) } });
    if (!before) return res.status(404).json({ success: false, message: 'Claim not found' });
    const claim = await markMarketplaceClaimContacted({ claimId: before.id });
    await prisma.$transaction(async (tx) => writeMarketplaceAudit(tx, {
      action: 'CLAIM_CONTACTED', entityType: 'MarketplaceClaim', entityId: claim.id,
      actorAdminId: req.user.id, instituteId: claim.instituteId,
      before: { status: before.status }, after: { status: claim.status }
    }));
    return res.json({ success: true, data: await prisma.marketplaceClaim.findUniqueOrThrow({ where: { id: claim.id }, select: claimSelect }) });
  } catch (error: any) {
    return failure(res, error, 'Failed to contact claim');
  }
}

async function dispatchClaimNotification(input: {
  claimId: string;
  actorAdminId: string;
  retry: boolean;
}) {
  return prisma.$transaction(async (tx) => {
    const before = await tx.marketplaceClaim.findUnique({
      where: { id: input.claimId },
      include: { institute: true }
    });
    if (!before) throw new Error('CLAIM_NOT_FOUND');
    if (!['APPROVED', 'REJECTED'].includes(before.status)) throw new Error('CLAIM_NOT_DECIDED');

    const claimed = await tx.marketplaceClaim.updateMany({
      where: {
        id: before.id,
        OR: [
          { communicationStatus: { in: ['NOT_SENT', 'FAILED'] } },
          { communicationStatus: 'QUEUED', whatsappJobId: null }
        ]
      },
      data: {
        communicationStatus: 'QUEUED',
        whatsappJobId: null,
        communicationError: null,
        ...(input.retry ? { communicationRetryCount: { increment: 1 } } : {})
      }
    });
    if (claimed.count === 0) throw new Error('CLAIM_MESSAGE_NOT_RETRYABLE');

    const queuedClaim = await tx.marketplaceClaim.findUniqueOrThrow({ where: { id: before.id } });
    if (input.retry) {
      await writeMarketplaceAudit(tx, {
        action: 'CLAIM_MESSAGE_RETRIED', entityType: 'MarketplaceClaim', entityId: before.id,
        actorAdminId: input.actorAdminId, instituteId: before.instituteId,
        before: { communicationStatus: before.communicationStatus, retryCount: before.communicationRetryCount },
        after: { communicationStatus: 'QUEUED', retryCount: queuedClaim.communicationRetryCount }
      });
    }

    const enqueueInTransaction = (
      mobileNumber: string,
      templateName: string,
      componentValues: string[],
      instituteId?: string,
      tracking?: MarketplaceWhatsAppTracking
    ) => enqueueWhatsAppTracked(mobileNumber, templateName, componentValues, instituteId, tracking, tx);

    let result: TrackedWhatsAppEnqueueResult;
    try {
      const clientUrl = (process.env.CLIENT_URL || 'https://mathlogs.app').replace(/\/$/, '');
      result = before.status === 'APPROVED'
        ? await sendClaimApprovalNotification({
            phone: before.phone, claimantName: before.claimantName, instituteName: before.institute.name,
            loginUrl: `${clientUrl}/login`, instituteId: before.instituteId, claimId: before.id
          }, enqueueInTransaction)
        : await sendClaimRejectionNotification({
            phone: before.phone, claimantName: before.claimantName, instituteName: before.institute.name,
            rejectionReason: before.rejectionReason || 'Ownership could not be verified',
            supportUrl: `${clientUrl}/contact`, instituteId: before.instituteId, claimId: before.id
          }, enqueueInTransaction);
    } catch (error: any) {
      result = { queued: false, error: error?.message || 'WHATSAPP_ENQUEUE_FAILED' };
    }

    return tx.marketplaceClaim.update({
      where: { id: before.id },
      data: {
        communicationStatus: result.queued ? 'QUEUED' : 'FAILED',
        whatsappJobId: result.jobId || null,
        communicationError: result.queued ? null : (result.error || 'WHATSAPP_ENQUEUE_FAILED').slice(0, 500)
      },
      select: claimSelect
    });
  });
}

export async function approveClaim(req: any, res: Response) {
  const claimId = String(req.params.id);
  try {
    const current = await prisma.marketplaceClaim.findUnique({ where: { id: claimId }, select: claimSelect });
    if (!current) return res.status(404).json({ success: false, message: 'Claim not found' });
    if (current.status === 'APPROVED') return res.json({ success: true, data: current, idempotent: true });
    await approveMarketplaceClaim({
      claimId, actorAdminId: req.user.id, verificationNote: String(req.body?.verificationNote || '')
    });
    return res.json({
      success: true,
      data: await dispatchClaimNotification({ claimId, actorAdminId: req.user.id, retry: false })
    });
  } catch (error: any) {
    return failure(res, error, 'Failed to approve claim');
  }
}

export async function rejectClaim(req: any, res: Response) {
  const claimId = String(req.params.id);
  try {
    const current = await prisma.marketplaceClaim.findUnique({ where: { id: claimId }, select: claimSelect });
    if (!current) return res.status(404).json({ success: false, message: 'Claim not found' });
    if (current.status === 'REJECTED') return res.json({ success: true, data: current, idempotent: true });
    await rejectMarketplaceClaim({
      claimId, actorAdminId: req.user.id,
      verificationNote: String(req.body?.verificationNote || ''), rejectionReason: String(req.body?.rejectionReason || '')
    });
    return res.json({
      success: true,
      data: await dispatchClaimNotification({ claimId, actorAdminId: req.user.id, retry: false })
    });
  } catch (error: any) {
    return failure(res, error, 'Failed to reject claim');
  }
}

export async function resendClaimNotification(req: any, res: Response) {
  try {
    const updated = await dispatchClaimNotification({
      claimId: String(req.params.id), actorAdminId: req.user.id, retry: true
    });
    return res.json({ success: true, data: updated });
  } catch (error: any) {
    return failure(res, error, 'Failed to resend claim notification');
  }
}

export async function getMarketplaceOverview(_req: Request, res: Response) {
  const [listings, pendingClaims, pendingReviews, newLeads, heldLeads, failedLeadNotifications, recentActivity] = await Promise.all([
    prisma.institute.findMany({ select: listingSelect, orderBy: { updatedAt: 'desc' } }),
    prisma.marketplaceClaim.count({ where: { status: { in: ['NEW', 'CONTACTED'] } } }),
    prisma.review.count({ where: { status: 'PENDING', source: 'MATHLOGS' } }),
    prisma.leadInquiry.count({ where: { status: 'NEW', NOT: { studentName: { startsWith: LEGACY_CLAIM_MARKER } } } }),
    prisma.leadInquiry.count({ where: { deliveryStatus: 'HELD', NOT: { studentName: { startsWith: LEGACY_CLAIM_MARKER } } } }),
    prisma.leadInquiry.count({ where: { deliveryStatus: 'FAILED', NOT: { studentName: { startsWith: LEGACY_CLAIM_MARKER } } } }),
    prisma.marketplaceAuditLog.findMany({ select: activitySelect, orderBy: { createdAt: 'desc' }, take: 20 })
  ]);
  const enriched = listings.map(withCompleteness);
  return res.json({
    success: true,
    data: {
      metrics: {
        totalListings: enriched.length,
        publishedListings: enriched.filter((item) => item.isPubliclyListed).length,
        verifiedListings: enriched.filter((item) => item.isVerified).length,
        claimedListings: enriched.filter((item) => item.ownershipStatus === 'CLAIMED').length,
        googleConnected: enriched.filter((item) => Boolean(item.googlePlaceId)).length,
        pendingClaims, pendingReviews, newLeads, heldLeads, failedLeadNotifications,
        incompleteListings: enriched.filter((item) => item.profileCompleteness < 70).length
      },
      incompleteListings: enriched.filter((item) => item.profileCompleteness < 70),
      recentActivity: recentActivity.map(({ actorAdmin, ...item }) => ({ ...item, actor: actorAdmin }))
    }
  });
}

export async function listMarketplaceListings(req: Request, res: Response) {
  const query = String(req.query.query || '').trim();
  const filter = String(req.query.filter || '').toLowerCase();
  const where: Prisma.InstituteWhereInput = query ? { OR: [
    { name: { contains: query, mode: 'insensitive' } }, { teacherName: { contains: query, mode: 'insensitive' } },
    { phoneNumber: { contains: query } }, { publicPhone: { contains: query } },
    { city: { contains: query, mode: 'insensitive' } }, { area: { contains: query, mode: 'insensitive' } }
  ] } : {};
  if (filter === 'public') where.isPubliclyListed = true;
  else if (filter === 'hidden') where.isPubliclyListed = false;
  else if (filter === 'verified') where.isVerified = true;
  else if (filter === 'unverified') where.isVerified = false;
  else if (filter === 'claimed') where.ownershipStatus = 'CLAIMED';
  else if (filter === 'unclaimed') where.ownershipStatus = 'UNCLAIMED';
  else if (filter === 'google-connected' || filter === 'google') where.googlePlaceId = { not: null };
  const records = (await prisma.institute.findMany({ where, select: listingSelect, orderBy: { updatedAt: 'desc' }, take: 500 })).map(withCompleteness);
  const data = filter === 'incomplete' ? records.filter((item) => item.profileCompleteness < 70)
    : filter === 'google-stale' || filter === 'stale' ? records.filter((item) => item.googlePlaceId && (!item.googleLastSyncedAt || Date.now() - item.googleLastSyncedAt.getTime() > 7 * 86400_000))
    : records;
  return res.json({ success: true, data });
}

export async function getMarketplaceListing(req: Request, res: Response) {
  const listing = await prisma.institute.findUnique({ where: { id: String(req.params.id) }, select: listingSelect });
  if (!listing) return res.status(404).json({ success: false, message: 'Listing not found' });
  return res.json({ success: true, data: withCompleteness(listing) });
}

const protectedGoogleFields = new Set(['googlePlaceId', 'googleMapsUrl', 'googleRating', 'googleReviewCount', 'googleReviews', 'googlePhotos', 'googleLastSyncedAt']);
const stringFields = ['name', 'teacherName', 'phoneNumber', 'publicPhone', 'whatsappPhone', 'city', 'area', 'address', 'tagline', 'aboutUs', 'logoUrl'] as const;
const booleanFields = ['isPubliclyListed', 'isVerified'] as const;

export async function updateMarketplaceListing(req: any, res: Response) {
  const id = String(req.params.id);
  if ([...protectedGoogleFields].some((key) => Object.prototype.hasOwnProperty.call(req.body || {}, key))) {
    return res.status(400).json({ success: false, message: 'Google-derived fields can only be changed through Google sync' });
  }
  const expectedUpdatedAt = req.body?.expectedUpdatedAt;
  if (!expectedUpdatedAt || Number.isNaN(new Date(expectedUpdatedAt).getTime())) {
    return res.status(400).json({ success: false, message: 'expectedUpdatedAt is required' });
  }
  const data: Prisma.InstituteUpdateManyMutationInput = {};
  for (const field of stringFields) {
    if (req.body[field] !== undefined) {
      if (typeof req.body[field] !== 'string') return res.status(400).json({ success: false, message: `${field} must be a string` });
      const value = req.body[field].trim();
      if (field === 'name' && !value) return res.status(400).json({ success: false, message: 'name is required' });
      if (['phoneNumber', 'publicPhone', 'whatsappPhone'].includes(field) && value) {
        const digits = value.replace(/\D/g, '');
        if (digits.length < 10 || digits.length > 15) return res.status(400).json({ success: false, message: `${field} is invalid` });
      }
      (data as any)[field] = value || null;
    }
  }
  for (const field of booleanFields) {
    if (req.body[field] !== undefined) {
      if (typeof req.body[field] !== 'boolean') return res.status(400).json({ success: false, message: `${field} must be boolean` });
      (data as any)[field] = req.body[field];
    }
  }
  for (const field of ['subjectsOffered', 'classesOffered'] as const) {
    if (req.body[field] !== undefined) {
      if (!Array.isArray(req.body[field]) || req.body[field].some((value: unknown) => typeof value !== 'string')) {
        return res.status(400).json({ success: false, message: `${field} must be an array of strings` });
      }
      (data as any)[field] = req.body[field].map((value: string) => value.trim()).filter(Boolean);
    }
  }
  const before = await prisma.institute.findUnique({ where: { id }, select: listingSelect });
  if (!before) return res.status(404).json({ success: false, message: 'Listing not found' });
  const updated = await prisma.$transaction(async (tx) => {
    const result = await tx.institute.updateMany({ where: { id, updatedAt: new Date(expectedUpdatedAt) }, data });
    if (!result.count) return null;
    const after = await tx.institute.findUniqueOrThrow({ where: { id }, select: listingSelect });
    await writeMarketplaceAudit(tx, {
      action: 'LISTING_UPDATED', entityType: 'Institute', entityId: id, actorAdminId: req.user.id, instituteId: id,
      before: json(before), after: json(after), metadata: { changedFields: Object.keys(data) }
    });
    return after;
  });
  if (!updated) {
    const latest = await prisma.institute.findUnique({ where: { id }, select: listingSelect });
    return res.status(409).json({ success: false, message: 'Listing was updated by another operator', data: latest && withCompleteness(latest) });
  }
  return res.json({ success: true, data: withCompleteness(updated) });
}

export async function listMarketplaceReviews(req: Request, res: Response) {
  const status = req.query.status ? String(req.query.status).toUpperCase() : undefined;
  const query = String(req.query.query || '').trim();
  if (status && !['PENDING', 'APPROVED', 'REJECTED'].includes(status)) return res.status(400).json({ success: false, message: 'Invalid review status' });
  const data = await prisma.review.findMany({
    where: {
      source: 'MATHLOGS', ...(status ? { status } : {}),
      ...(query ? { OR: [
        { reviewerName: { contains: query, mode: 'insensitive' } }, { comment: { contains: query, mode: 'insensitive' } },
        { institute: { name: { contains: query, mode: 'insensitive' } } }
      ] } : {})
    },
    select: reviewSelect, orderBy: { createdAt: 'desc' }, take: 200
  });
  return res.json({ success: true, data });
}

export async function updateMarketplaceReview(req: any, res: Response) {
  const status = String(req.body?.status || '').toUpperCase();
  if (!['APPROVED', 'REJECTED'].includes(status)) return res.status(400).json({ success: false, message: 'Invalid review status' });
  const id = String(req.params.id);
  const review = await prisma.review.findUnique({ where: { id }, select: reviewSelect });
  if (!review || review.source !== 'MATHLOGS') return res.status(404).json({ success: false, message: 'Review not found' });
  const updated = await prisma.$transaction(async (tx) => {
    const value = await tx.review.update({ where: { id }, data: { status }, select: reviewSelect });
    await writeMarketplaceAudit(tx, {
      action: 'REVIEW_MODERATED', entityType: 'Review', entityId: id, actorAdminId: req.user.id, instituteId: review.institute.id,
      before: { status: review.status }, after: { status }
    });
    return value;
  });
  return res.json({ success: true, data: updated });
}

export async function listMarketplaceLeads(req: Request, res: Response) {
  const deliveryStatus = req.query.deliveryStatus ? String(req.query.deliveryStatus).toUpperCase() : undefined;
  const query = String(req.query.query || '').trim();
  if (deliveryStatus && !['HELD', 'QUEUED', 'DELIVERED', 'FAILED'].includes(deliveryStatus)) return res.status(400).json({ success: false, message: 'Invalid delivery status' });
  const data = await prisma.leadInquiry.findMany({
    where: {
      NOT: { studentName: { startsWith: LEGACY_CLAIM_MARKER } },
      ...(deliveryStatus ? { deliveryStatus } : {}),
      ...(query ? { OR: [
        { studentName: { contains: query, mode: 'insensitive' } }, { phone: { contains: query } },
        { subject: { contains: query, mode: 'insensitive' } }, { institute: { name: { contains: query, mode: 'insensitive' } } }
      ] } : {})
    },
    select: leadSelect, orderBy: { createdAt: 'desc' }, take: 500
  });
  return res.json({ success: true, data });
}

export async function retryMarketplaceLead(req: any, res: Response) {
  try {
    const lead = await retryMarketplaceLeadNotification({ leadId: String(req.params.id), actorAdminId: req.user.id });
    return res.json({ success: true, data: await prisma.leadInquiry.findUniqueOrThrow({ where: { id: lead.id }, select: leadSelect }) });
  } catch (error: any) {
    return failure(res, error, 'Failed to retry lead delivery');
  }
}

export async function releaseLead(req: any, res: Response) {
  try {
    const lead = await releaseMarketplaceLead({ leadId: String(req.params.id), actorAdminId: req.user.id });
    return res.json({ success: true, data: await prisma.leadInquiry.findUniqueOrThrow({ where: { id: lead.id }, select: leadSelect }) });
  } catch (error: any) {
    return failure(res, error, 'Failed to release lead');
  }
}

export async function listMarketplaceActivity(req: Request, res: Response) {
  const instituteId = req.query.instituteId ? String(req.query.instituteId) : undefined;
  const limit = Math.min(200, Math.max(1, Number.parseInt(String(req.query.limit || '50'), 10) || 50));
  const records = await prisma.marketplaceAuditLog.findMany({
    where: instituteId ? { instituteId } : {}, select: activitySelect, orderBy: { createdAt: 'desc' }, take: limit
  });
  return res.json({ success: true, data: records.map(({ actorAdmin, ...item }) => ({ ...item, actor: actorAdmin })) });
}

export async function searchGooglePlacesHandler(req: Request, res: Response) {
  const query = String(req.query.q || '').trim();
  if (!query) return res.status(400).json({ success: false, message: 'Search query is required' });
  try {
    return res.json({ success: true, data: await searchGooglePlaces(query) });
  } catch (error: any) {
    return res.status(502).json({ success: false, message: 'Failed to search Google Places' });
  }
}

export async function syncGooglePlaceHandler(req: any, res: Response) {
  const id = String(req.params.id);
  const placeId = String(req.body?.placeId || '').trim();
  if (!placeId) return res.status(400).json({ success: false, message: 'Google Place ID is required' });
  try {
    const [before, details] = await Promise.all([
      prisma.institute.findUnique({ where: { id }, select: listingSelect }), fetchGooglePlaceDetails(placeId)
    ]);
    if (!before) return res.status(404).json({ success: false, message: 'Listing not found' });
    if (!details) return res.status(404).json({ success: false, message: 'Google Place details not found' });
    const action = before.googlePlaceId ? 'GOOGLE_SYNCED' : 'GOOGLE_CONNECTED';
    const updated = await prisma.$transaction(async (tx) => {
      const value = await tx.institute.update({
        where: { id },
        data: {
          googlePlaceId: details.placeId, googleMapsUrl: details.mapsUrl || details.url,
          googleRating: details.rating, googleReviewCount: details.userRatingsTotal,
          googleReviews: details.reviews as any, googlePhotos: details.photos as any, googleLastSyncedAt: new Date()
        }, select: listingSelect
      });
      await writeMarketplaceAudit(tx, {
        action, entityType: 'Institute', entityId: id, actorAdminId: req.user.id, instituteId: id,
        before: json({ googlePlaceId: before.googlePlaceId, googleLastSyncedAt: before.googleLastSyncedAt }),
        after: json({ googlePlaceId: value.googlePlaceId, googleLastSyncedAt: value.googleLastSyncedAt })
      });
      return value;
    });
    return res.json({ success: true, data: updated });
  } catch (error) {
    console.error('Error syncing Google Place:', error);
    return res.status(502).json({ success: false, message: 'Failed to sync Google Place details' });
  }
}

export async function unlinkGooglePlaceHandler(req: any, res: Response) {
  const id = String(req.params.id);
  const before = await prisma.institute.findUnique({ where: { id }, select: listingSelect });
  if (!before) return res.status(404).json({ success: false, message: 'Listing not found' });
  const updated = await prisma.$transaction(async (tx) => {
    const value = await tx.institute.update({
      where: { id }, data: {
        googlePlaceId: null, googleMapsUrl: null, googleRating: null, googleReviewCount: null,
        googleReviews: Prisma.DbNull, googlePhotos: Prisma.DbNull, googleLastSyncedAt: null
      }, select: listingSelect
    });
    await writeMarketplaceAudit(tx, {
      action: 'GOOGLE_UNLINKED', entityType: 'Institute', entityId: id, actorAdminId: req.user.id, instituteId: id,
      before: json({ googlePlaceId: before.googlePlaceId, googleLastSyncedAt: before.googleLastSyncedAt }),
      after: json({ googlePlaceId: null, googleLastSyncedAt: null })
    });
    return value;
  });
  return res.json({ success: true, data: updated });
}
