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
import { planSubscriptionCheckoutService } from '../services/planSubscriptionCheckoutService';
import { planSubscriptionLifecycleService } from '../services/planSubscriptionLifecycleService';
import { type ProvisioningInput } from '../services/accountProvisioningService';

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
    if (canonicalPlan === 'MARKETPLACE' && canonicalCycle !== 'ONE_TIME') return res.status(400).json({ error: 'Marketplace requires ONE_TIME.' });
    if (canonicalPlan !== 'MARKETPLACE' && !['MONTHLY', 'YEARLY'].includes(canonicalCycle)) return res.status(400).json({ error: 'Paid plans require MONTHLY or YEARLY.' });

    const token = crypto.randomBytes(16).toString('hex');
    const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000); // 30 days valid

    try {
        const link = await prisma.adminOnboardingLink.create({
            data: {
                token,
                plan: canonicalPlan,
                billingCycle: canonicalCycle === 'YEARLY' ? 'yearly' : 'monthly',
                isFreeTrial: Boolean(startTrial),
                trialDays: 14,
                expiresAt
            }
        });

        const clientUrl = getClientUrl(req);
        res.json({
            success: true,
            link: {
                ...link,
                url: `${clientUrl}/onboard?token=${token}`,
                monthlyPrice: getPriceInPaise(link, 'monthly') / 100,
                yearlyPrice: getPriceInPaise(link, 'yearly') / 100,
            }
        });
    } catch (error) {
        console.error('Create Admin Onboarding Link Error:', error);
        res.status(500).json({ error: 'Failed to create link.' });
    }
};

// PUBLIC: Get details of an onboarding link (for checkout page)
export const getAdminOnboardingLink = async (req: Request, res: Response) => {
    const { token } = req.params;

    try {
        const link = await prisma.adminOnboardingLink.findUnique({
            where: { token: String(token) }
        });

        if (!link) {
            return res.status(404).json({ error: 'Link not found or has been revoked.' });
        }

        if (link.status !== 'PENDING') {
            return res.status(400).json({ error: 'This onboarding link has already been used.' });
        }

        if (new Date() > link.expiresAt) {
            return res.status(400).json({ error: 'This onboarding link has expired.' });
        }

        res.json({
            plan: link.plan,
            billingCycle: link.billingCycle,
            isFreeTrial: link.isFreeTrial,
            trialDays: link.trialDays,
            monthlyPrice: getPriceInPaise(link, 'monthly') / 100,
            yearlyPrice: getPriceInPaise(link, 'yearly') / 100,
            monthlyPricePaise: getPriceInPaise(link, 'monthly'),
            yearlyPricePaise: getPriceInPaise(link, 'yearly'),
            expiresAt: link.expiresAt,
        });
    } catch (error) {
        console.error('Get Admin Onboarding Link Error:', error);
        res.status(500).json({ error: 'Failed to fetch link details.' });
    }
};

// PUBLIC: Create payment order for admin onboarding link
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

        const selectedBillingCycle = String(billingCycle || link.billingCycle || '').toLowerCase();
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

        if (selectedBillingCycle === 'monthly') {
            const canonicalPlan = normalizePlanId(link.plan);
            if (canonicalPlan === 'MARKETPLACE') return res.status(400).json({ error: 'Marketplace does not support monthly recurring mandate.' });
            const provisioning: ProvisioningInput = {
                kind: 'INVITE',
                onboardingLinkId: link.id,
                instituteName: instituteName || 'New Institute',
                ownerName: teacherName || '',
                phone: phoneNumber || '',
                email: email || ''
            };
            const session = await planSubscriptionCheckoutService.createMonthlySubscriptionCheckout({
                context: {
                    kind: 'INVITE_ONBOARDING',
                    onboardingLinkId: link.id,
                    ownerIdentity: phoneNumber || email || '',
                    provisioning
                },
                plan: canonicalPlan
            });
            return res.json({
                success: true,
                mode: 'SUBSCRIPTION',
                subscriptionId: session.subscriptionId,
                keyId: session.keyId,
                plan: session.plan,
                billingCycle: session.billingCycle,
                amount: session.amount,
                currency: session.currency,
                trialEligible: session.trialEligible,
                firstChargeAt: session.firstChargeAt.toISOString(),
                totalCount: session.totalCount
            });
        }

        // Create Razorpay Order (for yearly paid plans)
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
            mode: 'ORDER',
            orderId: order.id,
            amount: order.amount,
            currency: order.currency,
            keyId: razorpayConfig.keyId,
        });

    } catch (error: any) {
        if (error instanceof OnboardingPaymentError) return res.status(409).json({ error: error.message });
        if (error?.code === 'P2002') return res.status(409).json({ error: 'TRIAL_ALREADY_USED' });
        console.error('Create Admin Onboarding Order Error:', error);
        res.status(500).json({ error: error?.message || 'Failed to create payment order.' });
    }
};

// PUBLIC: Verify payment & provision institute for admin onboarding link
export const verifyAdminOnboardingPayment = async (req: Request, res: Response) => {
    try {
        const link = await prisma.adminOnboardingLink.findUnique({ where: { token: String(req.body.token || '') } });
        if (!link) return res.status(404).json({ error: 'Link not found.' });
        const isSubscriptionVerification = Boolean(req.body.razorpay_subscription_id);
        if (link.status !== 'PENDING' && !isSubscriptionVerification) return res.status(400).json({ error: 'This link has already been used.' });
        if (!['PENDING', 'PROCESSING', 'USED'].includes(link.status)) return res.status(400).json({ error: 'This link is not available.' });
        if (link.status === 'PENDING' && new Date() > link.expiresAt) return res.status(400).json({ error: 'This link has expired.' });

        if (req.body.razorpay_subscription_id) {
            await planSubscriptionCheckoutService.verifyMonthlySubscriptionCheckout({
                razorpay_payment_id: String(req.body.razorpay_payment_id || ''),
                razorpay_subscription_id: String(req.body.razorpay_subscription_id || ''),
                razorpay_signature: String(req.body.razorpay_signature || ''),
                contextKind: 'INVITE_ONBOARDING',
                onboardingLinkId: link.id
            });
            await planSubscriptionLifecycleService.applySubscriptionEvent({
                kind: 'AUTHENTICATED',
                providerSubscriptionId: String(req.body.razorpay_subscription_id)
            });
            const sub = await prisma.planSubscription.findUniqueOrThrow({
                where: { providerSubscriptionId: String(req.body.razorpay_subscription_id) }
            });
            if (sub.onboardingLinkId !== link.id || (link.instituteId && sub.instituteId !== link.instituteId)) {
                return res.status(400).json({ error: 'SUBSCRIPTION_BINDING_MISMATCH' });
            }
            if (!sub.instituteId) {
                return res.status(500).json({ error: 'INSTITUTE_PROVISIONING_FAILED' });
            }
            const invite = await prisma.inviteToken.findFirst({
                where: { instituteId: sub.instituteId, isUsed: false },
                orderBy: { createdAt: 'desc' }
            });
            if (!invite) return res.status(409).json({ error: 'Setup already completed.' });

            const payload = (sub.provisioningData as Record<string, any>) || {};
            const clientUrl = getClientUrl(req);
            const setupLink = `${clientUrl}/setup?token=${invite.token}`;

            const notifPhone = String(payload.phone || payload.phoneNumber || '');
            const notificationData = {
                ownerName: String(payload.ownerName || payload.teacherName || 'there'),
                setupLink,
                tuitionName: String(payload.instituteName || 'New Institute')
            };

            if (notifPhone) {
                await Promise.allSettled([
                    sendSetupLinkWhatsApp(notifPhone, notificationData),
                    payload.email ? sendSetupLinkEmail(String(payload.email), notificationData) : Promise.resolve()
                ]);
            }

            return res.json({
                success: true,
                mode: 'SUBSCRIPTION',
                setupLink,
                message: 'Mandate verified. Setup link sent to your WhatsApp and email.'
            });
        }

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
