import { Request, Response } from 'express';
import { prisma } from '../prisma';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';

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
    const {
      q,
      subject,
      city,
      area,
      exclusiveOnly,
      sortBy = 'exclusive',
      page = '1',
      limit = '12'
    } = req.query;

    const pageNum = Math.max(1, parseInt(page as string, 10) || 1);
    const limitNum = Math.min(50, Math.max(1, parseInt(limit as string, 10) || 12));
    const skip = (pageNum - 1) * limitNum;

    const where: any = {
      isPubliclyListed: true,
      status: 'ACTIVE',
    };

    if (exclusiveOnly === 'true') {
      where.OR = [
        { isExclusive: true },
        { plan: { not: 'FREE' } }
      ];
    }

    if (q) {
      const searchTerm = (q as string).trim();
      where.AND = where.AND || [];
      where.AND.push({
        OR: [
          { name: { contains: searchTerm, mode: 'insensitive' } },
          { teacherName: { contains: searchTerm, mode: 'insensitive' } },
          { tagline: { contains: searchTerm, mode: 'insensitive' } },
          { area: { contains: searchTerm, mode: 'insensitive' } },
          { city: { contains: searchTerm, mode: 'insensitive' } },
        ]
      });
    }

    if (city) {
      where.city = { equals: (city as string).trim(), mode: 'insensitive' };
    }

    if (area) {
      where.area = { contains: (area as string).trim(), mode: 'insensitive' };
    }

    // Fetch matching institutes
    const institutes = await prisma.institute.findMany({
      where,
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
        subjectsOffered: true,
        classesOffered: true,
        plan: true,
        isExclusive: true,
        isVerified: true,
        reviews: {
          where: { status: 'APPROVED' },
          select: { rating: true }
        }
      }
    });

    // Filter by subject if specified (in memory since subjectsOffered is Json)
    let filtered = institutes;
    if (subject) {
      const targetSubject = (subject as string).toLowerCase().trim();
      filtered = institutes.filter(inst => {
        const subjects = inst.subjectsOffered as string[] | null;
        if (!subjects || !Array.isArray(subjects)) return false;
        return subjects.some(s => typeof s === 'string' && s.toLowerCase().includes(targetSubject));
      });
    }

    // Map and compute average ratings & exclusive status
    const mapped = filtered.map(inst => {
      const isSubscribedExclusive = inst.isExclusive || inst.plan !== 'FREE';
      const reviewCount = inst.reviews.length;
      const avgRating = reviewCount > 0
        ? Number((inst.reviews.reduce((acc, r) => acc + r.rating, 0) / reviewCount).toFixed(1))
        : 0;

      // Extract phone numbers prioritizing explicit public phone
      const phone = inst.publicPhone || inst.phoneNumber || null;
      const whatsapp = inst.whatsappPhone || inst.publicPhone || inst.phoneNumber || null;

      return {
        id: inst.id,
        name: inst.name,
        slug: inst.slug || inst.id,
        teacherName: inst.teacherName || 'Faculty',
        phone,
        whatsappPhone: whatsapp,
        city: inst.city || 'Local',
        area: inst.area || '',
        address: inst.address || '',
        tagline: inst.tagline || '',
        aboutUs: inst.aboutUs || '',
        logoUrl: inst.logoUrl || null,
        subjectsOffered: (inst.subjectsOffered as string[]) || [],
        classesOffered: (inst.classesOffered as string[]) || [],
        isExclusive: isSubscribedExclusive,
        isVerified: inst.isVerified || isSubscribedExclusive,
        avgRating,
        reviewCount
      };
    });

    // Sort: Exclusive first (default), rating, or newest
    mapped.sort((a, b) => {
      if (sortBy === 'rating') {
        if (b.avgRating !== a.avgRating) return b.avgRating - a.avgRating;
        return b.reviewCount - a.reviewCount;
      }
      
      // Default: Exclusive priority first, then highest rating
      if (a.isExclusive !== b.isExclusive) {
        return a.isExclusive ? -1 : 1;
      }
      return b.avgRating - a.avgRating;
    });

    // Pagination
    const total = mapped.length;
    const paginatedItems = mapped.slice(skip, skip + limitNum);

    // Extract unique cities & subjects for filter option dropdowns
    const allCities = Array.from(new Set(institutes.map(i => i.city).filter(Boolean)));
    const allSubjectsSet = new Set<string>();
    institutes.forEach(i => {
      const subs = i.subjectsOffered as string[] | null;
      if (Array.isArray(subs)) {
        subs.forEach(s => typeof s === 'string' && allSubjectsSet.add(s));
      }
    });

    return res.json({
      success: true,
      data: paginatedItems,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total,
        totalPages: Math.ceil(total / limitNum)
      },
      availableFilters: {
        cities: allCities,
        subjects: Array.from(allSubjectsSet)
      }
    });
  } catch (error: any) {
    console.error('Error in searchMarketplace:', error);
    return res.status(500).json({ success: false, message: 'Failed to search marketplace', error: error.message });
  }
}

/**
 * Public Coaching Profile View
 * GET /api/marketplace/coaching/:slug
 */
export async function getCoachingPublicProfile(req: Request, res: Response) {
  try {
    const { slug } = req.params;

    const institute = await prisma.institute.findFirst({
      where: {
        OR: [
          { slug: slug },
          { id: slug }
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
            createdAt: true
          }
        }
      }
    });

    if (!institute) {
      return res.status(404).json({ success: false, message: 'Coaching profile not found' });
    }

    const reviewCount = institute.reviews.length;
    const avgRating = reviewCount > 0
      ? Number((institute.reviews.reduce((acc, r) => acc + r.rating, 0) / reviewCount).toFixed(1))
      : 0;

    const ratingBreakdown = { 5: 0, 4: 0, 3: 0, 2: 0, 1: 0 };
    institute.reviews.forEach(r => {
      if (r.rating >= 1 && r.rating <= 5) {
        ratingBreakdown[r.rating as 1 | 2 | 3 | 4 | 5]++;
      }
    });

    const isSubscribedExclusive = institute.isExclusive || institute.plan !== 'FREE';

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
        subjectsOffered: (institute.subjectsOffered as string[]) || [],
        classesOffered: (institute.classesOffered as string[]) || [],
        isExclusive: isSubscribedExclusive,
        isVerified: institute.isVerified || isSubscribedExclusive,
        batches: institute.batches,
        avgRating,
        reviewCount,
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
    const { id } = req.params;
    const { reviewerName, reviewerRole = 'Student', rating, comment } = req.body;

    if (!reviewerName || !rating || !comment) {
      return res.status(400).json({ success: false, message: 'Name, rating, and review comment are required' });
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
        status: 'APPROVED'
      }
    });

    return res.status(201).json({
      success: true,
      message: 'Review submitted successfully',
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
    const { id } = req.params;
    const { studentName, phone, subject, classGrade, message } = req.body;

    if (!studentName || !phone) {
      return res.status(400).json({ success: false, message: 'Student name and phone number are required' });
    }

    const institute = await prisma.institute.findUnique({
      where: { id }
    });

    if (!institute) {
      return res.status(404).json({ success: false, message: 'Coaching not found' });
    }

    const lead = await prisma.leadInquiry.create({
      data: {
        instituteId: id,
        studentName: studentName.trim(),
        phone: phone.trim(),
        subject: subject ? subject.trim() : null,
        classGrade: classGrade ? classGrade.trim() : null,
        message: message ? message.trim() : null,
        status: 'NEW'
      }
    });

    return res.status(201).json({
      success: true,
      message: 'Inquiry submitted successfully! The coaching teacher will contact you shortly.',
      data: lead
    });
  } catch (error: any) {
    console.error('Error in submitInquiry:', error);
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
      classesOffered
    } = req.body;

    if (!coachingName || !teacherName || !username || !password || !phoneNumber || !city) {
      return res.status(400).json({
        success: false,
        message: 'Coaching name, teacher name, username, password, phone, and city are required'
      });
    }

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
          city: city.trim(),
          area: area ? area.trim() : null,
          address: address ? address.trim() : null,
          tagline: tagline ? tagline.trim() : null,
          subjectsOffered: Array.isArray(subjectsOffered) ? subjectsOffered : (subjectsOffered ? [subjectsOffered] : []),
          classesOffered: Array.isArray(classesOffered) ? classesOffered : (classesOffered ? [classesOffered] : []),
          isPubliclyListed: true,
          isExclusive: false,
          plan: 'FREE',
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

    const updateData: any = {};

    if (name !== undefined) updateData.name = name.trim();
    if (teacherName !== undefined) updateData.teacherName = teacherName.trim();
    if (publicPhone !== undefined) updateData.publicPhone = publicPhone.trim();
    if (whatsappPhone !== undefined) updateData.whatsappPhone = whatsappPhone.trim();
    if (city !== undefined) updateData.city = city.trim();
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
      where: { instituteId },
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
