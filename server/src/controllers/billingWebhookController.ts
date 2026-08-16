import crypto from 'crypto';
import type { Request, Response } from 'express';
import { Prisma } from '@prisma/client';
import { prisma } from '../prisma';
import { cancelAtPeriodEnd } from '../services/subscriptionLifecycleService';
import { cancelSatisfiedNotifications, scheduleLifecycleNotifications } from '../services/planNotificationService';
import { fulfillStoredBillingPayment } from './billingController';
import { includedCreditPeriod, paidPlanExpiry } from '../domain/plans/entitlements';

export type SanitizedBillingWebhook = {
  providerEventId: string;
  eventType: string;
  paymentId: string | null;
  orderId: string | null;
  subscriptionId: string | null;
  amount: number | null;
  currency: string | null;
};

export function verifyBillingWebhookSignature(rawBody: Buffer, signature: string, secret: string): boolean {
  if (!secret || !/^[a-f0-9]{64}$/i.test(signature)) return false;
  const expected = crypto.createHmac('sha256', secret).update(rawBody).digest();
  const supplied = Buffer.from(signature, 'hex');
  return supplied.length === expected.length && crypto.timingSafeEqual(supplied, expected);
}

export function sanitizeBillingWebhook(body: any): SanitizedBillingWebhook {
  const payment = body?.payload?.payment?.entity ?? {};
  const subscription = body?.payload?.subscription?.entity ?? {};
  return {
    providerEventId: String(body?.id ?? ''),
    eventType: String(body?.event ?? ''),
    paymentId: payment.id ? String(payment.id) : null,
    orderId: payment.order_id ? String(payment.order_id) : null,
    subscriptionId: payment.subscription_id ? String(payment.subscription_id) : subscription.id ? String(subscription.id) : null,
    amount: Number.isFinite(Number(payment.amount)) ? Number(payment.amount) : null,
    currency: payment.currency ? String(payment.currency) : null
  };
}

export async function handleRazorpayBillingWebhook(req: Request, res: Response) {
  const rawBody = Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0);
  const signature = String(req.get('X-Razorpay-Signature') ?? '');
  const secret = process.env.RAZORPAY_WEBHOOK_SECRET ?? '';
  if (!secret) return res.status(503).json({ success: false, error: 'WEBHOOK_NOT_CONFIGURED' });
  if (!verifyBillingWebhookSignature(rawBody, signature, secret)) return res.status(400).json({ success: false, error: 'INVALID_WEBHOOK_SIGNATURE' });

  let body: any;
  try { body = JSON.parse(rawBody.toString('utf8')); }
  catch { return res.status(400).json({ success: false, error: 'INVALID_WEBHOOK_BODY' }); }
  const event = sanitizeBillingWebhook(body);
  if (!event.providerEventId || !event.eventType) return res.status(400).json({ success: false, error: 'INVALID_WEBHOOK_EVENT' });

  let stored;
  try {
    stored = await prisma.billingWebhookEvent.create({ data: {
      providerEventId: event.providerEventId,
      eventType: event.eventType,
      payload: event as unknown as Prisma.InputJsonValue
    } });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      stored = await prisma.billingWebhookEvent.findUnique({ where: { providerEventId: event.providerEventId } });
      if (!stored || stored.status === 'PROCESSED') return res.json({ success: true, duplicate: true });
      if (stored.status === 'FAILED') await prisma.billingWebhookEvent.update({ where: { id: stored.id }, data: { status: 'RECEIVED', processingError: null, processedAt: null } });
    } else {
      throw error;
    }
  }

  try {
    const payment = event.orderId ? await prisma.billingPayment.findUnique({ where: { providerOrderId: event.orderId } }) : null;
    if (event.eventType === 'payment.failed' && payment) {
      const failed = await prisma.$transaction(async tx => {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${payment.id}))`;
        const current = await tx.billingPayment.findUniqueOrThrow({ where: { id: payment.id } });
        if (current.status !== 'PENDING' || (current.providerPaymentId && current.providerPaymentId !== event.paymentId)) return { count: 0 };
        return tx.billingPayment.updateMany({ where: { id: payment.id, status: 'PENDING' }, data: { status: 'PAYMENT_FAILED', providerPaymentId: event.paymentId, verificationFailedAt: new Date() } });
      });
      if (failed.count === 1) await scheduleLifecycleNotifications({ instituteId: payment.instituteId, event: 'PAYMENT_FAILED', effectiveAt: new Date(), reference: `payment:${payment.id}` }).catch(() => undefined);
    } else if (['payment.captured', 'order.paid'].includes(event.eventType) && payment && event.paymentId) {
      if (event.amount !== payment.amountPaise || event.currency !== 'INR') throw new Error('PAYMENT_BINDING_MISMATCH');
      await fulfillStoredBillingPayment(payment.id, event.paymentId);
    } else if (event.eventType === 'subscription.charged') {
      const institute = event.subscriptionId
        ? await prisma.institute.findFirst({ where: { razorpaySubscriptionId: event.subscriptionId } })
        : payment ? await prisma.institute.findUnique({ where: { id: payment.instituteId } }) : null;
      if (!institute || !['QUIZ', 'ENTERPRISE'].includes(institute.plan) || !['MONTHLY', 'YEARLY'].includes(String(institute.billingCycle))) throw new Error('SUBSCRIPTION_BINDING_MISMATCH');
      const now = new Date();
      const applied = await prisma.$transaction(async tx => {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${stored.id}))`;
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${institute.id}))`;
        const currentEvent = await tx.billingWebhookEvent.findUniqueOrThrow({ where: { id: stored.id } });
        if (currentEvent.status === 'PROCESSED') return false;
        const current = await tx.institute.findUniqueOrThrow({ where: { id: institute.id } });
        if (!['QUIZ', 'ENTERPRISE'].includes(current.plan) || !['MONTHLY', 'YEARLY'].includes(String(current.billingCycle))) throw new Error('SUBSCRIPTION_BINDING_MISMATCH');
        if (event.subscriptionId && current.razorpaySubscriptionId !== event.subscriptionId) throw new Error('SUBSCRIPTION_BINDING_MISMATCH');
        if (payment && payment.instituteId !== current.id) throw new Error('SUBSCRIPTION_BINDING_MISMATCH');
        const renewalStart = current.planExpiryDate && current.planExpiryDate > now ? current.planExpiryDate : now;
        const cycle = current.billingCycle as 'MONTHLY' | 'YEARLY';
        const period = includedCreditPeriod({ planStartDate: renewalStart }, renewalStart);
        await tx.institute.update({ where: { id: current.id }, data: {
          planStartDate: renewalStart, planExpiryDate: paidPlanExpiry(renewalStart, cycle),
          includedQuizCredits: 5, includedQuizCreditsExpireAt: period.includedQuizCreditsExpireAt,
          quizCreditsRenewAt: period.quizCreditsRenewAt, quizCredits: 5 + current.lifetimeQuizCredits,
          marketplaceAccessGrantedAt: current.marketplaceAccessGrantedAt ?? now
        } });
        if (payment) await tx.billingPayment.updateMany({ where: { id: payment.id, status: { notIn: ['COMPLETED', 'CREDITED'] } }, data: { status: 'COMPLETED', capturedAt: now, providerPaymentId: event.paymentId } });
        await tx.billingWebhookEvent.update({ where: { id: stored.id }, data: { status: 'PROCESSED', processedAt: now, instituteId: current.id } });
        return true;
      }, { maxWait: 120_000, timeout: 120_000 });
      if (!applied) return res.json({ success: true, duplicate: true });
      await cancelSatisfiedNotifications(institute.id).catch(() => undefined);
      await scheduleLifecycleNotifications({ instituteId: institute.id, event: 'PAYMENT_SUCCEEDED', effectiveAt: now, reference: `webhook:${event.providerEventId}` }).catch(() => undefined);
      return res.json({ success: true });
    } else if (event.eventType === 'subscription.cancelled') {
      const instituteId = String(body?.payload?.subscription?.entity?.notes?.instituteId ?? '');
      if (instituteId) await cancelAtPeriodEnd(instituteId);
    }
    await prisma.billingWebhookEvent.update({ where: { id: stored.id }, data: { status: 'PROCESSED', processedAt: new Date(), instituteId: payment?.instituteId } });
    return res.json({ success: true });
  } catch (error) {
    await prisma.billingWebhookEvent.update({ where: { id: stored.id }, data: { status: 'FAILED', processedAt: new Date(), processingError: error instanceof Error ? error.message.slice(0, 500) : 'UNKNOWN_ERROR' } });
    return res.status(500).json({ success: false, error: 'WEBHOOK_PROCESSING_FAILED' });
  }
}
