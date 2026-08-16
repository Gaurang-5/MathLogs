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
import { OnboardingPaymentError, persistOnboardingOrder, provisionClaimedOnboardingPayment, verifyAndClaimOnboardingPayment } from '../services/onboardingPaymentService';
import { normalizeTrialOwnerIdentity } from '../services/subscriptionLifecycleService';
import { includedCreditPeriod, paidPlanExpiry } from '../domain/plans/entitlements';
import { scheduleLifecycleNotifications } from '../services/planNotificationService';

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
            const planStartDate = new Date();
            const trialEndsAt = new Date(planStartDate.getTime() + 14 * 86_400_000);

            const finalName = instituteName || 'New Institute';
            const finalTeacher = teacherName || '';
            const finalPhone = phoneNumber || '';
            const finalEmail = email || '';
            const plan = normalizePlanId(link.plan);
            if (plan === 'MARKETPLACE') return res.status(400).json({ error: 'Free trial requires Quiz or Enterprise.' });
            const ownerIdentityHash = crypto.createHmac('sha256', process.env.JWT_SECRET || 'local-lifecycle-secret').update(normalizeTrialOwnerIdentity(finalPhone || finalEmail)).digest('hex');
            const period = includedCreditPeriod({ planStartDate }, planStartDate);
            const tokenString = crypto.randomBytes(24).toString('hex');
            const provisioned = await prisma.$transaction(async tx => {
                const claimed = await tx.adminOnboardingLink.updateMany({ where: { id: link.id, status: 'PENDING', expiresAt: { gt: planStartDate } }, data: { status: 'PROCESSING' } });
                if (claimed.count !== 1) throw new OnboardingPaymentError('ONBOARDING_LINK_NOT_AVAILABLE');
                const newInstitute = await tx.institute.create({ data: {
                    name: finalName,
                    teacherName: finalTeacher,
                    phoneNumber: finalPhone,
                    email: finalEmail,
                    plan,
                    isQuizOnly: false,
                    quizCredits: 5,
                    includedQuizCredits: 5,
                    planStartDate,
                    planExpiryDate: trialEndsAt,
                    billingCycle: 'MONTHLY',
                    trialStartedAt: planStartDate,
                    trialEndsAt,
                    trialUsedAt: planStartDate,
                    marketplaceAccessGrantedAt: planStartDate,
                    includedQuizCreditsExpireAt: period.includedQuizCreditsExpireAt,
                    quizCreditsRenewAt: period.quizCreditsRenewAt,
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
                } });
                await tx.planTrialClaim.create({ data: { instituteId: newInstitute.id, ownerIdentityHash, plan, claimedAt: planStartDate, endsAt: trialEndsAt } });
                const invite = await tx.inviteToken.create({ data: {
                    token: tokenString,
                    instituteId: newInstitute.id,
                    expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
                } });
                await tx.adminOnboardingLink.update({ where: { id: link.id }, data: { status: 'USED', instituteId: newInstitute.id } });
                return { newInstitute, invite };
            });
            await scheduleLifecycleNotifications({ instituteId: provisioned.newInstitute.id, event: 'TRIAL_STARTED', effectiveAt: planStartDate, expiryAt: trialEndsAt, reference: `trial:${trialEndsAt.toISOString()}` }).catch(() => undefined);

            const clientUrl = getClientUrl(req);
            const setupLink = `${clientUrl}/setup?token=${provisioned.invite.token}`;

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
            const planEnum = normalizePlanId(link.plan);

            const planStartDate = new Date();
            const cycle = selectedBillingCycle;
            const planExpiryDate = link.plan === 'MARKETPLACE' ? null : paidPlanExpiry(planStartDate, cycle === 'monthly' ? 'MONTHLY' : 'YEARLY');
            const creditPeriod = link.plan === 'MARKETPLACE' ? null : includedCreditPeriod({ planStartDate }, planStartDate);

            const finalName = instituteName || 'New Institute';
            const finalTeacher = teacherName || '';
            const finalPhone = phoneNumber || '';
            const finalEmail = email || '';
            const tokenString = crypto.randomBytes(24).toString('hex');
            const provisioned = await prisma.$transaction(async tx => {
                const claimed = await tx.adminOnboardingLink.updateMany({
                    where: { id: link.id, status: 'PENDING', expiresAt: { gt: planStartDate } },
                    data: { status: 'PROCESSING' }
                });
                if (claimed.count !== 1) throw new OnboardingPaymentError('ONBOARDING_LINK_NOT_AVAILABLE');
                const newInstitute = await tx.institute.create({ data: {
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
                    includedQuizCreditsExpireAt: creditPeriod?.includedQuizCreditsExpireAt ?? null,
                    quizCreditsRenewAt: creditPeriod?.quizCreditsRenewAt ?? null,
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
                } });
                const invite = await tx.inviteToken.create({ data: {
                    token: tokenString,
                    instituteId: newInstitute.id,
                    expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
                } });
                await tx.adminOnboardingLink.update({
                    where: { id: link.id },
                    data: { status: 'USED', instituteId: newInstitute.id }
                });
                return { newInstitute, invite };
            });

            const clientUrl = getClientUrl(req);
            const setupLink = `${clientUrl}/setup?token=${provisioned.invite.token}`;

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
        await persistOnboardingOrder({
            providerOrderId: String(order.id), amountPaise: amountInPaise, plan: normalizePlanId(link.plan) as 'QUIZ' | 'ENTERPRISE',
            billingCycle: selectedBillingCycle.toUpperCase() as 'MONTHLY' | 'YEARLY', onboardingLinkId: link.id,
            provisioningData: { instituteName, teacherName, phoneNumber, email }
        });

        res.json({
            success: true,
            orderId: order.id,
            amount: order.amount,
            currency: order.currency,
            keyId: razorpayConfig.keyId,
        });

    } catch (error: any) {
        if (error instanceof OnboardingPaymentError) return res.status(409).json({ error: error.message });
        if (error?.code === 'P2002') return res.status(409).json({ error: 'TRIAL_ALREADY_USED' });
        console.error('Create Admin Onboarding Order Error:', error);
        res.status(500).json({ error: 'Failed to create payment order.' });
    }
};

// PUBLIC: Verify payment & provision institute for admin onboarding link
export const verifyAdminOnboardingPayment = async (req: Request, res: Response) => {
    try {
        const link = await prisma.adminOnboardingLink.findUnique({ where: { token: String(req.body.token || '') } });
        if (!link) return res.status(404).json({ error: 'Link not found.' });
        if (link.status !== 'PENDING') return res.status(400).json({ error: 'This link has already been used.' });
        if (new Date() > link.expiresAt) return res.status(400).json({ error: 'This link has expired.' });
        const payment = await verifyAndClaimOnboardingPayment({ orderId: String(req.body.razorpay_order_id || ''), paymentId: String(req.body.razorpay_payment_id || ''), signature: String(req.body.razorpay_signature || ''), onboardingLinkId: link.id });
        const provisioned = await provisionClaimedOnboardingPayment(payment);
        if (!provisioned.inviteToken) return res.status(409).json({ error: 'Setup already completed.' });
        const payload = payment.provisioningData as Record<string, any>;

        const clientUrl = getClientUrl(req);
        const setupLink = `${clientUrl}/setup?token=${provisioned.inviteToken}`;

        // Send setup link via WhatsApp + Email
        const notifPhone = String(payload.phoneNumber || '');
        const notificationData = {
            ownerName: String(payload.teacherName || 'there'),
            setupLink,
            tuitionName: String(payload.instituteName || 'New Institute')
        };

        if (notifPhone) {
            await Promise.allSettled([
                sendSetupLinkWhatsApp(notifPhone, notificationData),
                payload.email ? sendSetupLinkEmail(String(payload.email), notificationData) : Promise.resolve()
            ]);
        }

        res.json({
            success: true,
            setupLink,
            message: 'Payment verified. Setup link sent to your WhatsApp and email.'
        });

    } catch (error: any) {
        if (error instanceof OnboardingPaymentError) return res.status(['ONBOARDING_PAYMENT_ALREADY_USED', 'ONBOARDING_LINK_NOT_AVAILABLE'].includes(error.message) ? 409 : 400).json({ error: error.message });
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
