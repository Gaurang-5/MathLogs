import { Request, Response } from 'express';
import { prisma } from '../prisma';
import Razorpay from 'razorpay';
import crypto from 'crypto';
import { sendSetupLinkWhatsApp } from '../utils/whatsapp';
import { getClientUrl } from '../utils/urlConfig';

const razorpay = new Razorpay({
    key_id: process.env.RAZORPAY_KEY_ID || 'dummy_key',
    key_secret: process.env.RAZORPAY_KEY_SECRET || 'dummy_secret',
});

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

        if (billingCycle === 'yearly') {
            const amountInINR = planId === 'pro' ? 19999 : 9999;
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
                keyId: process.env.RAZORPAY_KEY_ID || 'dummy_key',
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
                    keyId: process.env.RAZORPAY_KEY_ID || 'dummy_key',
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
        const secret = process.env.RAZORPAY_KEY_SECRET || 'dummy_secret';

        let bodyText = '';
        if (billingCycle === 'yearly') {
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
        const tier = planId === 'pro' ? 'PRO' : 'FREE';

        // A. Create Institute
        const newInstitute = await prisma.institute.create({
            data: {
                name: tuitionName,
                teacherName: ownerName,
                phoneNumber: phone,
                email: email,
                plan: tier,
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

        // Send via WhatsApp and Email
        // Email functionality uses an external mailer service depending on configuration.
        await sendSetupLinkWhatsApp(phone, { ownerName, setupLink, tuitionName });

        console.log(`[ONBOARDING] Generated link for ${tuitionName}: ${setupLink}`);

        res.json({
            success: true,
            setupLink: setupLink,
            message: 'Payment verified. Setup link generated.'
        });

    } catch (error) {
        console.error('Verify Payment Error:', error);
        res.status(500).json({ error: 'Internal server error during payment verification.' });
    }
};
