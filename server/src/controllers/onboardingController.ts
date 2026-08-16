import { Request, Response } from 'express';
import { prisma } from '../prisma';
import Razorpay from 'razorpay';
import crypto from 'crypto';
import { sendSetupLinkWhatsApp } from '../utils/whatsapp';
import { sendSetupLinkEmail } from '../utils/email';
import { getClientUrl } from '../utils/urlConfig';
import { secureLogger } from '../utils/secureLogger';
import { getRazorpayConfig } from '../utils/env';
import { activateMarketplace, activatePaidPlan, SubscriptionLifecycleError, startPlanTrial as startCanonicalTrial } from '../services/subscriptionLifecycleService';
import { normalizePlanId, resolvePlanPrice, type BillingCycle } from '../domain/plans/planCatalog';

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
                step: step || 'STEP_1_STARTED'
            }
        });

        res.json({ success: true, leadId: lead.id });
    } catch (error) {
        console.error('Track Lead Error:', error);
        res.status(500).json({ error: 'Failed to track lead' });
    }
};

// Create Order (Step 3 checkout initialization)
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

        // Create Razorpay Order
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

        return res.json({
            success: true,
            orderId: order.id,
            amount: order.amount,
            currency: order.currency,
            keyId: razorpayConfig.keyId,
        });

    } catch (error) {
        console.error('Create Order Error:', error);
        res.status(500).json({ error: 'Internal server error during order creation.' });
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
        const {
            razorpay_order_id,
            razorpay_payment_id,
            razorpay_signature,
            razorpay_subscription_id,
            tuitionName,
            ownerName,
            phone,
            email,
            planId,
            billingCycle,
            listOnMarketplace,
            city,
            area,
            subjectsOffered,
            googleMapsUrl
        } = req.body;

        // 1. Verify Signature
        const secret = razorpayConfig.keySecret;

        let bodyText = razorpay_order_id + '|' + razorpay_payment_id;
        if (razorpay_subscription_id && !razorpay_order_id) {
            bodyText = razorpay_payment_id + '|' + razorpay_subscription_id;
        }

        const expectedSignature = crypto
            .createHmac('sha256', secret)
            .update(bodyText.toString())
            .digest('hex');

        if (expectedSignature !== razorpay_signature) {
            return res.status(400).json({ error: 'Invalid payment signature.' });
        }

        // 2. Provision the Database Records
        let plan;
        let cycle: BillingCycle;
        try {
            plan = normalizePlanId(planId);
            cycle = String(billingCycle || '').toUpperCase() as BillingCycle;
            resolvePlanPrice(plan, cycle);
        } catch {
            return res.status(400).json({ error: 'Invalid plan or billing cycle.' });
        }
        if (plan === 'MARKETPLACE') return res.status(400).json({ error: 'Marketplace activation does not require payment.' });

        const uniqueSlug = await createUniqueSlug(tuitionName);

        // A. Create Institute with Marketplace Listing
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
                isQuizOnly: false,
                quizCredits: 0,
                isPubliclyListed: listOnMarketplace ?? true,
                isExclusive: false,
                slug: uniqueSlug,
                city: city ? city.trim() : null,
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
        await activatePaidPlan({ instituteId: newInstitute.id, plan, billingCycle: cycle });

        // Generate Cryptographically Secure Token
        const tokenString = crypto.randomBytes(24).toString('hex');

        // Create Invite Token
        const invite = await prisma.inviteToken.create({
            data: {
                token: tokenString,
                instituteId: newInstitute.id,
                expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) // 7 days
            }
        });

        const clientUrl = getClientUrl(req);
        const setupLink = `${clientUrl}/setup?token=${invite.token}`;

        // Send setup link via WhatsApp + Email (fire-and-forget, don't block response)
        const notificationData = { ownerName, setupLink, tuitionName };
        await Promise.allSettled([
            sendSetupLinkWhatsApp(phone, notificationData),
            sendSetupLinkEmail(email, notificationData)
        ]);

        secureLogger.info(`[ONBOARDING] Generated link for ${tuitionName}: ${setupLink}`);

        res.json({
            success: true,
            setupLink: setupLink,
            message: 'Payment verified. Setup link sent to your WhatsApp and email.'
        });

    } catch (error) {
        console.error('Verify Payment Error:', error);
        res.status(500).json({ error: 'Internal server error during payment verification.' });
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
                isPubliclyListed: listOnMarketplace ?? true,
                isExclusive: false,
                slug: uniqueSlug,
                city: city ? city.trim() : null,
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
