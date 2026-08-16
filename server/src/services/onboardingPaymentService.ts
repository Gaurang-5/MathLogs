import crypto from 'crypto';
import Razorpay from 'razorpay';
import { Prisma, type BillingCycle, type OnboardingPayment } from '@prisma/client';
import { prisma } from '../prisma';
import { includedCreditPeriod, paidPlanExpiry } from '../domain/plans/entitlements';
import { getRazorpayConfig } from '../utils/env';

const config = getRazorpayConfig();
const razorpay = new Razorpay({ key_id: config.keyId, key_secret: config.keySecret });

export class OnboardingPaymentError extends Error {}

export function verifyOnboardingPaymentSignature(orderId: string, paymentId: string, signature: string): boolean {
  if (!orderId || !paymentId || !/^[a-f0-9]{64}$/i.test(signature)) return false;
  const expected = crypto.createHmac('sha256', config.keySecret).update(`${orderId}|${paymentId}`).digest();
  const supplied = Buffer.from(signature, 'hex');
  return supplied.length === expected.length && crypto.timingSafeEqual(supplied, expected);
}

export async function persistOnboardingOrder(input: {
  providerOrderId: string; amountPaise: number; plan: 'QUIZ' | 'ENTERPRISE'; billingCycle: BillingCycle;
  provisioningData: Prisma.InputJsonObject; onboardingLinkId?: string;
}) {
  return prisma.onboardingPayment.create({ data: input });
}

export async function verifyAndClaimOnboardingPayment(input: {
  orderId: string; paymentId: string; signature: string; onboardingLinkId?: string;
}): Promise<OnboardingPayment> {
  if (!verifyOnboardingPaymentSignature(input.orderId, input.paymentId, input.signature)) throw new OnboardingPaymentError('INVALID_PAYMENT_SIGNATURE');
  const stored = await prisma.onboardingPayment.findUnique({ where: { providerOrderId: input.orderId } });
  if (!stored || stored.onboardingLinkId !== (input.onboardingLinkId ?? null)) throw new OnboardingPaymentError('ONBOARDING_PAYMENT_NOT_FOUND');
  if (stored.providerPaymentId === input.paymentId && stored.status === 'COMPLETED') return stored;
  if (stored.providerPaymentId === input.paymentId && stored.status === 'ACTIVATING') {
    if (!stored.verifiedAt || stored.verifiedAt.getTime() > Date.now() - 2 * 60_000) throw new OnboardingPaymentError('ONBOARDING_PAYMENT_ALREADY_USED');
    const recovered = await prisma.onboardingPayment.updateMany({
      where: { id: stored.id, status: 'ACTIVATING', providerPaymentId: input.paymentId, verifiedAt: { lte: new Date(Date.now() - 2 * 60_000) } },
      data: { verifiedAt: new Date() }
    });
    if (recovered.count !== 1) throw new OnboardingPaymentError('ONBOARDING_PAYMENT_ALREADY_USED');
    return prisma.onboardingPayment.findUniqueOrThrow({ where: { id: stored.id } });
  }
  if (stored.status !== 'PENDING') throw new OnboardingPaymentError('ONBOARDING_PAYMENT_ALREADY_USED');

  const provider = await razorpay.payments.fetch(input.paymentId) as any;
  if (String(provider.order_id) !== stored.providerOrderId || Number(provider.amount) !== stored.amountPaise || provider.currency !== stored.currency || provider.status !== 'captured') {
    throw new OnboardingPaymentError('PAYMENT_BINDING_MISMATCH');
  }
  const claimed = await prisma.onboardingPayment.updateMany({
    where: { id: stored.id, status: 'PENDING', providerPaymentId: null },
    data: { status: 'ACTIVATING', providerPaymentId: input.paymentId, providerSignature: input.signature, verifiedAt: new Date() }
  });
  if (claimed.count !== 1) throw new OnboardingPaymentError('ONBOARDING_PAYMENT_ALREADY_USED');
  return prisma.onboardingPayment.findUniqueOrThrow({ where: { id: stored.id } });
}

function expiry(start: Date, cycle: BillingCycle): Date {
  if (cycle === 'ONE_TIME') throw new OnboardingPaymentError('INVALID_PLAN_CYCLE');
  return paidPlanExpiry(start, cycle);
}

function safeSlug(name: string, id: string): string {
  const base = name.toLowerCase().trim().replace(/\s+/g, '-').replace(/[^\w-]+/g, '').replace(/--+/g, '-') || 'coaching';
  return `${base}-${id.replace(/-/g, '').slice(0, 8)}`;
}

export async function provisionClaimedOnboardingPayment(payment: OnboardingPayment) {
  if (payment.status === 'COMPLETED' && payment.provisionedInstituteId) {
    const invite = await prisma.inviteToken.findFirst({ where: { instituteId: payment.provisionedInstituteId, isUsed: false }, orderBy: { createdAt: 'desc' } });
    return { instituteId: payment.provisionedInstituteId, inviteToken: invite?.token ?? null, replay: true };
  }
  if (payment.status !== 'ACTIVATING') throw new OnboardingPaymentError('ONBOARDING_PAYMENT_NOT_CLAIMED');
  const payload = payment.provisioningData as Record<string, any>;
  const now = new Date();
  const planExpiryDate = expiry(now, payment.billingCycle);
  const period = includedCreditPeriod({ planStartDate: now }, now);
  const provision = () => prisma.$transaction(async tx => {
    const current = await tx.onboardingPayment.findUniqueOrThrow({ where: { id: payment.id } });
    if (current.status !== 'ACTIVATING' || current.provisionedInstituteId) throw new OnboardingPaymentError('ONBOARDING_PAYMENT_ALREADY_USED');
    const institute = await tx.institute.create({ data: {
      name: String(payload.tuitionName || payload.instituteName || 'New Institute'),
      teacherName: String(payload.ownerName || payload.teacherName || ''), phoneNumber: String(payload.phone || payload.phoneNumber || ''),
      publicPhone: String(payload.phone || payload.phoneNumber || '') || null, whatsappPhone: String(payload.phone || payload.phoneNumber || '') || null,
      email: String(payload.email || '') || null, slug: safeSlug(String(payload.tuitionName || payload.instituteName || 'coaching'), payment.id),
      plan: payment.plan, billingCycle: payment.billingCycle, planStartDate: now, planExpiryDate,
      marketplaceAccessGrantedAt: now, includedQuizCredits: 5, lifetimeQuizCredits: 0, quizCredits: 5,
      includedQuizCreditsExpireAt: period.includedQuizCreditsExpireAt, quizCreditsRenewAt: period.quizCreditsRenewAt,
      canonicalPlanMigratedAt: now, isPubliclyListed: payload.listOnMarketplace ?? true,
      city: payload.city ? String(payload.city).trim() : null, area: payload.area ? String(payload.area).trim() : null,
      subjectsOffered: Array.isArray(payload.subjectsOffered) ? payload.subjectsOffered : [],
      googleMapsUrl: payload.googleMapsUrl ? String(payload.googleMapsUrl).trim() : null,
      config: { requiresGrades: true, allowedClasses: ['Class 6','Class 7','Class 8','Class 9','Class 10','Class 11','Class 12'], subjects: ['Mathematics','Science','Physics','Chemistry','Biology','English'] }
    } });
    const invite = await tx.inviteToken.create({ data: { token: crypto.randomBytes(24).toString('hex'), instituteId: institute.id, expiresAt: new Date(now.getTime() + 7 * 86_400_000) } });
    if (payment.onboardingLinkId) {
      const link = await tx.adminOnboardingLink.updateMany({ where: { id: payment.onboardingLinkId, status: 'PENDING', expiresAt: { gt: now } }, data: { status: 'USED', instituteId: institute.id } });
      if (link.count !== 1) throw new OnboardingPaymentError('ONBOARDING_LINK_NOT_AVAILABLE');
    }
    await tx.onboardingPayment.update({ where: { id: payment.id }, data: { status: 'COMPLETED', provisionedInstituteId: institute.id, completedAt: now } });
    return { instituteId: institute.id, inviteToken: invite.token, replay: false };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, maxWait: 120_000, timeout: 120_000 });
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try { return await provision(); }
    catch (error) {
      const retryable = error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2034';
      if (!retryable || attempt === 2) throw error;
    }
  }
  throw new OnboardingPaymentError('ONBOARDING_PROVISIONING_FAILED');
}
