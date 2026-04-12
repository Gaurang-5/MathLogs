import { Request, Response } from 'express';
import { prisma } from '../prisma';
import Razorpay from 'razorpay';
import crypto from 'crypto';

const razorpay = new Razorpay({
    key_id: process.env.RAZORPAY_KEY_ID || 'dummy_key',
    key_secret: process.env.RAZORPAY_KEY_SECRET || 'dummy_secret',
});

export const createBillingSession = async (req: Request, res: Response) => {
    try {
        const adminId = (req as any).user?.id;
        const { planId, billingCycle } = req.body;

        if (!adminId) return res.status(401).json({ error: 'Unauthorized' });

        const admin = await prisma.admin.findUnique({
            where: { id: adminId },
            include: { institute: true }
        });

        if (!admin || !admin.institute) {
            return res.status(404).json({ error: 'Institute not found' });
        }

        const monthlyAmountInINR = planId === 'pro' ? 1999 : 999;
        
        if (billingCycle === 'yearly') {
            const amountInINR = planId === 'pro' ? 19999 : 9999;
            const amountInPaise = amountInINR * 100;

            const order = await razorpay.orders.create({
                amount: amountInPaise,
                currency: 'INR',
                receipt: `rcpt_${admin.institute.id.substring(0, 8)}_${Date.now()}`,
                payment_capture: true,
                notes: {
                    instituteId: admin.institute.id,
                    planId,
                    billingCycle
                }
            });

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
                total_count: 120,
                notes: {
                    instituteId: admin.institute.id,
                    planId,
                    billingCycle
                }
            });

            return res.json({
                success: true,
                subscriptionId: subscription.id,
                keyId: process.env.RAZORPAY_KEY_ID || 'dummy_key',
            });
        }
    } catch (error) {
        console.error('Create Billing Session Error:', error);
        res.status(500).json({ error: 'Internal server error during billing initialization.' });
    }
};

export const verifyBillingPayment = async (req: Request, res: Response) => {
    try {
        const adminId = (req as any).user?.id;
        const {
            razorpay_order_id,
            razorpay_payment_id,
            razorpay_signature,
            razorpay_subscription_id,
            planId,
            billingCycle
        } = req.body;

        if (!adminId) return res.status(401).json({ error: 'Unauthorized' });

        const admin = await prisma.admin.findUnique({
            where: { id: adminId },
            include: { institute: true }
        });

        if (!admin || !admin.institute) {
            return res.status(404).json({ error: 'Institute not found' });
        }

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

        // Extend their plan
        const tier = planId === 'pro' ? 'PRO' : 'FREE';
        const daysToAdd = billingCycle === 'yearly' ? 365 : 30;
        
        let newExpiryDate = admin.institute.planExpiryDate ? new Date(admin.institute.planExpiryDate) : new Date();
        // If they already expired, start from today.
        if (newExpiryDate.getTime() < Date.now()) {
            newExpiryDate = new Date();
        }
        
        newExpiryDate.setDate(newExpiryDate.getDate() + daysToAdd);

        const currentConfig = (admin.institute.config as any) || {};
        const maxStudents = tier === 'PRO' ? 250 : 100;

        await prisma.institute.update({
            where: { id: admin.institute.id },
            data: {
                plan: tier,
                planExpiryDate: newExpiryDate,
                razorpaySubscriptionId: razorpay_subscription_id || null,
                razorpayOrderId: razorpay_order_id || null,
                config: { ...currentConfig, maxStudents },
                areRegistrationsPaused: false
            }
        });

        res.json({
            success: true,
            message: 'Payment verified successfully. Plan extended.'
        });

    } catch (error) {
        console.error('Verify Billing Error:', error);
        res.status(500).json({ error: 'Internal server error during billing verification.' });
    }
};

export const cancelSubscription = async (req: Request, res: Response) => {
    try {
        const adminId = (req as any).user?.id;
        if (!adminId) return res.status(401).json({ error: 'Unauthorized' });

        const admin = await prisma.admin.findUnique({
            where: { id: adminId },
            include: { institute: true }
        });

        if (!admin || !admin.institute) {
            return res.status(404).json({ error: 'Institute not found' });
        }

        // We cancel the active Razorpay subscription from auto-renewing, but we DO NOT instantly strip their plan.
        // We let them use MathLogs until their current cycle naturally expires at planExpiryDate.
        if (admin.institute.razorpaySubscriptionId) {
            try {
                // Cancel at the end of the current billing cycle
                await razorpay.subscriptions.cancel(admin.institute.razorpaySubscriptionId, true);
                console.log(`Cancelled Razorpay auto-renewal at cycle end: ${admin.institute.razorpaySubscriptionId}`);
            } catch (rzpErr: any) {
                console.error('Razorpay Sub Cancel Error:', rzpErr);
                // We proceed even if RZP fails (e.g., already cancelled)
            }
        }

        await prisma.institute.update({
            where: { id: admin.institute.id },
            data: {
                 // Wipe Razorpay IDs so frontend knows it's cancelled
                 razorpaySubscriptionId: null,
                 razorpayOrderId: null
                 // Note: We DO NOT touch `plan`, `planExpiryDate`, `maxStudents`, or `areRegistrationsPaused`
                 // This ensures their plan safely continues working until `planExpiryDate` naturally expires!
            }
        });

        res.json({ success: true, message: 'Subscription cancelled successfully.' });
    } catch (error) {
        console.error('Cancel Subscription Error:', error);
        res.status(500).json({ error: 'Failed to cancel subscription.' });
    }
};
