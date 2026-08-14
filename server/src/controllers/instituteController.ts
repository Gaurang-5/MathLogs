import { Request, Response } from 'express';
import { prisma } from '../prisma';
import { secureLogger } from '../utils/secureLogger';


export const getGlobalAnalytics = async (req: Request, res: Response) => {
    // Only Super Admin should see global stats
    const user = req.user;
    if (user.role !== 'SUPER_ADMIN') {
        return res.status(403).json({ error: 'Unauthorized' });
    }

    try {
        const [totalStudents, totalInstitutes, totalBatches, revenueResult] = await Promise.all([
            prisma.student.count(),
            prisma.institute.count(),
            prisma.batch.count(),
            prisma.feePayment.aggregate({
                _sum: { amountPaid: true }
            })
        ]);

        // Mock DB Size Estimate (1 student record ~= 2KB incl related data)
        const estimatedDBSizeMB = ((totalStudents * 2048) / (1024 * 1024)).toFixed(2);

        res.json({
            totalStudents,
            totalInstitutes,
            totalBatches,
            totalRevenue: revenueResult._sum.amountPaid || 0,
            dbUsageMB: estimatedDBSizeMB
        });
    } catch (error) {
        console.error('Failed to fetch analytics:', error);
        res.status(500).json({ error: 'Failed to fetch analytics' });
    }
};

export const updateInstituteConfig = async (req: Request, res: Response) => {
    const id = req.params.id as string;
    const { config, isQuizOnly, quizCredits } = req.body;
    const user = req.user;

    if (user.role !== 'SUPER_ADMIN') {
        return res.status(403).json({ error: 'Unauthorized' });
    }

    try {
        const updateData: any = { config };
        if (isQuizOnly !== undefined) updateData.isQuizOnly = isQuizOnly;
        if (quizCredits !== undefined) updateData.quizCredits = quizCredits;

        const updated = await prisma.institute.update({
            where: { id },
            data: updateData
        });
        res.json(updated);
    } catch (error) {
        res.status(500).json({ error: 'Failed to update config' });
    }
};

export const updateInstituteDetails = async (req: Request, res: Response) => {
    const id = req.params.id as string;
    const { name, teacherName, phoneNumber, email } = req.body;
    const user = req.user;

    if (user.role !== 'SUPER_ADMIN') {
        return res.status(403).json({ error: 'Unauthorized' });
    }

    try {
        const updated = await prisma.institute.update({
            where: { id },
            data: {
                name,
                teacherName,
                phoneNumber,
                email
            }
        });
        res.json(updated);
    } catch (error) {
        res.status(500).json({ error: 'Failed to update institute details' });
    }
};

export const updateInstitutePlan = async (req: Request, res: Response) => {
    const id = req.params.id as string;
    const { plan, planExpiryDate, action } = req.body;
    const user = req.user;

    if (user.role !== 'SUPER_ADMIN') {
        return res.status(403).json({ error: 'Unauthorized' });
    }

    try {
        const institute = await prisma.institute.findUnique({ where: { id } });
        if (!institute) return res.status(404).json({ error: 'Institute not found' });

        if (action === 'REVOKE') {
            const currentConfig = (institute.config as any) || {};
            const updated = await prisma.institute.update({
                where: { id },
                data: {
                    plan: 'NO_PLAN',
                    planExpiryDate: new Date(),
                    razorpaySubscriptionId: null,
                    razorpayOrderId: null,
                    config: { ...currentConfig, maxStudents: 0 },
                    areRegistrationsPaused: true
                }
            });
            return res.json({ success: true, message: 'Plan revoked successfully.', updated });
        }

        const currentConfig = (institute.config as any) || {};
        const maxStudents = plan === 'PRO' ? 250 : plan === 'BASIC' ? 100 : plan === 'FREE' ? 100 : 0;
        const areRegistrationsPaused = plan === 'NO_PLAN';

        // Ensure that if a SuperAdmin activates a plan, the expiry date isn't stuck in the past
        let newExpiryDate = planExpiryDate ? new Date(planExpiryDate) : institute.planExpiryDate;
        const now = new Date();
        if (!planExpiryDate && plan && plan !== 'NO_PLAN') {
            if (!newExpiryDate || newExpiryDate.getTime() < now.getTime()) {
                newExpiryDate = new Date();
                if (plan === 'FREE') {
                    newExpiryDate.setDate(now.getDate() + 14); // 14-day free trial
                } else {
                    newExpiryDate.setMonth(now.getMonth() + 1); // 1-month cycle for PRO/BASIC defaults
                }
            }
        }

        const updated = await prisma.institute.update({
            where: { id },
            data: {
                plan: plan || institute.plan,
                planExpiryDate: newExpiryDate,
                config: { ...currentConfig, maxStudents },
                areRegistrationsPaused
            }
        });

        res.json({ success: true, message: 'Plan updated successfully.', updated });
    } catch (error) {
        console.error('Failed to update institute plan:', error);
        res.status(500).json({ error: 'Failed to update plan' });
    }
};


export const getInstituteDetails = async (req: Request, res: Response) => {
    const id = req.params.id as string;
    const user = req.user;

    if (user.role !== 'SUPER_ADMIN') {
        return res.status(403).json({ error: 'Unauthorized' });
    }

    try {
        const institute = await prisma.institute.findUnique({
            where: { id },
            include: {
                _count: {
                    select: { students: true, batches: true, admins: true }
                },
                admins: {
                    select: { id: true, username: true, role: true }
                }
            }
        });

        if (!institute) return res.status(404).json({ error: 'Institute not found' });

        // Calculate Detailed DB Usage
        const [studentCount, paymentCount, batchCount, testCount] = await Promise.all([
            prisma.student.count({ where: { instituteId: id } }),
            prisma.feePayment.count({ where: { student: { instituteId: id } } }),
            prisma.batch.count({ where: { instituteId: id } }),
            prisma.test.count({ where: { instituteId: id } })
        ]);

        // Rough size estimates (Bytes)
        const SIZES = { STUDENT: 2048, PAYMENT: 1024, BATCH: 4096, TEST: 5120 };
        const totalBytes = (studentCount * SIZES.STUDENT) +
            (paymentCount * SIZES.PAYMENT) +
            (batchCount * SIZES.BATCH) +
            (testCount * SIZES.TEST);

        const usageMB = (totalBytes / (1024 * 1024)).toFixed(3);

        res.json({
            ...institute,
            stats: {
                dbUsageMB: usageMB,
                recordCounts: {
                    students: studentCount,
                    payments: paymentCount,
                    batches: batchCount,
                    tests: testCount
                }
            }
        });

    } catch (error) {
        console.error('Failed to fetch institute details:', error);
        res.status(500).json({ error: 'Failed to fetch details' });
    }
};

export const suspendInstitute = async (req: Request, res: Response) => {
    const id = req.params.id as string;
    const { action, reason } = req.body; // action: 'SUSPEND' | 'ACTIVATE'
    const user = req.user;

    if (user.role !== 'SUPER_ADMIN') {
        return res.status(403).json({ error: 'Unauthorized' });
    }

    try {
        const status = action === 'SUSPEND' ? 'SUSPENDED' : 'ACTIVE';
        const updated = await prisma.institute.update({
            where: { id },
            data: {
                status,
                suspensionReason: action === 'SUSPEND' ? reason : null
            }
        });
        res.json(updated);
    } catch (error) {
        res.status(500).json({ error: 'Failed to update suspension status' });
    }
};

export const deleteInstitute = async (req: Request, res: Response) => {
    const id = req.params.id as string;
    const user = req.user;

    if (user.role !== 'SUPER_ADMIN') {
        return res.status(403).json({ error: 'Unauthorized' });
    }

    try {
        // ✅ AUDIT LOG: Record deletion attempt BEFORE action
        secureLogger.info(`[AUDIT] Institute Deletion Initiated`, {
            instituteId: id,
            superAdminId: user.id,
            superAdminUsername: user.username,
            timestamp: new Date().toISOString(),
            ip: req.ip || req.socket.remoteAddress
        });

        // Get institute details for audit
        const institute = await prisma.institute.findUnique({
            where: { id },
            select: { name: true, createdAt: true }
        });

        if (!institute) {
            return res.status(404).json({ error: 'Institute not found' });
        }

        // ✅ COMPLETE CASCADE DELETE: Delete all related data
        // Order matters: delete children before parents
        await prisma.$transaction([
            // Delete fee payments first (children of students)
            prisma.feePayment.deleteMany({ where: { student: { instituteId: id } } }),
            // Delete fee records (children of students)
            prisma.feeRecord.deleteMany({ where: { student: { instituteId: id } } }),
            // Delete marks (children of students via tests)
            prisma.mark.deleteMany({ where: { student: { instituteId: id } } }),
            // Delete students
            prisma.student.deleteMany({ where: { instituteId: id } }),
            // Delete fee installments (children of batches)
            prisma.feeInstallment.deleteMany({ where: { batch: { instituteId: id } } }),
            // Delete batches
            prisma.batch.deleteMany({ where: { instituteId: id } }),
            // Delete tests
            prisma.test.deleteMany({ where: { instituteId: id } }),
            // Delete admins
            prisma.admin.deleteMany({ where: { instituteId: id } }),
            // Delete invite tokens
            prisma.inviteToken.deleteMany({ where: { instituteId: id } }),
            // Finally, delete the institute itself
            prisma.institute.delete({ where: { id } })
        ]);

        // ✅ AUDIT LOG: Successful deletion
        secureLogger.info(`[AUDIT] Institute Deletion Completed`, {
            instituteId: id,
            instituteName: institute.name,
            superAdminId: user.id,
            timestamp: new Date().toISOString()
        });

        res.json({
            success: true,
            message: `Institute "${institute.name}" and all related data deleted permanently`
        });
    } catch (error) {
        console.error('[AUDIT] Institute Deletion FAILED:', {
            instituteId: id,
            superAdminId: user.id,
            error: error instanceof Error ? error.message : 'Unknown error',
            timestamp: new Date().toISOString()
        });
        res.status(500).json({ error: 'Failed to delete institute. Data constraints exist.' });
    }
};

export const getMyInstitute = async (req: Request, res: Response) => {
    try {
        const adminId = req.user.id;
        const admin = await prisma.admin.findUnique({
            where: { id: adminId },
            include: { institute: true }
        });
        if (!admin || !admin.institute) {
            return res.status(404).json({ error: "Institute not found" });
        }
        let institute = admin.institute;
        if (!institute.slug) {
            const baseSlug = institute.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)+/g, '');
            const randomSuffix = Math.random().toString(36).substring(2, 6);
            const generatedSlug = baseSlug ? `${baseSlug}-${randomSuffix}` : `inst-${randomSuffix}`;
            
            institute = await prisma.institute.update({
                where: { id: institute.id },
                data: { slug: generatedSlug }
            });
        }
        
        res.json(institute);
    } catch (error) {
        console.error("Error fetching my institute:", error);
        res.status(500).json({ error: "Failed to fetch institute" });
    }
};

export const getOnboardingLeads = async (req: Request, res: Response) => {
    try {
        if (req.user.role !== 'SUPER_ADMIN') {
            return res.status(403).json({ error: 'Only SuperAdmin can view leads' });
        }

        const leads = await prisma.onboardingLead.findMany({
            orderBy: { updatedAt: 'desc' },
            take: 100 // Limit to recent 100 to keep it performing
        });

        res.json(leads);
    } catch (error) {
        console.error('Fetch Leads Error:', error);
        res.status(500).json({ error: 'Failed to fetch leads' });
    }
};

export const uploadLogo = async (req: Request, res: Response) => {
    try {
        const adminId = req.user?.id;
        const admin = await prisma.admin.findUnique({
            where: { id: adminId },
            include: { institute: true }
        });

        if (!admin || !admin.institute) {
            return res.status(404).json({ error: "Institute not found" });
        }

        const { logo } = req.body;
        if (!logo || typeof logo !== 'string') {
            return res.status(400).json({ error: "No image file provided" });
        }

        // --- SECURITY VALIDATION: Prevent XSS, DOS, and File Spoofing ---

        // 1. Strict MIME type enforcement (PNG strictly required)
        if (!logo.startsWith('data:image/png;base64,')) {
            return res.status(400).json({ error: "Security Error: Invalid file format. Only true PNG is accepted." });
        }

        // 2. Base64 payload sanitization (Prevents arbitrary injection out of href/src boundaries)
        const base64Data = logo.substring(22); // length of 'data:image/png;base64,'
        const base64Regex = /^[A-Za-z0-9+/=]+$/;
        if (!base64Data || !base64Regex.test(base64Data)) {
            return res.status(400).json({ error: "Security Error: Malformed or malicious image data detected." });
        }

        // 3. Hard size limits (Enforce ~2MB payload ceiling to prevent DB flooding)
        // 3 * 1024 * 1024 = 3145728 character length threshold.
        if (logo.length > 3145728) {
            return res.status(413).json({ error: "Security Error: File payload exceeds acceptable size limits (Max 2MB)." });
        }

        let config = (admin.institute.config as any) || {};
        config = { ...config, logo };

        await prisma.institute.update({
            where: { id: admin.institute.id },
            data: { config }
        });

        res.json({ success: true, logo });
    } catch (error) {
        console.error("Error uploading logo:", error);
        res.status(500).json({ error: "Failed to upload logo" });
    }
};

export const updateMyInstituteConfig = async (req: Request, res: Response) => {
    try {
        const adminId = req.user?.id;
        const admin = await prisma.admin.findUnique({
            where: { id: adminId },
            include: { institute: true }
        });

        if (!admin || !admin.institute) {
            return res.status(404).json({ error: "Institute not found" });
        }

        const { subjects, allowedClasses, registrationForm } = req.body;

        // Use existing config and override the specific keys
        let config = (admin.institute.config as any) || {};

        if (subjects !== undefined) config.subjects = subjects;
        if (allowedClasses !== undefined) config.allowedClasses = allowedClasses;
        if (registrationForm !== undefined) config.registrationForm = registrationForm;

        await prisma.institute.update({
            where: { id: admin.institute.id },
            data: { config }
        });

        res.json({ success: true, message: "Coaching configuration updated successfully", config });
    } catch (error) {
        console.error("Error updating institute config:", error);
        res.status(500).json({ error: "Failed to update configuration" });
    }
};

/**
 * Helper to generate unique slug
 */
function slugify(text: string): string {
    return text
        .toLowerCase()
        .trim()
        .replace(/[^\w\s-]/g, '')
        .replace(/[\s_-]+/g, '-')
        .replace(/^-+|-+$/g, '');
}

/**
 * SuperAdmin Bulk Import Institutes & Teachers
 * POST /api/institutes/bulk-import
 */
export const bulkImportInstitutes = async (req: Request, res: Response) => {
    const user = req.user;
    if (user?.role !== 'SUPER_ADMIN') {
        return res.status(403).json({ error: 'Unauthorized. SuperAdmin privileges required.' });
    }

    try {
        const { institutes } = req.body;
        if (!Array.isArray(institutes) || institutes.length === 0) {
            return res.status(400).json({ error: 'An array of institutes is required in req.body.institutes' });
        }

        const createdInstitutes = [];
        for (const item of institutes) {
            if (!item.name || typeof item.name !== 'string' || !item.name.trim()) {
                continue;
            }

            const name = item.name.trim();
            const teacherName = item.teacherName ? item.teacherName.trim() : null;
            const city = item.city ? item.city.trim() : 'Muzaffarnagar';
            const area = item.area ? item.area.trim() : null;
            const address = item.address ? item.address.trim() : null;
            const phone = item.phone || item.publicPhone || item.phoneNumber || null;
            const whatsappPhone = item.whatsappPhone || phone || null;
            const tagline = item.tagline ? item.tagline.trim() : null;
            const aboutUs = item.aboutUs ? item.aboutUs.trim() : null;
            const logoUrl = item.logoUrl || null;
            const googleMapsUrl = item.googleMapsUrl || null;

            // Normalize subjects offered
            let subjectsOffered: string[] = [];
            if (Array.isArray(item.subjectsOffered)) {
                subjectsOffered = item.subjectsOffered.map((s: any) => String(s).trim()).filter(Boolean);
            } else if (typeof item.subjectsOffered === 'string') {
                subjectsOffered = item.subjectsOffered.split(',').map((s: string) => s.trim()).filter(Boolean);
            } else {
                subjectsOffered = ['Mathematics'];
            }

            // Normalize classes offered
            let classesOffered: string[] = [];
            if (Array.isArray(item.classesOffered)) {
                classesOffered = item.classesOffered.map((c: any) => String(c).trim()).filter(Boolean);
            } else if (typeof item.classesOffered === 'string') {
                classesOffered = item.classesOffered.split(',').map((c: string) => c.trim()).filter(Boolean);
            } else {
                classesOffered = ['Class 9', 'Class 10', 'Class 11', 'Class 12'];
            }

            // Generate unique slug
            let baseSlug = slugify(`${name} ${city}`);
            if (!baseSlug) baseSlug = `coaching-${Date.now()}`;
            let slug = baseSlug;
            let counter = 1;
            while (await prisma.institute.findUnique({ where: { slug } })) {
                slug = `${baseSlug}-${counter}`;
                counter++;
            }

            const created = await prisma.institute.create({
                data: {
                    name,
                    slug,
                    teacherName,
                    city,
                    area,
                    address,
                    publicPhone: phone,
                    phoneNumber: phone,
                    whatsappPhone,
                    tagline,
                    aboutUs,
                    logoUrl,
                    googleMapsUrl,
                    subjectsOffered,
                    classesOffered,
                    isPubliclyListed: item.isPubliclyListed !== false, // default true
                    isVerified: item.isVerified === true, // default false (unverified public listing)
                    status: 'ACTIVE',
                    plan: 'FREE'
                }
            });

            createdInstitutes.push(created);
        }

        res.json({
            success: true,
            message: `Successfully imported ${createdInstitutes.length} institutes`,
            count: createdInstitutes.length,
            institutes: createdInstitutes
        });
    } catch (error: any) {
        console.error('Error in bulkImportInstitutes:', error);
        res.status(500).json({ error: 'Failed to bulk import institutes: ' + error.message });
    }
};

/**
 * Toggle Public Listing or Verification Status for an Institute
 * PATCH /api/institutes/:id/toggle-listing
 */
export const toggleInstituteStatus = async (req: Request, res: Response) => {
    const user = req.user;
    if (user?.role !== 'SUPER_ADMIN') {
        return res.status(403).json({ error: 'Unauthorized. SuperAdmin privileges required.' });
    }

    try {
        const id = req.params.id as string;
        const { isPubliclyListed, isVerified } = req.body;

        const dataToUpdate: any = {};
        if (isPubliclyListed !== undefined) dataToUpdate.isPubliclyListed = Boolean(isPubliclyListed);
        if (isVerified !== undefined) dataToUpdate.isVerified = Boolean(isVerified);

        const updated = await prisma.institute.update({
            where: { id },
            data: dataToUpdate
        });

        res.json({ success: true, message: 'Institute listing status updated.', updated });
    } catch (error: any) {
        console.error('Error toggling institute status:', error);
        res.status(500).json({ error: 'Failed to update institute status' });
    }
};



