import { Request, Response } from 'express';
import { prisma } from '../prisma';
import Razorpay from 'razorpay';
import crypto from 'crypto';
import { getClientUrl } from '../utils/urlConfig';

const razorpay = new Razorpay({
    key_id: process.env.RAZORPAY_KEY_ID || 'dummy_key',
    key_secret: process.env.RAZORPAY_KEY_SECRET || 'dummy_secret',
});

// Base prices in paise
const BASE_PRICES = {
    BASIC: { monthly: 99900, yearly: 999900 },    // ₹999/mo, ₹9,999/yr
    PRO: { monthly: 199900, yearly: 1999900 },      // ₹1,999/mo, ₹19,999/yr
};

// Helper: Calculate actual price in paise for a link
function getPriceInPaise(link: any, billingCycle: 'monthly' | 'yearly'): number {
    if (link.plan === 'CUSTOM') {
        return billingCycle === 'monthly'
            ? (link.customPriceMonthlyPaise || 0)
            : (link.customPriceYearlyPaise || 0);
    }

    const base = BASE_PRICES[link.plan as 'BASIC' | 'PRO'];
    if (!base) return 0;
    const basePrice = billingCycle === 'monthly' ? base.monthly : base.yearly;
    const discount = link.discountPercent || 0;
    return Math.round(basePrice * (1 - discount / 100));
}

// SUPER ADMIN: Create a custom onboarding link
export const createAdminOnboardingLink = async (req: Request, res: Response) => {
    const user = (req as any).user;
    if (user.role !== 'SUPER_ADMIN') {
        return res.status(403).json({ error: 'Unauthorized' });
    }

    const {
        plan, // BASIC, PRO, CUSTOM
        discountPercent = 0,
        customPriceMonthly = 0,
        customPriceYearly = 0,
        maxStudents,
    } = req.body;

    if (!plan || !['BASIC', 'PRO', 'CUSTOM'].includes(plan)) {
        return res.status(400).json({ error: 'Valid plan is required (BASIC, PRO, CUSTOM).' });
    }

    if (plan === 'CUSTOM' && !customPriceMonthly && !customPriceYearly) {
        return res.status(400).json({ error: 'At least one custom price (monthly or yearly) is required for Custom plan.' });
    }

    // Resolve max students: BASIC=100, PRO=250, CUSTOM=user-specified
    let resolvedMaxStudents = Number(maxStudents) || 100;
    if (plan === 'BASIC') resolvedMaxStudents = 100;
    else if (plan === 'PRO') resolvedMaxStudents = 250;

    try {
        const token = crypto.randomBytes(16).toString('hex');

        const link = await prisma.adminOnboardingLink.create({
            data: {
                token,
                plan,
                discountPercent: plan !== 'CUSTOM' ? Math.min(100, Math.max(0, Number(discountPercent))) : 0,
                customPriceMonthlyPaise: plan === 'CUSTOM' ? Math.round(Number(customPriceMonthly) * 100) : null,
                customPriceYearlyPaise: plan === 'CUSTOM' ? Math.round(Number(customPriceYearly) * 100) : null,
                maxStudents: resolvedMaxStudents,
                expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) // 30 days
            }
        });

        const clientUrl = getClientUrl(req);
        const onboardUrl = `${clientUrl}/join/${link.token}`;

        res.json({
            success: true,
            link: onboardUrl,
            token: link.token,
            id: link.id
        });
    } catch (error: any) {
        console.error('Create Admin Onboarding Link Error:', error);
        res.status(500).json({ error: 'Failed to create onboarding link.' });
    }
};

// PUBLIC: Get onboarding link details (for the join page)
export const getAdminOnboardingLink = async (req: Request, res: Response) => {
    const { token } = req.params;

    try {
        const link = await prisma.adminOnboardingLink.findUnique({
            where: { token: String(token) }
        });

        if (!link) return res.status(404).json({ error: 'Link not found.' });
        if (link.status !== 'PENDING') return res.status(400).json({ error: 'This link has already been used.' });
        if (new Date() > link.expiresAt) return res.status(400).json({ error: 'This link has expired.' });

        // Calculate prices for display
        const monthlyPrice = getPriceInPaise(link, 'monthly') / 100;
        const yearlyPrice = getPriceInPaise(link, 'yearly') / 100;

        res.json({
            valid: true,
            plan: link.plan,
            discountPercent: link.discountPercent,
            monthlyPrice,
            yearlyPrice,
            maxStudents: link.maxStudents,
        });
    } catch (error) {
        console.error('Get Admin Onboarding Link Error:', error);
        res.status(500).json({ error: 'Failed to fetch link details.' });
    }
};

// PUBLIC: Create Razorpay order for an admin onboarding link
export const createAdminOnboardingOrder = async (req: Request, res: Response) => {
    const { token, billingCycle, instituteName, teacherName, phoneNumber, email } = req.body;

    if (!billingCycle || !['monthly', 'yearly'].includes(billingCycle)) {
        return res.status(400).json({ error: 'Valid billing cycle (monthly/yearly) is required.' });
    }

    try {
        const link = await prisma.adminOnboardingLink.findUnique({
            where: { token }
        });

        if (!link) return res.status(404).json({ error: 'Link not found.' });
        if (link.status !== 'PENDING') return res.status(400).json({ error: 'This link has already been used.' });
        if (new Date() > link.expiresAt) return res.status(400).json({ error: 'This link has expired.' });

        // Check for existing account
        if (phoneNumber) {
            const existingAdmin = await prisma.admin.findUnique({ where: { username: phoneNumber } });
            if (existingAdmin) {
                return res.status(400).json({ error: 'An account with this phone number already exists.' });
            }
        }

        // Calculate price based on user's chosen billing cycle
        const amountInPaise = getPriceInPaise(link, billingCycle as 'monthly' | 'yearly');

        if (amountInPaise <= 0) {
            return res.status(400).json({ error: 'Invalid pricing configuration. Contact admin.' });
        }

        // Create Razorpay Order
        const order = await razorpay.orders.create({
            amount: amountInPaise,
            currency: 'INR',
            receipt: `admin_onboard_${Date.now()}`,
            payment_capture: true,
            notes: {
                onboardingLinkToken: token,
                plan: link.plan,
                billingCycle,
                instituteName: instituteName || '',
                teacherName: teacherName || '',
            }
        });

        res.json({
            success: true,
            orderId: order.id,
            amount: order.amount,
            currency: order.currency,
            keyId: process.env.RAZORPAY_KEY_ID || 'dummy_key',
        });

    } catch (error: any) {
        console.error('Create Admin Onboarding Order Error:', error);
        res.status(500).json({ error: 'Failed to create payment order.' });
    }
};

// PUBLIC: Verify payment & provision institute for admin onboarding link
export const verifyAdminOnboardingPayment = async (req: Request, res: Response) => {
    const {
        token,
        razorpay_order_id,
        razorpay_payment_id,
        razorpay_signature,
        billingCycle,
        instituteName,
        teacherName,
        phoneNumber,
        email,
        subjects,
        allowedClasses,
        requiresGrades = true
    } = req.body;

    try {
        const link = await prisma.adminOnboardingLink.findUnique({
            where: { token }
        });

        if (!link) return res.status(404).json({ error: 'Link not found.' });
        if (link.status !== 'PENDING') return res.status(400).json({ error: 'This link has already been used.' });

        // 1. Verify Razorpay Signature
        const secret = process.env.RAZORPAY_KEY_SECRET || 'dummy_secret';
        const bodyText = razorpay_order_id + '|' + razorpay_payment_id;
        const expectedSignature = crypto
            .createHmac('sha256', secret)
            .update(bodyText)
            .digest('hex');

        if (expectedSignature !== razorpay_signature) {
            return res.status(400).json({ error: 'Invalid payment signature.' });
        }

        // 2. Map plan to Tier enum
        let planEnum: any = 'BASIC';
        if (link.plan === 'PRO') planEnum = 'PRO';
        else if (link.plan === 'CUSTOM') planEnum = 'ENTERPRISE';

        // 3. Set dates based on billing cycle
        const planStartDate = new Date();
        const planExpiryDate = new Date();
        const cycle = billingCycle || 'yearly';
        if (cycle === 'monthly') {
            planExpiryDate.setDate(planExpiryDate.getDate() + 30);
        } else {
            planExpiryDate.setDate(planExpiryDate.getDate() + 365);
        }

        // 4. Build subjects & classes lists from user input
        let subjectList = ['Mathematics'];
        if (subjects) {
            subjectList = subjects.split(',').map((s: string) => s.trim()).filter(Boolean);
        }
        let classList: string[] = [];
        if (allowedClasses) {
            classList = allowedClasses.split(',').map((s: string) => s.trim()).filter(Boolean);
        }

        // 5. Create Institute
        const finalName = instituteName || 'New Institute';
        const finalTeacher = teacherName || '';
        const finalPhone = phoneNumber || '';
        const finalEmail = email || '';

        const newInstitute = await prisma.institute.create({
            data: {
                name: finalName,
                teacherName: finalTeacher,
                phoneNumber: finalPhone,
                email: finalEmail,
                plan: planEnum,
                planStartDate,
                planExpiryDate,
                config: {
                    requiresGrades: requiresGrades,
                    maxStudents: link.maxStudents,
                    planName: link.plan,
                    billingCycle: cycle,
                    allowedClasses: classList.length > 0 ? classList : ["Class 9", "Class 10"],
                    subjects: subjectList,
                    // Store pricing info for billing page renewals
                    ...(link.plan === 'CUSTOM' ? {
                        customPriceMonthly: (link.customPriceMonthlyPaise || 0) / 100,
                        customPriceYearly: (link.customPriceYearlyPaise || 0) / 100,
                    } : {}),
                    ...(link.discountPercent ? { discountPercent: link.discountPercent } : {}),
                }
            }
        });

        // 6. Create invite token for the setup page
        const tokenString = crypto.randomBytes(24).toString('hex');
        const invite = await prisma.inviteToken.create({
            data: {
                token: tokenString,
                instituteId: newInstitute.id,
                expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
            }
        });

        // 7. Mark admin onboarding link as PAID
        await prisma.adminOnboardingLink.update({
            where: { id: link.id },
            data: {
                status: 'PAID',
                billingCycle: cycle,
                instituteId: newInstitute.id,
            }
        });

        const clientUrl = getClientUrl(req);
        const setupLink = `${clientUrl}/setup?token=${invite.token}`;

        res.json({
            success: true,
            setupLink,
            message: 'Payment verified. Redirecting to account setup.'
        });

    } catch (error: any) {
        console.error('Verify Admin Onboarding Payment Error:', error);
        res.status(500).json({ error: 'Payment verification failed.' });
    }
};

// SUPER ADMIN: List all admin onboarding links
export const listAdminOnboardingLinks = async (req: Request, res: Response) => {
    const user = (req as any).user;
    if (user.role !== 'SUPER_ADMIN') {
        return res.status(403).json({ error: 'Unauthorized' });
    }

    try {
        const links = await prisma.adminOnboardingLink.findMany({
            orderBy: { createdAt: 'desc' },
            take: 50
        });

        res.json(links.map((l: any) => ({
            ...l,
            monthlyPrice: getPriceInPaise(l, 'monthly') / 100,
            yearlyPrice: getPriceInPaise(l, 'yearly') / 100,
        })));
    } catch (error) {
        console.error('List Admin Onboarding Links Error:', error);
        res.status(500).json({ error: 'Failed to fetch links.' });
    }
};
