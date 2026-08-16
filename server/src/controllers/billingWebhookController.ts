import crypto from 'crypto';
import type { Request, Response } from 'express';
import { Prisma } from '@prisma/client';
import { prisma } from '../prisma';
import { activatePaidPlan, cancelAtPeriodEnd } from '../services/subscriptionLifecycleService';
import { cancelSatisfiedNotifications, scheduleLifecycleNotifications } from '../services/planNotificationService';

export type SanitizedBillingWebhook = {
  providerEventId: string;
  eventType: string;
  paymentId: string | null;
  orderId: string | null;
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
  return {
    providerEventId: String(body?.id ?? ''),
    eventType: String(body?.event ?? ''),
    paymentId: payment.id ? String(payment.id) : null,
    orderId: payment.order_id ? String(payment.order_id) : null,
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
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') return res.json({ success: true, duplicate: true });
    throw error;
  }

  try {
    const payment = event.orderId ? await prisma.billingPayment.findUnique({ where: { providerOrderId: event.orderId } }) : null;
    if (event.eventType === 'payment.failed' && payment) {
      await prisma.billingPayment.update({ where: { id: payment.id }, data: { status: 'PAYMENT_FAILED', verificationFailedAt: new Date() } });
      await scheduleLifecycleNotifications({ instituteId: payment.instituteId, event: 'PAYMENT_FAILED', effectiveAt: new Date(), reference: `payment:${payment.id}` }).catch(() => undefined);
    } else if (event.eventType === 'subscription.charged' && payment?.plan && payment.billingCycle) {
      await activatePaidPlan({ instituteId: payment.instituteId, plan: payment.plan, billingCycle: payment.billingCycle });
      await prisma.billingPayment.update({ where: { id: payment.id }, data: { status: 'COMPLETED', capturedAt: new Date(), providerPaymentId: event.paymentId } });
      await cancelSatisfiedNotifications(payment.instituteId).catch(() => undefined);
      await scheduleLifecycleNotifications({ instituteId: payment.instituteId, event: 'PAYMENT_SUCCEEDED', effectiveAt: new Date(), reference: `webhook:${event.providerEventId}` }).catch(() => undefined);
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
