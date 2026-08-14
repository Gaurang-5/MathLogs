import { Request, Response } from 'express';
import { prisma } from '../prisma';
import Razorpay from 'razorpay';
import crypto from 'crypto';
import { Tier } from '@prisma/client';
import { secureLogger } from '../utils/secureLogger';
import { getRazorpayConfig } from '../utils/env';
import { addPurchasedQuizCredits } from '../utils/quizCredits';

const razorpayConfig = getRazorpayConfig();

const razorpay = new Razorpay({
    key_id: razorpayConfig.keyId,
    key_secret: razorpayConfig.keySecret,
});

export const createBillingSession = async (req: Request, res: Response) => {
    try {
        const adminId = req.user?.id;
        const { planId, billingCycle } = req.body;

        if (!adminId) return res.status(401).json({ error: 'Unauthorized' });

        const admin = await prisma.admin.findUnique({
            where: { id: adminId },
            include: { institute: true }
        });

        if (!admin || !admin.institute) {
            return res.status(404).json({ error: 'Institute not found' });
        }

        const instituteConfig = (admin.institute.config as any) || {};

        if (planId.startsWith('quiz_credits_')) {
            let amountInINR = 0;
            if (planId === 'quiz_credits_5') amountInINR = 250;
            else if (planId === 'quiz_credits_10') amountInINR = 500;
            else if (planId === 'quiz_credits_25') amountInINR = 1000;
            else if (planId === 'quiz_credits_40') amountInINR = 1500;
            else {
                return res.status(400).json({ error: 'Invalid plan selected' });
            }
            const order = await razorpay.orders.create({
                amount: amountInINR * 100,
                currency: 'INR',
                receipt: `rcpt_${admin.institute.id.slice(-8)}_${Date.now()}`,
                payment_capture: true,
                notes: {
                    instituteId: admin.institute.id,
                    planId,
                    billingCycle
                }
            } as any);

            return res.json({
                success: true,
                orderId: (order as any).id,
                amount: (order as any).amount,
                currency: (order as any).currency,
                keyId: razorpayConfig.keyId,
            });
        }

        // Determine pricing based on plan type
        let monthlyAmountInINR: number;
        let yearlyAmountInINR: number;

        if (planId === 'custom') {
            monthlyAmountInINR = instituteConfig.customPriceMonthly || 0;
            yearlyAmountInINR = instituteConfig.customPriceYearly || 0;
        } else if (planId === 'listing') {
            monthlyAmountInINR = 0;
            yearlyAmountInINR = 0;
        } else if (planId === 'quiz') {
            monthlyAmountInINR = 250;
            yearlyAmountInINR = 2500;
        } else {
            // all_inclusive ERP plan (or fallback pro/basic)
            monthlyAmountInINR = 500;
            yearlyAmountInINR = 5000;
        }
        
        if (billingCycle === 'yearly' || planId === 'listing') {
            const chargeAmount = planId === 'listing' ? 0 : yearlyAmountInINR;
            const amountInPaise = chargeAmount * 100;

            const order = await razorpay.orders.create({
                amount: amountInPaise,
                currency: 'INR',
                receipt: `rcpt_${admin.institute.id.slice(-8)}_${Date.now()}`,
                payment_capture: true,
                notes: {
                    instituteId: admin.institute.id,
                    planId,
                    billingCycle
                }
            } as any);

            return res.json({
                success: true,
                orderId: (order as any).id,
                amount: (order as any).amount,
                currency: (order as any).currency,
                keyId: razorpayConfig.keyId,
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
                        name: `MathLogs ${planId.toUpperCase()} Monthly`,
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
                keyId: razorpayConfig.keyId,
            });
        }
    } catch (error) {
        console.error('Create Billing Session Error:', error);
        res.status(500).json({ error: 'Internal server error during billing initialization.' });
    }
};

export const verifyBillingPayment = async (req: Request, res: Response) => {
    try {
        const adminId = req.user?.id;
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

        const secret = razorpayConfig.keySecret;
        let bodyText = '';
        if (billingCycle === 'yearly' || billingCycle === 'one-time') {
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

        if (planId.startsWith('quiz_credits_')) {
            let addedCredits = 0;
            if (planId === 'quiz_credits_5') addedCredits = 5;
            else if (planId === 'quiz_credits_10') addedCredits = 10;
            else if (planId === 'quiz_credits_25') addedCredits = 25;
            else if (planId === 'quiz_credits_40') addedCredits = 40;
            else {
                return res.status(400).json({ success: false, error: 'Invalid plan selected' });
            }
            await addPurchasedQuizCredits(admin.institute.id, addedCredits);

            return res.json({
                success: true,
                message: `Payment verified successfully. Added ${addedCredits} lifetime quiz credits.`
            });
        }

        // Extend or switch their plan
        const currentConfig = (admin.institute.config as any) || {};
        let tier: Tier;
        let maxStudents: number;

        if (planId === 'custom') {
            tier = (admin.institute.plan as Tier) || Tier.PRO;
            maxStudents = currentConfig.maxStudents || 500;
        } else if (planId === 'all_inclusive' || planId === 'pro') {
            tier = Tier.PRO;
            maxStudents = 500;
        } else if (planId === 'quiz') {
            tier = Tier.BASIC;
            maxStudents = 100;
        } else if (planId === 'listing') {
            tier = admin.institute.plan && admin.institute.plan !== Tier.NO_PLAN ? admin.institute.plan : Tier.FREE;
            maxStudents = currentConfig.maxStudents || 500;
        } else {
            tier = Tier.PRO;
            maxStudents = 500;
        }

        const daysToAdd = billingCycle === 'yearly' ? 365 : 30;
        
        let newExpiryDate = admin.institute.planExpiryDate ? new Date(admin.institute.planExpiryDate) : new Date();
        // If they already expired, start from today.
        if (newExpiryDate.getTime() < Date.now()) {
            newExpiryDate = new Date();
        }
        
        newExpiryDate.setDate(newExpiryDate.getDate() + daysToAdd);

        const currentCredits = admin.institute.quizCredits || 0;
        const updatedCredits = (planId === 'all_inclusive' || planId === 'pro' || planId === 'quiz')
            ? Math.max(currentCredits, 5)
            : currentCredits;

        const updateData: any = {
            plan: tier,
            planExpiryDate: newExpiryDate,
            quizCredits: updatedCredits,
            razorpaySubscriptionId: razorpay_subscription_id || null,
            razorpayOrderId: razorpay_order_id || null,
            config: { ...currentConfig, maxStudents },
            areRegistrationsPaused: false
        };

        if (planId === 'listing') {
            updateData.isPubliclyListed = true;
            updateData.isVerified = true;
        }

        await prisma.institute.update({
            where: { id: admin.institute.id },
            data: updateData
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
        const adminId = req.user?.id;
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
                secureLogger.info(`Cancelled Razorpay auto-renewal at cycle end: ${admin.institute.razorpaySubscriptionId}`);
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
