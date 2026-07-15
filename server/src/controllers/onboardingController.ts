import { Request, Response } from 'express';
import { prisma } from '../prisma';
import Razorpay from 'razorpay';
import crypto from 'crypto';
import { sendSetupLinkWhatsApp } from '../utils/whatsapp';
import { sendSetupLinkEmail } from '../utils/email';
import { getClientUrl } from '../utils/urlConfig';
import { secureLogger } from '../utils/secureLogger';
import { getRazorpayConfig } from '../utils/env';

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

        // Determine price based on planId
        const monthlyAmountInINR = planId === 'pro' ? 1999 : 999;

        // Check if user/institute already exists by email/phone
        const existingAdmin = await prisma.admin.findUnique({ where: { username: phone } });
        if (existingAdmin) {
            return res.status(400).json({ error: 'An account with this phone number already exists.' });
        }

        if (billingCycle === 'yearly' || planId === 'quiz_only') {
            const amountInINR = planId === 'quiz_only' ? 500 : (planId === 'pro' ? 19999 : 9999);
            const amountInPaise = amountInINR * 100;

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
                        planId,
                        billingCycle
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
        } else {
            // MONTHLY AUTOPAY
            let plan_id = '';
            try {
                // Find existing plan to avoid duplicates
                const allPlans = await razorpay.plans.all();
                const existingPlan = allPlans.items.find((p: any) =>
                    p.item.amount === monthlyAmountInINR * 100 &&
                    p.period === 'monthly'
                );

                if (existingPlan) {
                    plan_id = existingPlan.id;
                } else {
                    const newPlan = await razorpay.plans.create({
                        period: 'monthly',
                        interval: 1,
                        item: {
                            name: `MathLogs ${planId === 'pro' ? 'Pro' : 'Basic'} Monthly`,
                            amount: monthlyAmountInINR * 100,
                            currency: 'INR',
                            description: 'Monthly Subscription for MathLogs'
                        }
                    });
                    plan_id = newPlan.id;
                }

                const subscription = await razorpay.subscriptions.create({
                    plan_id: plan_id,
                    customer_notify: 1,
                    total_count: 120, // max 10 years per mandate
                    notes: {
                        tuitionName,
                        ownerName,
                        phone,
                        email,
                        planId,
                        billingCycle
                    }
                });

                return res.json({
                    success: true,
                    subscriptionId: subscription.id,
                    keyId: razorpayConfig.keyId,
                });

            } catch (error) {
                console.error('Razorpay Subscription Error:', error);
                return res.status(500).json({ error: 'Failed to initialize recurring payment gateway.' });
            }
        }

    } catch (error) {
        console.error('Create Order Error:', error);
        res.status(500).json({ error: 'Internal server error during order creation.' });
    }
};

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
            billingCycle
        } = req.body;

        // 1. Verify Signature
        const secret = razorpayConfig.keySecret;

        let bodyText = '';
        if (billingCycle === 'yearly' || planId === 'quiz_only') {
            bodyText = razorpay_order_id + '|' + razorpay_payment_id;
        } else {
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
        // Map plan id to Tier enum
        const tier = planId === 'pro' ? 'PRO' : (planId === 'quiz_only' ? 'NO_PLAN' : 'FREE');

        // A. Create Institute
        const newInstitute = await prisma.institute.create({
            data: {
                name: tuitionName,
                teacherName: ownerName,
                phoneNumber: phone,
                email: email,
                plan: tier,
                quizCredits: planId === 'quiz_only' ? 10 : 0,
                config: {
                    requiresGrades: true,
                    maxClasses: 12,
                    maxBatches: planId === 'pro' ? 250 : 100,
                    maxBatchesPerClass: 100,
                    allowedClasses: ["Class 6", "Class 7", "Class 8", "Class 9", "Class 10", "Class 11", "Class 12"],
                    subjects: ["Mathematics", "Science", "Physics", "Chemistry", "Biology", "English"]
                }
            }
        });

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
        const { tuitionName, ownerName, phone, email, planId, billingCycle } = req.body;

        if (!tuitionName || !ownerName || !phone || !email || !planId) {
            return res.status(400).json({ error: 'All fields are required.' });
        }

        const existingAdmin = await prisma.admin.findUnique({ where: { username: phone } });
        if (existingAdmin) {
            return res.status(400).json({ error: 'An account with this phone number already exists.' });
        }

        const tier = planId === 'pro' ? 'PRO' as const : 'BASIC' as const;

        // 14 days trial
        const planStartDate = new Date();
        const planExpiryDate = new Date();
        planExpiryDate.setDate(planExpiryDate.getDate() + 14);

        const newInstitute = await prisma.institute.create({
            data: {
                name: tuitionName,
                teacherName: ownerName,
                phoneNumber: phone,
                email: email,
                plan: tier,
                planStartDate,
                planExpiryDate,
                config: {
                    requiresGrades: true,
                    maxStudents: planId === 'pro' ? 250 : 100,
                    isTrial: true,
                    trialStartDate: planStartDate.toISOString(),
                    allowedClasses: ["Class 6", "Class 7", "Class 8", "Class 9", "Class 10", "Class 11", "Class 12"],
                    subjects: ["Mathematics", "Science", "Physics", "Chemistry", "Biology", "English"]
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
            message: 'Trial started. Setup link sent to your WhatsApp and email.'
        });

    } catch (error) {
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
