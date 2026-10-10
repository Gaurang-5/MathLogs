import { Request, Response } from 'express';
import { prisma } from '../prisma';
import Razorpay from 'razorpay';
import crypto from 'crypto';
import { secureLogger } from '../utils/secureLogger';
import { getRazorpayConfig } from '../utils/env';
import { grantLifetimeQuizCredits } from '../services/quizCreditWalletService';
import { invalidateAuthCache } from '../middleware/auth';
import { PLAN_CATALOG, normalizePlanId, resolvePlanPrice, type BillingCycle, type CanonicalPlan } from '../domain/plans/planCatalog';
import { activateMarketplace, cancelAtPeriodEnd } from '../services/subscriptionLifecycleService';
import { cancelSatisfiedNotifications, scheduleLifecycleNotifications } from '../services/planNotificationService';
import { includedCreditPeriod, paidPlanExpiry } from '../domain/plans/entitlements';
import { planSubscriptionCheckoutService } from '../services/planSubscriptionCheckoutService';
import { planSubscriptionLifecycleService } from '../services/planSubscriptionLifecycleService';
import {
    MarketplaceCityValidationError,
    requireMarketplaceCity,
} from '../domain/marketplace/location';

export const billingControllerDependencies = { activateMarketplace };

const razorpayConfig = getRazorpayConfig();

const razorpay = new Razorpay({
    key_id: razorpayConfig.keyId,
    key_secret: razorpayConfig.keySecret,
});

const CREDIT_PACKS = {
    quiz_credits_5: { credits: 5, amountPaise: 25_000 },
    quiz_credits_10: { credits: 10, amountPaise: 50_000 },
    quiz_credits_25: { credits: 25, amountPaise: 100_000 },
    quiz_credits_40: { credits: 40, amountPaise: 150_000 }
} as const;

export type CheckoutProduct =
    | { kind: 'PLAN'; plan: CanonicalPlan; billingCycle: BillingCycle; amountPaise: number }
    | { kind: 'CREDIT_PACK'; creditPackId: keyof typeof CREDIT_PACKS; credits: number; amountPaise: number };

export function resolveCheckoutProduct(planId: unknown, billingCycle: unknown): CheckoutProduct {
    if (typeof planId === 'string' && planId.startsWith('quiz_credits_')) {
        const pack = CREDIT_PACKS[planId as keyof typeof CREDIT_PACKS];
        if (!pack) throw new Error('INVALID_CREDIT_PACK');
        return { kind: 'CREDIT_PACK', creditPackId: planId as keyof typeof CREDIT_PACKS, ...pack };
    }
    const plan = normalizePlanId(planId);
    const normalizedCycle = typeof billingCycle === 'string' ? billingCycle.toUpperCase() as BillingCycle : billingCycle as BillingCycle;
    const catalogue = PLAN_CATALOG.find(product => product.id === plan)!;
    const amountPaise = plan === 'MARKETPLACE' && catalogue.promotionalPricePaise !== null
        ? catalogue.promotionalPricePaise
        : resolvePlanPrice(plan, normalizedCycle);
    if (plan === 'MARKETPLACE' && normalizedCycle !== 'ONE_TIME') throw new Error('INVALID_PLAN_CYCLE');
    if (plan !== 'MARKETPLACE' && normalizedCycle === 'ONE_TIME') throw new Error('INVALID_PLAN_CYCLE');
    return { kind: 'PLAN', plan, billingCycle: normalizedCycle, amountPaise };
}

export function verifyRazorpaySignature(providerOrderId: string, providerPaymentId: string, signature: string, secret = razorpayConfig.keySecret): boolean {
    if (!providerOrderId || !providerPaymentId || !/^[a-f0-9]{64}$/i.test(signature)) return false;
    const expected = crypto.createHmac('sha256', secret).update(`${providerOrderId}|${providerPaymentId}`).digest();
    const supplied = Buffer.from(signature, 'hex');
    return supplied.length === expected.length && crypto.timingSafeEqual(supplied, expected);
}

export async function fulfillStoredBillingPayment(paymentId: string, providerPaymentId: string, providerSignature?: string) {
    const payment = await prisma.billingPayment.findUniqueOrThrow({ where: { id: paymentId } });
    if (payment.providerPaymentId === providerPaymentId && ['COMPLETED', 'CREDITED'].includes(payment.status)) return payment;
    const staleBefore = new Date(Date.now() - 2 * 60_000);
    const fulfillmentAnchor = payment.capturedAt ?? new Date();
    const claimed = await prisma.billingPayment.updateMany({
        where: {
            id: payment.id,
            OR: [
                { status: 'PENDING', OR: [{ providerPaymentId: null }, { providerPaymentId }] },
                { status: 'PAYMENT_FAILED' },
                { status: { in: ['ACTIVATING', 'FULFILLING'] }, providerPaymentId, verifiedAt: { lte: staleBefore } }
            ]
        },
        data: { status: 'FULFILLING', providerPaymentId, ...(providerSignature ? { providerSignature } : {}), verifiedAt: new Date(), capturedAt: fulfillmentAnchor }
    });
    if (claimed.count !== 1) throw new Error('PAYMENT_ALREADY_PROCESSING');
    if (payment.creditPackId) {
        const product = resolveCheckoutProduct(payment.creditPackId, undefined);
        if (product.kind !== 'CREDIT_PACK') throw new Error('INVALID_STORED_CREDIT_PACK');
        await grantLifetimeQuizCredits({ instituteId: payment.instituteId, amount: product.credits, source: 'BILLING_PAYMENT', billingPaymentId: payment.id });
    } else if (payment.plan && payment.billingCycle) {
        const plan = payment.plan;
        const billingCycle = payment.billingCycle;
        if (billingCycle === 'ONE_TIME' || !['QUIZ', 'ENTERPRISE'].includes(plan)) throw new Error('INVALID_STORED_BILLING_PRODUCT');
        await prisma.$transaction(async tx => {
            await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${payment.id}))`;
            await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${payment.instituteId}))`;
            const currentPayment = await tx.billingPayment.findUniqueOrThrow({ where: { id: payment.id } });
            if (currentPayment.status === 'COMPLETED' && currentPayment.providerPaymentId === providerPaymentId) return;
            if (currentPayment.status !== 'FULFILLING' || currentPayment.providerPaymentId !== providerPaymentId) throw new Error('PAYMENT_ALREADY_PROCESSING');
            const institute = await tx.institute.findUniqueOrThrow({ where: { id: payment.instituteId } });
            const period = includedCreditPeriod({ planStartDate: fulfillmentAnchor }, fulfillmentAnchor);
            await tx.institute.update({ where: { id: institute.id }, data: {
                plan, billingCycle, planStartDate: fulfillmentAnchor,
                planExpiryDate: paidPlanExpiry(fulfillmentAnchor, billingCycle), trialStartedAt: null, trialEndsAt: null,
                marketplaceAccessGrantedAt: institute.marketplaceAccessGrantedAt ?? fulfillmentAnchor,
                includedQuizCredits: 5, includedQuizCreditsExpireAt: period.includedQuizCreditsExpireAt,
                quizCreditsRenewAt: period.quizCreditsRenewAt, quizCredits: 5 + institute.lifetimeQuizCredits
            } });
            await tx.billingPayment.update({ where: { id: payment.id }, data: { status: 'COMPLETED', capturedAt: fulfillmentAnchor } });
        }, { maxWait: 120_000, timeout: 120_000 });
    } else throw new Error('INVALID_STORED_BILLING_PRODUCT');
    await cancelSatisfiedNotifications(payment.instituteId).catch(() => undefined);
    await scheduleLifecycleNotifications({ instituteId: payment.instituteId, event: 'PAYMENT_SUCCEEDED', effectiveAt: new Date(), reference: `payment:${payment.id}` }).catch(() => undefined);
    return prisma.billingPayment.findUniqueOrThrow({ where: { id: payment.id } });
}

export const createBillingSession = async (req: Request, res: Response) => {
    try {
        const adminId = req.user?.id;
        const { planId, billingCycle } = req.body;
        if (!adminId) return res.status(401).json({ error: 'Unauthorized' });
        const admin = await prisma.admin.findUnique({
            where: { id: adminId },
            include: { institute: true }
        });
        if (!admin?.institute) return res.status(404).json({ error: 'Institute not found' });

        let product: CheckoutProduct;
        try {
            product = resolveCheckoutProduct(planId, billingCycle);
        } catch (error) {
            return res.status(400).json({ error: error instanceof Error ? error.message : 'INVALID_BILLING_PRODUCT' });
        }

        if (product.kind === 'PLAN' && product.plan === 'MARKETPLACE' && product.amountPaise === 0) {
            const canonicalCity = requireMarketplaceCity(admin.institute.city);
            const lifecycle = await billingControllerDependencies.activateMarketplace(admin.institute.id);
            await prisma.institute.update({
                where: { id: admin.institute.id },
                data: { isPubliclyListed: true, city: canonicalCity },
            });
            invalidateAuthCache(adminId);
            return res.json({ success: true, mode: 'ACTIVATED', plan: lifecycle.effectivePlan });
        }

        if (product.kind === 'PLAN' && product.billingCycle === 'MONTHLY') {
            const ownerIdentity = admin.institute.phoneNumber || admin.institute.email || (admin as any).phone || '';
            const session = await planSubscriptionCheckoutService.createMonthlySubscriptionCheckout({
                context: { kind: 'INSTITUTE', instituteId: admin.institute.id, ownerIdentity },
                plan: product.plan
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

        const pending = await prisma.billingPayment.create({
            data: {
                instituteId: admin.institute.id,
                plan: product.kind === 'PLAN' ? product.plan : null,
                creditPackId: product.kind === 'CREDIT_PACK' ? product.creditPackId : null,
                amountPaise: product.amountPaise,
                billingCycle: product.kind === 'PLAN' ? product.billingCycle : null,
                providerOrderId: `pending_${crypto.randomUUID()}`
            }
        });

        try {
            const order = await razorpay.orders.create({
                amount: product.amountPaise,
                currency: 'INR',
                receipt: `ml_${pending.id.replace(/-/g, '').slice(0, 28)}`,
                payment_capture: true,
                notes: {
                    billingPaymentId: pending.id,
                    instituteId: admin.institute.id,
                    productId: product.kind === 'PLAN' ? product.plan : product.creditPackId,
                    billingCycle: product.kind === 'PLAN' ? product.billingCycle : 'ONE_TIME'
                }
            } as any);
            await prisma.billingPayment.update({ where: { id: pending.id }, data: { providerOrderId: String((order as any).id) } });
            return res.json({
                success: true,
                mode: 'ORDER',
                billingPaymentId: pending.id,
                orderId: (order as any).id,
                amount: product.amountPaise,
                currency: 'INR',
                keyId: razorpayConfig.keyId
            });
        } catch (error) {
            await prisma.billingPayment.update({ where: { id: pending.id }, data: { status: 'PROVIDER_FAILED', verificationFailedAt: new Date() } });
            throw error;
        }
    } catch (error) {
        if (error instanceof MarketplaceCityValidationError) {
            return res.status(400).json({ error: error.message });
        }
        console.error('Create Billing Session Error:', error);
        res.status(500).json({ error: error instanceof Error ? error.message : 'Internal server error during billing initialization.' });
    }
};

export const verifyBillingPayment = async (req: Request, res: Response) => {
    try {
        const adminId = req.user?.id;
        const { razorpay_order_id, razorpay_payment_id, razorpay_subscription_id, razorpay_signature } = req.body;
        if (!adminId) return res.status(401).json({ error: 'Unauthorized' });
        const admin = await prisma.admin.findUnique({
            where: { id: adminId },
            include: { institute: true }
        });
        if (!admin?.institute) return res.status(404).json({ error: 'Institute not found' });

        if (razorpay_subscription_id) {
            await planSubscriptionCheckoutService.verifyMonthlySubscriptionCheckout({
                razorpay_payment_id,
                razorpay_subscription_id,
                razorpay_signature,
                instituteId: admin.institute.id
            });
            await planSubscriptionLifecycleService.applySubscriptionEvent({
                kind: 'AUTHENTICATED',
                providerSubscriptionId: razorpay_subscription_id
            });
            invalidateAuthCache(adminId);
            return res.json({
                success: true,
                mode: 'SUBSCRIPTION',
                subscriptionId: razorpay_subscription_id
            });
        }

        if (!verifyRazorpaySignature(razorpay_order_id, razorpay_payment_id, razorpay_signature)) {
            return res.status(400).json({ error: 'Invalid payment signature.' });
        }

        const payment = await prisma.billingPayment.findUnique({ where: { providerOrderId: razorpay_order_id } });
        if (!payment || payment.instituteId !== admin.institute.id) return res.status(404).json({ error: 'Billing payment not found.' });
        if (payment.providerPaymentId === razorpay_payment_id && ['COMPLETED', 'CREDITED'].includes(payment.status)) {
            return res.json({ success: true, replay: true, billingPaymentId: payment.id, status: payment.status });
        }

        const providerPayment = await razorpay.payments.fetch(razorpay_payment_id) as any;
        const providerAmount = Number(providerPayment.amount);
        if (String(providerPayment.order_id) !== payment.providerOrderId || providerAmount !== payment.amountPaise || providerPayment.currency !== 'INR' || providerPayment.status !== 'captured') {
            return res.status(400).json({ error: 'PAYMENT_BINDING_MISMATCH' });
        }

        const fulfilled = await fulfillStoredBillingPayment(payment.id, razorpay_payment_id, razorpay_signature);
        invalidateAuthCache(adminId);
        return res.json({ success: true, billingPaymentId: payment.id, status: fulfilled.status });
    } catch (error) {
        console.error('Verify Billing Error:', error);
        if (error instanceof Error && error.message === 'PAYMENT_ALREADY_PROCESSING') return res.status(409).json({ error: error.message });
        res.status(500).json({ error: error instanceof Error ? error.message : 'Internal server error during billing verification.' });
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

        let cancellation: { cancelled: boolean; cancelAtPeriodEnd: boolean; effectiveUntil: Date | null };
        try {
            cancellation = await planSubscriptionLifecycleService.cancelSubscriptionForInstitute({
                instituteId: admin.institute.id
            });
        } catch (err: any) {
            if (err?.message !== 'ACTIVE_SUBSCRIPTION_NOT_FOUND') {
                console.error('Error cancelling plan subscription:', err);
            }
            if (admin.institute.razorpaySubscriptionId) {
                try {
                    await razorpay.subscriptions.cancel(admin.institute.razorpaySubscriptionId, true);
                } catch {}
            }
            await cancelAtPeriodEnd(admin.institute.id);
            cancellation = {
                cancelled: true,
                cancelAtPeriodEnd: true,
                effectiveUntil: admin.institute.planExpiryDate || null
            };
        }

        invalidateAuthCache(adminId);
        res.json({
            success: true,
            cancelled: cancellation.cancelled,
            cancelAtPeriodEnd: cancellation.cancelAtPeriodEnd,
            effectiveAt: cancellation.effectiveUntil?.toISOString() ?? null
        });
    } catch (error) {
        console.error('Cancel Subscription Error:', error);
        res.status(500).json({ error: 'Failed to cancel subscription.' });
    }
};

export const getBillingSubscription = async (req: Request, res: Response) => {
    try {
        const adminId = req.user?.id;
        if (!adminId) return res.status(401).json({ error: 'Unauthorized' });
        const admin = await prisma.admin.findUnique({ where: { id: adminId }, include: { institute: true } });
        if (!admin?.institute) return res.status(404).json({ error: 'Institute not found' });
        const subscription = await prisma.planSubscription.findFirst({
            where: { instituteId: admin.institute.id },
            orderBy: { createdAt: 'desc' },
            select: {
                status: true,
                plan: true,
                amountPaise: true,
                nextChargeAt: true,
                currentPeriodEnd: true,
                graceEndsAt: true,
                cancelAtPeriodEnd: true,
                cancelEffectiveAt: true
            }
        });
        return res.json({
            subscription: subscription ? {
                ...subscription,
                nextChargeAt: subscription.nextChargeAt?.toISOString() ?? null,
                currentPeriodEnd: subscription.currentPeriodEnd?.toISOString() ?? null,
                graceEndsAt: subscription.graceEndsAt?.toISOString() ?? null,
                cancelEffectiveAt: subscription.cancelEffectiveAt?.toISOString() ?? null
            } : null
        });
    } catch (error) {
        console.error('Get Billing Subscription Error:', error);
        return res.status(500).json({ error: 'Failed to load subscription status.' });
    }
};
