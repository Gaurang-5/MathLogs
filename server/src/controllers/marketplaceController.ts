import { Request, Response } from 'express';
import { prisma } from '../prisma';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { normalizeMarketplacePhone, submitMarketplaceClaim } from '../services/marketplaceClaimService';
import { createMarketplaceLead } from '../services/marketplaceLeadService';
import {
  MarketplaceCityValidationError,
  requireMarketplaceCity,
  validateMarketplacePublication,
} from '../domain/marketplace/location';
import { searchMarketplaceListings } from '../services/marketplaceSearchService';

const LEGACY_CLAIM_MARKER = '[CLAIM REQUEST]';

const JWT_SECRET = process.env.JWT_SECRET || 'secret';

// Utility to generate a slug from a string
function slugify(text: string): string {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, '')
    .replace(/[\s_-]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/**
 * Public Marketplace Search
 * GET /api/marketplace/search
 */
export async function searchMarketplace(req: Request, res: Response) {
  try {
    const targetClass = req.query.classGrade || req.query.class || req.query.className;
    const result = await searchMarketplaceListings({
      q: req.query.q ? String(req.query.q) : undefined,
      city: req.query.city ? String(req.query.city) : undefined,
      area: req.query.area ? String(req.query.area) : undefined,
      className: targetClass ? String(targetClass) : undefined,
      subject: req.query.subject ? String(req.query.subject) : undefined,
      sortBy: ['rating', 'reviews', 'newest'].includes(String(req.query.sortBy))
        ? String(req.query.sortBy) as 'rating' | 'reviews' | 'newest'
        : 'rating',
      page: Math.max(1, Number.parseInt(String(req.query.page || '1'), 10) || 1),
      limit: Math.min(50, Math.max(1, Number.parseInt(String(req.query.limit || '12'), 10) || 12)),
    });

    return res.json({
      success: true,
      data: result.items,
      pagination: {
        page: result.page,
        limit: result.limit,
        total: result.total,
        totalPages: Math.ceil(result.total / result.limit),
      },
      availableFilters: result.availableFilters,
    });
  } catch (error: any) {
    console.error('Error in searchMarketplace:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to search marketplace',
      error: error.message,
    });
  }
}

/**
 * Public Coaching Profile View
 * GET /api/marketplace/coaching/:slug
 */
export async function getCoachingPublicProfile(req: Request, res: Response) {
  try {
    const slugStr = Array.isArray(req.params.slug) ? req.params.slug[0] : req.params.slug;

    const institute: any = await prisma.institute.findFirst({
      where: {
        OR: [
          { slug: slugStr },
          { id: slugStr }
        ],
        isPubliclyListed: true,
        status: 'ACTIVE'
      },
      select: {
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
        googlePlaceId: true,
        googleMapsUrl: true,
        googleRating: true,
        googleReviewCount: true,
        googleReviews: true,
        googlePhotos: true,
        googleLastSyncedAt: true,
        subjectsOffered: true,
        classesOffered: true,
        plan: true,
        isExclusive: true,
        isVerified: true,
        createdAt: true,
        batches: {
          where: { isRegistrationOpen: true },
          select: {
            id: true,
            name: true,
            subject: true,
            className: true,
            timeSlot: true,
            feeAmount: true,
          }
        },
        reviews: {
          where: { status: 'APPROVED' },
          orderBy: { createdAt: 'desc' },
          select: {
            id: true,
            reviewerName: true,
            reviewerRole: true,
            rating: true,
            comment: true,
            source: true,
            googleAuthorUrl: true,
            createdAt: true
          }
        }
      }
    });

    if (!institute) {
      return res.status(404).json({ success: false, message: 'Coaching profile not found' });
    }

    const mathlogsReviewCount = institute.reviews.length;
    const mathlogsAvgRating = mathlogsReviewCount > 0
      ? Number((institute.reviews.reduce((acc: number, r: any) => acc + r.rating, 0) / mathlogsReviewCount).toFixed(1))
      : 0;

    const displayRating = institute.googleRating || mathlogsAvgRating;
    const totalReviewsCount = (institute.googleReviewCount || 0) + mathlogsReviewCount;

    const ratingBreakdown = { 5: 0, 4: 0, 3: 0, 2: 0, 1: 0 };
    institute.reviews.forEach((r: any) => {
      if (r.rating >= 1 && r.rating <= 5) {
        ratingBreakdown[r.rating as 1 | 2 | 3 | 4 | 5]++;
      }
    });

    const isSubscribedExclusive = institute.isExclusive || ['QUIZ', 'ENTERPRISE'].includes(institute.plan);

    return res.json({
      success: true,
      data: {
        id: institute.id,
        name: institute.name,
        slug: institute.slug || institute.id,
        teacherName: institute.teacherName || 'Faculty',
        phone: institute.publicPhone || institute.phoneNumber || null,
        whatsappPhone: institute.whatsappPhone || institute.publicPhone || institute.phoneNumber || null,
        city: institute.city || '',
        area: institute.area || '',
        address: institute.address || '',
        tagline: institute.tagline || '',
        aboutUs: institute.aboutUs || '',
        logoUrl: institute.logoUrl || null,
        googlePlaceId: institute.googlePlaceId || null,
        googleMapsUrl: institute.googleMapsUrl || null,
        googleRating: institute.googleRating || null,
        googleReviewCount: institute.googleReviewCount || 0,
        googleReviews: Array.isArray(institute.googleReviews) ? institute.googleReviews : [],
        googlePhotos: Array.isArray(institute.googlePhotos) ? institute.googlePhotos : [],
        googleLastSyncedAt: institute.googleLastSyncedAt || null,
        subjectsOffered: (institute.subjectsOffered as string[]) || [],
        classesOffered: (institute.classesOffered as string[]) || [],
        isExclusive: isSubscribedExclusive,
        isVerified: institute.isVerified || false,
        batches: institute.batches,
        avgRating: displayRating,
        reviewCount: totalReviewsCount,
        ratingBreakdown,
        reviews: institute.reviews
      }
    });
  } catch (error: any) {
    console.error('Error in getCoachingPublicProfile:', error);
    return res.status(500).json({ success: false, message: 'Failed to fetch coaching profile', error: error.message });
  }
}

/**
 * Submit Review for a Coaching
 * POST /api/marketplace/coaching/:id/reviews
 */
export async function submitReview(req: Request, res: Response) {
  try {
    const id = req.params.id as string;
    const { reviewerName, reviewerRole, rating, comment } = req.body;

    if (!reviewerName || !rating || !comment) {
      return res.status(400).json({ success: false, message: 'Reviewer name, rating, and comment are required' });
    }

    const ratingNum = parseInt(rating, 10);
    if (isNaN(ratingNum) || ratingNum < 1 || ratingNum > 5) {
      return res.status(400).json({ success: false, message: 'Rating must be a number between 1 and 5' });
    }

    const institute = await prisma.institute.findUnique({
      where: { id }
    });

    if (!institute) {
      return res.status(404).json({ success: false, message: 'Coaching not found' });
    }

    const review = await prisma.review.create({
      data: {
        instituteId: id,
        reviewerName: reviewerName.trim(),
        reviewerRole: (reviewerRole || 'Student').trim(),
        rating: ratingNum,
        comment: comment.trim(),
        status: 'PENDING'
      }
    });

    return res.status(201).json({
      success: true,
      message: 'Review submitted for moderation',
      data: review
    });
  } catch (error: any) {
    console.error('Error in submitReview:', error);
    return res.status(500).json({ success: false, message: 'Failed to submit review', error: error.message });
  }
}

/**
 * Submit Lead / Inquiry for a Coaching
 * POST /api/marketplace/coaching/:id/inquire
 */
export async function submitInquiry(req: Request, res: Response) {
  try {
    const id = req.params.id as string;
    const { studentName, phone, subject, classGrade, message } = req.body;

    if (typeof studentName !== 'string' || !studentName.trim() || typeof phone !== 'string' || !phone.trim()) {
      return res.status(400).json({ success: false, message: 'Student name and phone number are required' });
    }

    const { lead } = await createMarketplaceLead({
      instituteId: id, studentName, phone, subject, classGrade, message
    });
    const publicLead = {
      id: lead.id,
      instituteId: lead.instituteId,
      studentName: lead.studentName,
      phone: lead.phone,
      subject: lead.subject,
      classGrade: lead.classGrade,
      message: lead.message,
      status: lead.status,
      deliveryStatus: lead.deliveryStatus,
      possibleDuplicate: lead.possibleDuplicate,
      createdAt: lead.createdAt
    };

    return res.status(201).json({
      success: true,
      message: lead.deliveryStatus === 'HELD'
        ? "Inquiry received. It will be shared after this listing's ownership is verified."
        : 'Inquiry submitted successfully! The coaching teacher will contact you shortly.',
      data: publicLead
    });
  } catch (error: any) {
    console.error('Error in submitInquiry:', error);
    if (error.message === 'INSTITUTE_NOT_FOUND') {
      return res.status(404).json({ success: false, message: 'Coaching not found' });
    }
    if (error.message === 'INVALID_PHONE') {
      return res.status(400).json({ success: false, message: 'A valid phone number is required' });
    }
    return res.status(500).json({ success: false, message: 'Failed to submit inquiry', error: error.message });
  }
}

/**
 * Free External Teacher Self-Registration
 * POST /api/marketplace/register-teacher
 */
export async function registerExternalTeacher(req: Request, res: Response) {
  try {
    const {
      coachingName,
      teacherName,
      username,
      password,
      phoneNumber,
      city,
      area,
      address,
      tagline,
      subjectsOffered,
      classesOffered,
      googleMapsUrl
    } = req.body;

    if (!coachingName || !teacherName || !username || !password || !phoneNumber || !city) {
      return res.status(400).json({
        success: false,
        message: 'Coaching name, teacher name, username, password, phone, and city are required'
      });
    }

    const canonicalCity = requireMarketplaceCity(city);

    // Check if username is already taken
    const existingAdmin = await prisma.admin.findUnique({
      where: { username: username.trim() }
    });

    if (existingAdmin) {
      return res.status(400).json({ success: false, message: 'Username is already taken. Please choose another.' });
    }

    // Generate unique slug
    let baseSlug = slugify(coachingName);
    if (!baseSlug) baseSlug = 'coaching';
    let uniqueSlug = baseSlug;
    let count = 1;

    while (await prisma.institute.findUnique({ where: { slug: uniqueSlug } })) {
      uniqueSlug = `${baseSlug}-${count++}`;
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    // Create Institute and Admin user in transaction
    const result = await prisma.$transaction(async (tx) => {
      const institute = await tx.institute.create({
        data: {
          name: coachingName.trim(),
          teacherName: teacherName.trim(),
          slug: uniqueSlug,
          phoneNumber: phoneNumber.trim(),
          publicPhone: phoneNumber.trim(),
          whatsappPhone: phoneNumber.trim(),
          city: canonicalCity,
          area: area ? area.trim() : null,
          address: address ? address.trim() : null,
          googleMapsUrl: googleMapsUrl ? googleMapsUrl.trim() : null,
          tagline: tagline ? tagline.trim() : null,
          subjectsOffered: Array.isArray(subjectsOffered) ? subjectsOffered : (subjectsOffered ? [subjectsOffered] : []),
          classesOffered: Array.isArray(classesOffered) ? classesOffered : (classesOffered ? [classesOffered] : []),
          isPubliclyListed: true,
          ownershipStatus: 'CLAIMED',
          claimedPhone: phoneNumber.replace(/\D/g, ''),
          claimedAt: new Date(),
          isExclusive: false,
          plan: 'MARKETPLACE',
          billingCycle: 'ONE_TIME',
          marketplaceAccessGrantedAt: new Date(),
          status: 'ACTIVE'
        }
      });

      const admin = await tx.admin.create({
        data: {
          username: username.trim(),
          password: hashedPassword,
          role: 'INSTITUTE_ADMIN',
          instituteId: institute.id
        }
      });

      return { institute, admin };
    });

    const token = jwt.sign(
      {
        id: result.admin.id,
        userId: result.admin.id,
        role: result.admin.role,
        instituteId: result.institute.id
      },
      JWT_SECRET,
      { expiresIn: '30d' }
    );

    return res.status(201).json({
      success: true,
      message: 'Coaching listed successfully on MathLogs Marketplace!',
      token,
      institute: {
        id: result.institute.id,
        name: result.institute.name,
        slug: result.institute.slug,
        teacherName: result.institute.teacherName,
        city: result.institute.city,
        area: result.institute.area
      }
    });
  } catch (error: any) {
    if (error instanceof MarketplaceCityValidationError) {
      return res.status(400).json({ success: false, message: error.message });
    }
    console.error('Error in registerExternalTeacher:', error);
    return res.status(500).json({ success: false, message: 'Failed to register teacher listing', error: error.message });
  }
}

/**
 * Get Authenticated Institute Marketplace Profile
 * GET /api/marketplace/admin/profile
 */
export async function getMarketplaceProfile(req: any, res: Response) {
  try {
    const instituteId = req.user?.instituteId;
    if (!instituteId) {
      return res.status(400).json({ success: false, message: 'Institute context missing' });
    }

    const institute = await prisma.institute.findUnique({
      where: { id: instituteId },
      select: {
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
        logoUrl: true,
        subjectsOffered: true,
        classesOffered: true,
        isPubliclyListed: true,
        isExclusive: true,
        plan: true,
        isVerified: true
      }
    });

    if (!institute) {
      return res.status(404).json({ success: false, message: 'Institute not found' });
    }

    return res.json({
      success: true,
      data: institute
    });
  } catch (error: any) {
    console.error('Error in getMarketplaceProfile:', error);
    return res.status(500).json({ success: false, message: 'Failed to fetch marketplace profile', error: error.message });
  }
}

/**
 * Update Authenticated Institute Marketplace Profile
 * PUT /api/marketplace/admin/profile
 */
export async function updateMarketplaceProfile(req: any, res: Response) {
  try {
    const instituteId = req.user?.instituteId;
    if (!instituteId) {
      return res.status(400).json({ success: false, message: 'Institute context missing' });
    }

    const {
      name,
      teacherName,
      publicPhone,
      whatsappPhone,
      city,
      area,
      address,
      tagline,
      aboutUs,
      logoUrl,
      subjectsOffered,
      classesOffered,
      isPubliclyListed
    } = req.body;

    const currentInstitute = await prisma.institute.findUnique({
      where: { id: instituteId },
      select: { city: true, isPubliclyListed: true },
    });
    if (!currentInstitute) {
      return res.status(404).json({ success: false, message: 'Institute not found' });
    }

    const nextIsPubliclyListed = isPubliclyListed !== undefined
      ? Boolean(isPubliclyListed)
      : currentInstitute.isPubliclyListed;
    const nextCity = city !== undefined ? city : currentInstitute.city;
    const validatedCity = validateMarketplacePublication({
      isPubliclyListed: nextIsPubliclyListed,
      city: nextCity,
    });

    const updateData: any = { city: validatedCity };

    if (name !== undefined) updateData.name = name.trim();
    if (teacherName !== undefined) updateData.teacherName = teacherName.trim();
    if (publicPhone !== undefined) updateData.publicPhone = publicPhone.trim();
    if (whatsappPhone !== undefined) updateData.whatsappPhone = whatsappPhone.trim();
    if (area !== undefined) updateData.area = area.trim();
    if (address !== undefined) updateData.address = address.trim();
    if (tagline !== undefined) updateData.tagline = tagline.trim();
    if (aboutUs !== undefined) updateData.aboutUs = aboutUs.trim();
    if (logoUrl !== undefined) updateData.logoUrl = logoUrl.trim();
    if (subjectsOffered !== undefined) updateData.subjectsOffered = subjectsOffered;
    if (classesOffered !== undefined) updateData.classesOffered = classesOffered;
    if (isPubliclyListed !== undefined) updateData.isPubliclyListed = Boolean(isPubliclyListed);

    const updated = await prisma.institute.update({
      where: { id: instituteId },
      data: updateData,
      select: {
        id: true,
        name: true,
        slug: true,
        teacherName: true,
        publicPhone: true,
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
        isPubliclyListed: true,
        isExclusive: true
      }
    });

    return res.json({
      success: true,
      message: 'Marketplace profile updated successfully',
      data: updated
    });
  } catch (error: any) {
    if (error instanceof MarketplaceCityValidationError) {
      return res.status(400).json({ success: false, message: error.message });
    }
    console.error('Error in updateMarketplaceProfile:', error);
    return res.status(500).json({ success: false, message: 'Failed to update marketplace profile', error: error.message });
  }
}

/**
 * Get Student Leads / Inquiries for Institute Admin
 * GET /api/marketplace/admin/leads
 */
export async function getInstituteLeads(req: any, res: Response) {
  try {
    const instituteId = req.user?.instituteId;
    if (!instituteId) {
      return res.status(400).json({ success: false, message: 'Institute context missing' });
    }

    const leads = await prisma.leadInquiry.findMany({
      where: {
        instituteId,
        deliveryStatus: { not: 'HELD' },
        NOT: { studentName: { startsWith: LEGACY_CLAIM_MARKER } }
      },
      orderBy: { createdAt: 'desc' }
    });

    return res.json({
      success: true,
      data: leads
    });
  } catch (error: any) {
    console.error('Error in getInstituteLeads:', error);
    return res.status(500).json({ success: false, message: 'Failed to fetch student leads', error: error.message });
  }
}

/** PATCH /api/marketplace/admin/leads/:id */
export async function updateInstituteLeadStatus(req: any, res: Response) {
  const instituteId = req.user?.instituteId;
  if (!instituteId) return res.status(400).json({ success: false, message: 'Institute context missing' });
  const status = String(req.body?.status || '').toUpperCase();
  if (!['NEW', 'CONTACTED', 'ENROLLED', 'CLOSED'].includes(status)) {
    return res.status(400).json({ success: false, message: 'Invalid lead status' });
  }
  try {
    const result = await prisma.leadInquiry.updateMany({
      where: {
        id: String(req.params.id),
        instituteId,
        deliveryStatus: { not: 'HELD' },
        NOT: { studentName: { startsWith: LEGACY_CLAIM_MARKER } }
      },
      data: { status }
    });
    if (!result.count) return res.status(404).json({ success: false, message: 'Lead not found' });
    const lead = await prisma.leadInquiry.findFirstOrThrow({ where: { id: String(req.params.id), instituteId } });
    return res.json({ success: true, data: lead });
  } catch (error) {
    console.error('Error updating marketplace lead:', error);
    return res.status(500).json({ success: false, message: 'Failed to update lead' });
  }
}

/**
* Submit Claim Request for an unverified institute
 * POST /api/marketplace/coaching/:id/claim
 */
export async function submitClaimRequest(req: Request, res: Response) {
  try {
    const instId = String(req.params.id);
    const { claimantName, phone, email, proofNote } = req.body;

    if (typeof claimantName !== 'string' || !claimantName.trim() || typeof phone !== 'string' || !phone.trim()) {
      return res.status(400).json({ success: false, message: 'Claimant name and phone number are required.' });
    }

    const institute = await prisma.institute.findUnique({ where: { id: instId }, select: { id: true } });
    if (!institute) {
      return res.status(404).json({ success: false, message: 'Institute not found.' });
    }

    const normalizedPhone = normalizeMarketplacePhone(phone);
    const existing = await prisma.marketplaceClaim.findFirst({
      where: { instituteId: instId, normalizedPhone, status: { in: ['NEW', 'CONTACTED'] } },
      select: { id: true }
    });
    const claim = await submitMarketplaceClaim({ instituteId: instId, claimantName: claimantName.trim(), phone, email, proofNote });
    const deduplicated = existing?.id === claim.id;

    return res.status(deduplicated ? 200 : 201).json({
      success: true,
      deduplicated,
      message: 'Claim request submitted! Our verification team will review your request and get in touch with you.',
      data: { id: claim.id, status: claim.status, createdAt: claim.createdAt }
    });
  } catch (error: any) {
    console.error('Error submitting claim request:', error);
    if (error.message === 'INVALID_PHONE') return res.status(400).json({ success: false, message: 'A valid phone number is required.' });
    return res.status(500).json({ success: false, message: 'Failed to submit claim request.' });
  }
}
