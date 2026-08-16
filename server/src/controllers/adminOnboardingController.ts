import { Request, Response } from 'express';
import { prisma } from '../prisma';
import Razorpay from 'razorpay';
import crypto from 'crypto';
import { getClientUrl } from '../utils/urlConfig';
import { sendSetupLinkWhatsApp } from '../utils/whatsapp';
import { sendSetupLinkEmail } from '../utils/email';
import { secureLogger } from '../utils/secureLogger';
import { getRazorpayConfig } from '../utils/env';
import { normalizePlanId, resolvePlanPrice } from '../domain/plans/planCatalog';

const razorpayConfig = getRazorpayConfig();

const razorpay = new Razorpay({
    key_id: razorpayConfig.keyId,
    key_secret: razorpayConfig.keySecret,
});

// Helper: Calculate actual price in paise for a link
function getPriceInPaise(link: any, billingCycle: 'monthly' | 'yearly'): number {
    const plan = normalizePlanId(link.plan);
    if (plan === 'MARKETPLACE') return 0;
    return resolvePlanPrice(plan, billingCycle === 'monthly' ? 'MONTHLY' : 'YEARLY');
}

// SUPER ADMIN: Create a custom onboarding link
export const createAdminOnboardingLink = async (req: Request, res: Response) => {
    const user = req.user;
    if (user.role !== 'SUPER_ADMIN') {
        return res.status(403).json({ error: 'Unauthorized' });
    }

    const {
        plan,
        billingCycle,
        startTrial = false,
    } = req.body;

    if (!['MARKETPLACE', 'QUIZ', 'ENTERPRISE'].includes(String(plan).toUpperCase())) return res.status(400).json({ error: 'Valid canonical plan is required.' });
    const canonicalPlan = String(plan).toUpperCase();
    const canonicalCycle = String(billingCycle).toUpperCase();
    if (canonicalPlan === 'MARKETPLACE' && (canonicalCycle !== 'ONE_TIME' || startTrial)) return res.status(400).json({ error: 'Marketplace requires ONE_TIME billing and has no trial.' });
    if (canonicalPlan !== 'MARKETPLACE' && !['MONTHLY', 'YEARLY'].includes(canonicalCycle)) return res.status(400).json({ error: 'Quiz and Enterprise require MONTHLY or YEARLY billing.' });

    try {
        const token = crypto.randomBytes(16).toString('hex');

        const link = await prisma.adminOnboardingLink.create({
            data: {
                token,
                plan: canonicalPlan,
                billingCycle: canonicalCycle,
                discountPercent: 0,
                customPriceMonthlyPaise: null,
                customPriceYearlyPaise: null,
                maxStudents: 0,
                isFreeTrial: Boolean(startTrial),
                trialDays: startTrial ? 14 : null,
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
            unlimitedStudents: true,
            isFreeTrial: link.isFreeTrial,
            trialDays: link.trialDays,
        });
    } catch (error) {
        console.error('Get Admin Onboarding Link Error:', error);
        res.status(500).json({ error: 'Failed to fetch link details.' });
    }
};

// PUBLIC: Create Razorpay order for an admin onboarding link
export const createAdminOnboardingOrder = async (req: Request, res: Response) => {
    const { token, billingCycle, instituteName, teacherName, phoneNumber, email } = req.body;

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

        // Handle FREE TRIAL links — skip payment entirely
        if (link.isFreeTrial) {
            const planEnum: any = link.plan;

            const planStartDate = new Date();
            const planExpiryDate = new Date();
            planExpiryDate.setDate(planExpiryDate.getDate() + (link.trialDays || 14));

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
                    isQuizOnly: false,
                    quizCredits: 5,
                    includedQuizCredits: 5,
                    planStartDate,
                    planExpiryDate,
                    billingCycle: (link.billingCycle || 'MONTHLY') as any,
                    trialStartedAt: planStartDate,
                    trialEndsAt: planExpiryDate,
                    trialUsedAt: planStartDate,
                    marketplaceAccessGrantedAt: planStartDate,
                    includedQuizCreditsExpireAt: planExpiryDate,
                    quizCreditsRenewAt: planExpiryDate,
                    config: {
                        requiresGrades: true,
                        billingCycle: 'trial',
                        trialDays: link.trialDays,
                        isTrial: true,
                        allowedClasses: ["Class 9", "Class 10"],
                        subjects: ["Mathematics"],
                        ...(link.plan === 'CUSTOM' ? {
                            customPriceMonthly: (link.customPriceMonthlyPaise || 0) / 100,
                            customPriceYearly: (link.customPriceYearlyPaise || 0) / 100,
                        } : {}),
                        ...(link.discountPercent ? { discountPercent: link.discountPercent } : {}),
                    }
                }
            });

            const tokenString = crypto.randomBytes(24).toString('hex');
            const invite = await prisma.inviteToken.create({
                data: {
                    token: tokenString,
                    instituteId: newInstitute.id,
                    expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
                }
            });

            await prisma.adminOnboardingLink.update({
                where: { id: link.id },
                data: { status: 'USED', instituteId: newInstitute.id }
            });

            const clientUrl = getClientUrl(req);
            const setupLink = `${clientUrl}/setup?token=${invite.token}`;

            const notificationData = {
                ownerName: finalTeacher || 'there',
                setupLink,
                tuitionName: finalName
            };

            if (finalPhone) {
                await Promise.allSettled([
                    sendSetupLinkWhatsApp(finalPhone, notificationData),
                    finalEmail ? sendSetupLinkEmail(finalEmail, notificationData) : Promise.resolve()
                ]);
            }

            return res.json({
                success: true,
                freeSetup: true,
                setupLink,
                message: `Your ${link.trialDays}-day free trial has been activated!`
            });
        }

        const selectedBillingCycle = String(link.billingCycle || '').toLowerCase();
        if (link.plan !== 'MARKETPLACE' && !['monthly', 'yearly'].includes(selectedBillingCycle)) return res.status(400).json({ error: 'Onboarding link has an invalid billing cycle.' });

        const amountInPaise = link.plan === 'MARKETPLACE' ? 0 : getPriceInPaise(link, selectedBillingCycle as 'monthly' | 'yearly');

        // Handle FREE plans (100% discount or ₹0 custom price)
        if (amountInPaise <= 0) {
            // Directly provision the institute — no payment needed
            const planEnum: any = link.plan;

            const planStartDate = new Date();
            const planExpiryDate = link.plan === 'MARKETPLACE' ? null : new Date();
            const cycle = selectedBillingCycle;
            if (planExpiryDate && cycle === 'monthly') {
                planExpiryDate.setDate(planExpiryDate.getDate() + 30);
            } else if (planExpiryDate) {
                planExpiryDate.setDate(planExpiryDate.getDate() + 365);
            }

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
                    isQuizOnly: false,
                    quizCredits: link.plan === 'MARKETPLACE' ? 0 : 5,
                    includedQuizCredits: link.plan === 'MARKETPLACE' ? 0 : 5,
                    planStartDate,
                    planExpiryDate,
                    billingCycle: link.plan === 'MARKETPLACE' ? 'ONE_TIME' : cycle.toUpperCase() as any,
                    marketplaceAccessGrantedAt: planStartDate,
                    includedQuizCreditsExpireAt: planExpiryDate,
                    quizCreditsRenewAt: planExpiryDate,
                    config: {
                        requiresGrades: true,
                        billingCycle: cycle,
                        allowedClasses: ["Class 9", "Class 10"],
                        subjects: ["Mathematics"],
                        ...(link.plan === 'CUSTOM' ? {
                            customPriceMonthly: (link.customPriceMonthlyPaise || 0) / 100,
                            customPriceYearly: (link.customPriceYearlyPaise || 0) / 100,
                        } : {}),
                        ...(link.discountPercent ? { discountPercent: link.discountPercent } : {}),
                    }
                }
            });

            // Create invite token for setup
            const tokenString = crypto.randomBytes(24).toString('hex');
            const invite = await prisma.inviteToken.create({
                data: {
                    token: tokenString,
                    instituteId: newInstitute.id,
                    expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
                }
            });

            // Mark the link as used
            await prisma.adminOnboardingLink.update({
                where: { id: link.id },
                data: { status: 'USED' }
            });

            const clientUrl = getClientUrl(req);
            const setupLink = `${clientUrl}/setup?token=${invite.token}`;

            // Send notifications
            const notifPhone = finalPhone;
            const notificationData = {
                ownerName: finalTeacher || 'there',
                setupLink,
                tuitionName: finalName
            };

            if (notifPhone) {
                await Promise.allSettled([
                    sendSetupLinkWhatsApp(notifPhone, notificationData),
                    finalEmail ? sendSetupLinkEmail(finalEmail, notificationData) : Promise.resolve()
                ]);
            }

            return res.json({
                success: true,
                freeSetup: true,
                setupLink,
                message: 'Your free plan has been activated! Setup link sent to your WhatsApp and email.'
            });
        }

        // Create Razorpay Order (for paid plans)
        const order = await razorpay.orders.create({
            amount: amountInPaise,
            currency: 'INR',
            receipt: `admin_onboard_${Date.now()}`,
            payment_capture: true,
            notes: {
                onboardingLinkToken: token,
                plan: link.plan,
                billingCycle: selectedBillingCycle,
                instituteName: instituteName || '',
                teacherName: teacherName || '',
            }
        });

        res.json({
            success: true,
            orderId: order.id,
            amount: order.amount,
            currency: order.currency,
            keyId: razorpayConfig.keyId,
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
    } = req.body;

    try {
        const link = await prisma.adminOnboardingLink.findUnique({
            where: { token }
        });

        if (!link) return res.status(404).json({ error: 'Link not found.' });
        if (link.status !== 'PENDING') return res.status(400).json({ error: 'This link has already been used.' });

        // 1. Verify Razorpay Signature
        const secret = razorpayConfig.keySecret;
        const bodyText = razorpay_order_id + '|' + razorpay_payment_id;
        const expectedSignature = crypto
            .createHmac('sha256', secret)
            .update(bodyText)
            .digest('hex');

        if (expectedSignature !== razorpay_signature) {
            return res.status(400).json({ error: 'Invalid payment signature.' });
        }

        // 2. Map plan to Tier enum
        const planEnum: any = link.plan;

        // 3. Set dates based on billing cycle
        const planStartDate = new Date();
        const planExpiryDate = new Date();
        const cycle = String(link.billingCycle || 'YEARLY').toLowerCase();
        if (cycle === 'monthly') {
            planExpiryDate.setDate(planExpiryDate.getDate() + 30);
        } else {
            planExpiryDate.setDate(planExpiryDate.getDate() + 365);
        }

        // 4. Create Institute (subjects/classes are configured on the /setup page)
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
                isQuizOnly: false,
                quizCredits: link.plan === 'MARKETPLACE' ? 0 : 5,
                includedQuizCredits: link.plan === 'MARKETPLACE' ? 0 : 5,
                planStartDate,
                planExpiryDate,
                billingCycle: cycle.toUpperCase() as any,
                marketplaceAccessGrantedAt: planStartDate,
                includedQuizCreditsExpireAt: planExpiryDate,
                quizCreditsRenewAt: planExpiryDate,
                config: {
                    requiresGrades: true,
                    billingCycle: cycle,
                    allowedClasses: ["Class 9", "Class 10"],
                    subjects: ["Mathematics"],
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

        // Send setup link via WhatsApp + Email
        const notifPhone = phoneNumber || '';
        const notificationData = {
            ownerName: finalTeacher || 'there',
            setupLink,
            tuitionName: finalName
        };

        if (notifPhone) {
            await Promise.allSettled([
                sendSetupLinkWhatsApp(notifPhone, notificationData),
                finalEmail ? sendSetupLinkEmail(finalEmail, notificationData) : Promise.resolve()
            ]);
        }

        res.json({
            success: true,
            setupLink,
            message: 'Payment verified. Setup link sent to your WhatsApp and email.'
        });

    } catch (error: any) {
        console.error('Verify Admin Onboarding Payment Error:', error);
        res.status(500).json({ error: 'Payment verification failed.' });
    }
};

// SUPER ADMIN: List all admin onboarding links
export const listAdminOnboardingLinks = async (req: Request, res: Response) => {
    const user = req.user;
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
