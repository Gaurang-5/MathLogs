import { Request, Response } from 'express';
import { prisma } from '../prisma';
import Razorpay from 'razorpay';
import crypto from 'crypto';
import { sendSetupLinkWhatsApp } from '../utils/whatsapp';
import { sendSetupLinkEmail } from '../utils/email';
import { getClientUrl } from '../utils/urlConfig';
import { secureLogger } from '../utils/secureLogger';
import { getRazorpayConfig } from '../utils/env';
import { activateMarketplace, SubscriptionLifecycleError, startPlanTrial as startCanonicalTrial } from '../services/subscriptionLifecycleService';
import { normalizePlanId, resolvePlanPrice, type BillingCycle } from '../domain/plans/planCatalog';
import { OnboardingPaymentError, persistOnboardingOrder, provisionClaimedOnboardingPayment, verifyAndClaimOnboardingPayment } from '../services/onboardingPaymentService';
import { planSubscriptionCheckoutService } from '../services/planSubscriptionCheckoutService';
import { planSubscriptionLifecycleService } from '../services/planSubscriptionLifecycleService';
import { type ProvisioningInput } from '../services/accountProvisioningService';
import {
    MarketplaceCityValidationError,
    requireMarketplaceCity,
} from '../domain/marketplace/location';

const razorpayConfig = getRazorpayConfig();

const razorpay = new Razorpay({
    key_id: razorpayConfig.keyId,
    key_secret: razorpayConfig.keySecret,
});

// Track Lead Progress
export const trackLead = async (req: Request, res: Response) => {
    try {
        const { tuitionName, ownerName, phone, email, planId, billingCycle, step, failureReason } = req.body;

        if (!phone) {
            return res.status(400).json({ error: 'Phone number is required to track lead' });
        }

        const lead = await prisma.onboardingLead.upsert({
            where: { phone },
            update: {
                ...(tuitionName && { tuitionName }),
                ...(ownerName && { ownerName }),
                ...(email && { email }),
                ...(planId && { planId }),
                ...(billingCycle && { billingCycle }),
                ...(step && { step }),
                ...(failureReason && { failureReason })
            },
            create: {
                tuitionName,
                ownerName,
                phone,
                email,
                planId,
                billingCycle,
                step: step || 'details_submitted'
            }
        });

        res.json({ success: true, lead });
    } catch (error) {
        console.error('Track Lead Error:', error);
        res.status(500).json({ error: 'Failed to track lead' });
    }
};

// Create Razorpay Order or Subscription
export const createOrder = async (req: Request, res: Response) => {
    try {
        const { tuitionName, ownerName, phone, email, planId, billingCycle } = req.body;

        // Validate inputs
        if (!tuitionName || !ownerName || !phone || !email || !planId) {
            return res.status(400).json({ error: 'All fields are required.' });
        }

        let plan;
        let cycle: BillingCycle;
        let amountInPaise: number;
        try {
            plan = normalizePlanId(planId);
            cycle = String(billingCycle || '').toUpperCase() as BillingCycle;
            amountInPaise = plan === 'MARKETPLACE' ? 0 : resolvePlanPrice(plan, cycle);
        } catch {
            return res.status(400).json({ error: 'Invalid plan or billing cycle.' });
        }
        if (plan === 'MARKETPLACE') return res.status(400).json({ error: 'Marketplace promotional activation does not require payment.' });

        // Check if user/institute already exists by email/phone
        const existingAdmin = await prisma.admin.findUnique({ where: { username: phone } });
        if (existingAdmin) {
            return res.status(400).json({ error: 'An account with this phone number already exists.' });
        }

        if (cycle === 'MONTHLY') {
            const canonicalCity = req.body.city ? requireMarketplaceCity(req.body.city) : undefined;
            const provisioning: ProvisioningInput = {
                kind: 'PUBLIC',
                instituteName: tuitionName,
                ownerName,
                phone,
                email,
                marketplace: {
                    listed: req.body.listOnMarketplace ?? true,
                    city: canonicalCity,
                    area: req.body.area ? String(req.body.area).trim() : undefined,
                    subjects: Array.isArray(req.body.subjectsOffered) ? req.body.subjectsOffered : undefined,
                    googleMapsUrl: req.body.googleMapsUrl ? String(req.body.googleMapsUrl).trim() : undefined
                }
            };
            const session = await planSubscriptionCheckoutService.createMonthlySubscriptionCheckout({
                context: { kind: 'PUBLIC_ONBOARDING', ownerIdentity: phone, provisioning },
                plan
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

        // Create Razorpay Order for yearly plans
        let order: any;
        try {
            order = await razorpay.orders.create({
                amount: amountInPaise,
                currency: 'INR',
                receipt: `receipt_${Date.now()}`,
                payment_capture: true, // Auto-capture payment
                notes: {
                    tuitionName,
                    ownerName,
                    phone,
                    email,
                    planId: plan,
                    billingCycle: cycle
                }
            });
        } catch (rzpError) {
            console.error('Razorpay Order Error:', rzpError);
            return res.status(500).json({ error: 'Failed to initialize payment gateway.' });
        }

        await persistOnboardingOrder({
            providerOrderId: String(order.id), amountPaise: amountInPaise, plan: plan as 'QUIZ' | 'ENTERPRISE', billingCycle: cycle,
            provisioningData: {
                tuitionName,
                ownerName,
                phone,
                email,
                listOnMarketplace: req.body.listOnMarketplace,
                city: req.body.city ? requireMarketplaceCity(req.body.city) : undefined,
                area: req.body.area,
                subjectsOffered: req.body.subjectsOffered,
                googleMapsUrl: req.body.googleMapsUrl,
            }
        });

        return res.json({
            success: true,
            mode: 'ORDER',
            orderId: order.id,
            amount: order.amount,
            currency: order.currency,
            keyId: razorpayConfig.keyId,
        });

    } catch (error) {
        if (error instanceof MarketplaceCityValidationError) {
            return res.status(400).json({ error: error.message });
        }
        console.error('Create Order Error:', error);
        res.status(500).json({ error: error instanceof Error ? error.message : 'Internal server error during order creation.' });
    }
};

function slugify(text: string) {
    return text.toString().toLowerCase().trim()
        .replace(/\s+/g, '-')
        .replace(/[^\w\-]+/g, '')
        .replace(/\-\-+/g, '-');
}

async function createUniqueSlug(name: string) {
    let baseSlug = slugify(name);
    if (!baseSlug) baseSlug = 'coaching';
    let uniqueSlug = baseSlug;
    let count = 1;
    while (await prisma.institute.findUnique({ where: { slug: uniqueSlug } })) {
        uniqueSlug = `${baseSlug}-${count++}`;
    }
    return uniqueSlug;
}

// Verify Payment and Provision Account
export const verifyPayment = async (req: Request, res: Response) => {
    try {
        if (req.body.razorpay_subscription_id) {
            await planSubscriptionCheckoutService.verifyMonthlySubscriptionCheckout({
                razorpay_payment_id: String(req.body.razorpay_payment_id || ''),
                razorpay_subscription_id: String(req.body.razorpay_subscription_id || ''),
                razorpay_signature: String(req.body.razorpay_signature || ''),
                contextKind: 'PUBLIC_ONBOARDING'
            });
            await planSubscriptionLifecycleService.applySubscriptionEvent({
                kind: 'AUTHENTICATED',
                providerSubscriptionId: String(req.body.razorpay_subscription_id)
            });
            const sub = await prisma.planSubscription.findUniqueOrThrow({
                where: { providerSubscriptionId: String(req.body.razorpay_subscription_id) }
            });
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

            const notificationData = {
                ownerName: String(payload.ownerName || ''),
                setupLink,
                tuitionName: String(payload.instituteName || payload.tuitionName || '')
            };
            await Promise.allSettled([
                sendSetupLinkWhatsApp(String(payload.phone || ''), notificationData),
                sendSetupLinkEmail(String(payload.email || ''), notificationData)
            ]);

            secureLogger.info('[ONBOARDING] Subscription account provisioned', { instituteId: sub.instituteId });

            return res.json({
                success: true,
                mode: 'SUBSCRIPTION',
                setupLink,
                message: 'Mandate verified. Setup link sent to your WhatsApp and email.'
            });
        }

        const payment = await verifyAndClaimOnboardingPayment({ orderId: String(req.body.razorpay_order_id || ''), paymentId: String(req.body.razorpay_payment_id || ''), signature: String(req.body.razorpay_signature || '') });
        const provisioned = await provisionClaimedOnboardingPayment(payment);
        if (!provisioned.inviteToken) return res.status(409).json({ error: 'Setup already completed.' });
        const payload = payment.provisioningData as Record<string, any>;

        const clientUrl = getClientUrl(req);
        const setupLink = `${clientUrl}/setup?token=${provisioned.inviteToken}`;

        // Send setup link via WhatsApp + Email (fire-and-forget, don't block response)
        const notificationData = { ownerName: String(payload.ownerName || ''), setupLink, tuitionName: String(payload.tuitionName || '') };
        await Promise.allSettled([
            sendSetupLinkWhatsApp(String(payload.phone || ''), notificationData),
            sendSetupLinkEmail(String(payload.email || ''), notificationData)
        ]);

        secureLogger.info('[ONBOARDING] Paid account provisioned', { instituteId: provisioned.instituteId });

        res.json({
            success: true,
            setupLink: setupLink,
            message: 'Payment verified. Setup link sent to your WhatsApp and email.'
        });

    } catch (error) {
        if (error instanceof OnboardingPaymentError) return res.status(['ONBOARDING_PAYMENT_ALREADY_USED', 'ONBOARDING_LINK_NOT_AVAILABLE'].includes(error.message) ? 409 : 400).json({ error: error.message });
        console.error('Verify Payment Error:', error);
        res.status(500).json({ error: error instanceof Error ? error.message : 'Internal server error during payment verification.' });
    }
};

export const startTrial = async (req: Request, res: Response) => {
    try {
        const { tuitionName, ownerName, phone, email, planId, billingCycle,
                listOnMarketplace, city, area, subjectsOffered, googleMapsUrl } = req.body;

        if (!tuitionName || !ownerName || !phone || !email || !planId) {
            return res.status(400).json({ error: 'All fields are required.' });
        }

        const existingAdmin = await prisma.admin.findUnique({ where: { username: phone } });
        if (existingAdmin) {
            return res.status(400).json({ error: 'An account with this phone number already exists.' });
        }

        let plan;
        try {
            plan = normalizePlanId(planId);
        } catch {
            return res.status(400).json({ error: 'Please select Quiz or Enterprise for a free trial.' });
        }

        const uniqueSlug = await createUniqueSlug(tuitionName);

        const canonicalCity = city ? requireMarketplaceCity(city) : null;
        const newInstitute = await prisma.institute.create({
            data: {
                name: tuitionName,
                teacherName: ownerName,
                phoneNumber: phone,
                publicPhone: phone,
                whatsappPhone: phone,
                email: email,
                plan: 'MARKETPLACE',
                billingCycle: 'ONE_TIME',
                marketplaceAccessGrantedAt: new Date(),
                quizCredits: 0,
                isPubliclyListed: false,
                isExclusive: false,
                slug: uniqueSlug,
                city: canonicalCity,
                area: area ? area.trim() : null,
                subjectsOffered: Array.isArray(subjectsOffered) ? subjectsOffered : [],
                googleMapsUrl: googleMapsUrl ? googleMapsUrl.trim() : null,
                config: {
                    requiresGrades: true,
                    allowedClasses: ["Class 6", "Class 7", "Class 8", "Class 9", "Class 10", "Class 11", "Class 12"],
                    subjects: ["Mathematics", "Science", "Physics", "Chemistry", "Biology", "English"]
                }
            }
        });

        const trial = plan === 'MARKETPLACE'
            ? await activateMarketplace(newInstitute.id)
            : await startCanonicalTrial({ instituteId: newInstitute.id, plan, ownerIdentity: phone });

        const tokenString = crypto.randomBytes(24).toString('hex');

        const invite = await prisma.inviteToken.create({
            data: {
                token: tokenString,
                instituteId: newInstitute.id,
                expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
            }
        });

        const clientUrl = getClientUrl(req);
        const setupLink = `${clientUrl}/setup?token=${invite.token}`;

        // Send setup link via WhatsApp + Email
        const notificationData = { ownerName, setupLink, tuitionName };
        await Promise.allSettled([
            sendSetupLinkWhatsApp(phone, notificationData),
            sendSetupLinkEmail(email, notificationData)
        ]);

        res.json({
            success: true,
            setupLink: setupLink,
            trialEndsAt: trial.trialEndsAt,
            includedQuizCredits: trial.includedQuizCredits,
            message: plan === 'MARKETPLACE' ? 'Your Marketplace account is ready. Setup link sent to your WhatsApp and email.' : 'Your 14-day free trial with 5 quiz credits has started. Setup link sent to your WhatsApp and email.'
        });

    } catch (error) {
        if (error instanceof MarketplaceCityValidationError) {
            return res.status(400).json({ error: error.message });
        }
        if (error instanceof SubscriptionLifecycleError && error.message === 'TRIAL_ALREADY_USED') {
            return res.status(409).json({ error: 'A free trial has already been used for this account.' });
        }
        console.error('Start Trial Error:', error);
        res.status(500).json({ error: 'Internal server error starting trial.' });
    }
};

// ── RESEND SETUP LINK ────────────────────────────────────────
// Allows users who lost their link (browser crash, closed tab, etc.)
// to recover it by entering their phone number.

const resendCooldowns = new Map<string, { count: number; resetAt: number }>();
const MAX_RESENDS_PER_HOUR = 3;

export const resendSetupLink = async (req: Request, res: Response) => {
    try {
        const { phone } = req.body;

        if (!phone) {
            return res.status(400).json({ error: 'Phone number is required.' });
        }

        // Rate limit: 3 per hour per phone
        const normalizedPhone = phone.replace(/\D/g, '');
        const now = Date.now();
        const cooldown = resendCooldowns.get(normalizedPhone);

        if (cooldown) {
            if (now < cooldown.resetAt && cooldown.count >= MAX_RESENDS_PER_HOUR) {
                return res.status(429).json({
                    error: 'Too many requests. Please try again in an hour.'
                });
            }
            if (now >= cooldown.resetAt) {
                resendCooldowns.set(normalizedPhone, { count: 1, resetAt: now + 60 * 60 * 1000 });
            } else {
                cooldown.count++;
            }
        } else {
            resendCooldowns.set(normalizedPhone, { count: 1, resetAt: now + 60 * 60 * 1000 });
        }

        // 1. Find the institute by phone number
        const institute = await prisma.institute.findFirst({
            where: { phoneNumber: phone },
            include: { admins: true, invites: true }
        });

        if (!institute) {
            return res.status(404).json({
                error: 'No pending setup found for this phone number. Please complete the signup process first.'
            });
        }

        // 2. Check if already set up (admin exists)
        if (institute.admins.length > 0) {
            return res.status(400).json({
                error: 'Your account is already set up! Please open the MathLogs app and log in with your credentials.'
            });
        }

        // 3. Find existing valid invite token, or generate a new one
        let validInvite = institute.invites.find(
            (inv) => !inv.isUsed && new Date() < inv.expiresAt
        );

        if (!validInvite) {
            // All tokens expired or used — generate a new one
            const tokenString = crypto.randomBytes(24).toString('hex');
            validInvite = await prisma.inviteToken.create({
                data: {
                    token: tokenString,
                    instituteId: institute.id,
                    expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) // 7 days
                }
            });
            secureLogger.info(`[RESEND] Generated new invite token for ${institute.name}`);
        }

        const clientUrl = getClientUrl(req);
        const setupLink = `${clientUrl}/setup?token=${validInvite.token}`;

        // 4. Send via WhatsApp + Email
        const notificationData = {
            ownerName: institute.teacherName || 'there',
            setupLink,
            tuitionName: institute.name
        };

        await Promise.allSettled([
            sendSetupLinkWhatsApp(phone, notificationData),
            institute.email ? sendSetupLinkEmail(institute.email, notificationData) : Promise.resolve()
        ]);

        secureLogger.info(`[RESEND] Setup link resent for ${institute.name} to ${phone}`);

        res.json({
            success: true,
            message: 'Setup link has been resent to your WhatsApp and email. Please check your messages.'
        });

    } catch (error) {
        console.error('Resend Setup Link Error:', error);
        res.status(500).json({ error: 'Failed to resend setup link. Please try again.' });
    }
};
