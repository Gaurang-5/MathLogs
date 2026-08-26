import { Prisma, PrismaClient } from '@prisma/client';
import { prisma as defaultPrisma } from '../prisma';
import {
  getMonthlySubscriptionProduct,
  subscriptionsCreationEnabled,
  verifySubscriptionCheckoutSignature,
  planSubscriptionProvider,
  type PlanSubscriptionProvider
} from './planSubscriptionProvider';
import { hashTrialOwnerIdentity } from './subscriptionLifecycleService';
import type { ProvisioningInput } from './accountProvisioningService';
import { getRazorpayConfig } from '../utils/env';

export type CheckoutContext =
  | { kind: 'INSTITUTE'; instituteId: string; ownerIdentity: string }
  | { kind: 'PUBLIC_ONBOARDING'; ownerIdentity: string; provisioning: ProvisioningInput }
  | { kind: 'INVITE_ONBOARDING'; onboardingLinkId: string; ownerIdentity: string; provisioning: ProvisioningInput };

export type SubscriptionCheckoutSession = {
  mode: 'SUBSCRIPTION';
  attemptId: string;
  subscriptionId: string;
  keyId: string;
  plan: 'QUIZ' | 'ENTERPRISE';
  billingCycle: 'MONTHLY';
  amount: number;
  currency: 'INR';
  trialEligible: boolean;
  firstChargeAt: Date;
  totalCount: 120;
};

export class SubscriptionCheckoutError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SubscriptionCheckoutError';
  }
}

export interface PlanSubscriptionCheckoutService {
  createMonthlySubscriptionCheckout(input: {
    context: CheckoutContext;
    plan: unknown;
    now?: Date;
  }): Promise<SubscriptionCheckoutSession>;
  verifyMonthlySubscriptionCheckout(input: {
    razorpay_payment_id: string;
    razorpay_subscription_id: string;
    razorpay_signature: string;
    instituteId?: string;
    contextKind?: 'PUBLIC_ONBOARDING' | 'INVITE_ONBOARDING';
    onboardingLinkId?: string;
  }): Promise<any>;
}

function addDays(date: Date, days: number): Date {
  const d = new Date(date);
  d.setUTCDate(d.getUTCDate() + days);
  return d;
}

export function createPlanSubscriptionCheckoutService(options?: {
  prisma?: PrismaClient;
  provider?: PlanSubscriptionProvider;
  env?: NodeJS.ProcessEnv | Record<string, string | undefined>;
}): PlanSubscriptionCheckoutService {
  const client = options?.prisma || defaultPrisma;
  const provider = options?.provider || planSubscriptionProvider;
  const env = options?.env || process.env;

  return {
    async createMonthlySubscriptionCheckout(input) {
      if (!subscriptionsCreationEnabled(env)) {
        throw new SubscriptionCheckoutError('SUBSCRIPTION_CREATION_DISABLED');
      }

      const product = getMonthlySubscriptionProduct(input.plan, env);
      const now = input.now || new Date();
      const ownerIdentityHash = hashTrialOwnerIdentity(input.context.ownerIdentity);

      let institute: any = null;
      let trialEligible = true;

      if (input.context.kind === 'INSTITUTE') {
        institute = await client.institute.findUnique({
          where: { id: input.context.instituteId }
        });
        if (!institute) {
          throw new SubscriptionCheckoutError('INSTITUTE_NOT_FOUND');
        }
        if (
          institute.trialUsedAt ||
          (institute.planExpiryDate && institute.planExpiryDate.getTime() > now.getTime())
        ) {
          trialEligible = false;
        } else {
          const claim = await client.planTrialClaim.findFirst({
            where: {
              OR: [
                { instituteId: input.context.instituteId },
                { ownerIdentityHash }
              ]
            }
          });
          if (claim) trialEligible = false;
        }
      } else {
        const claim = await client.planTrialClaim.findUnique({
          where: { ownerIdentityHash }
        });
        if (claim) trialEligible = false;
      }

      // Check open subscriptions
      const openWhere: Prisma.PlanSubscriptionWhereInput = {
        status: { in: ['CREATING', 'CREATED', 'AUTHENTICATED', 'ACTIVE', 'PENDING', 'PROVIDER_UNKNOWN'] },
        ...(input.context.kind === 'INSTITUTE'
          ? { instituteId: input.context.instituteId }
          : { instituteId: null, ownerIdentityHash })
      };

      const existingOpen = await client.planSubscription.findFirst({
        where: openWhere,
        orderBy: { createdAt: 'desc' }
      });

      if (existingOpen) {
        if (existingOpen.status === 'PROVIDER_UNKNOWN') {
          throw new SubscriptionCheckoutError('SUBSCRIPTION_RECONCILIATION_REQUIRED');
        }
        if (['AUTHENTICATED', 'ACTIVE', 'PENDING', 'HALTED'].includes(existingOpen.status)) {
          throw new SubscriptionCheckoutError('ACTIVE_SUBSCRIPTION_EXISTS');
        }
        if (existingOpen.status === 'CREATED' || existingOpen.status === 'CREATING') {
          if (existingOpen.plan !== product.plan) {
            throw new SubscriptionCheckoutError('ACTIVE_SUBSCRIPTION_EXISTS');
          }
          if (existingOpen.providerSubscriptionId && existingOpen.status === 'CREATED') {
            const razorpayConfig = getRazorpayConfig();
            const keyId = env.RAZORPAY_KEY_ID?.trim() || razorpayConfig.keyId;
            return {
              mode: 'SUBSCRIPTION',
              attemptId: existingOpen.id,
              subscriptionId: existingOpen.providerSubscriptionId,
              keyId,
              plan: product.plan,
              billingCycle: 'MONTHLY',
              amount: product.amountPaise,
              currency: 'INR',
              trialEligible: existingOpen.trialEligible,
              firstChargeAt: existingOpen.intendedStartAt,
              totalCount: 120
            };
          }
        }
      }

      // Determine firstChargeAt
      let firstChargeAt: Date;
      if (trialEligible) {
        firstChargeAt = addDays(now, 14);
      } else if (
        input.context.kind === 'INSTITUTE' &&
        institute?.planExpiryDate &&
        institute.planExpiryDate.getTime() > now.getTime()
      ) {
        firstChargeAt = institute.planExpiryDate;
      } else {
        firstChargeAt = now;
      }

      const provisioningData =
        'provisioning' in input.context
          ? (input.context.provisioning as unknown as Prisma.InputJsonValue)
          : Prisma.JsonNull;

      // 1. Create durable attempt row first
      const row = await client.planSubscription.create({
        data: {
          instituteId: input.context.kind === 'INSTITUTE' ? input.context.instituteId : null,
          onboardingLinkId: input.context.kind === 'INVITE_ONBOARDING' ? input.context.onboardingLinkId : null,
          ownerIdentityHash,
          providerPlanId: product.providerPlanId,
          plan: product.plan,
          billingCycle: 'MONTHLY',
          amountPaise: product.amountPaise,
          currency: 'INR',
          totalCount: 120,
          trialEligible,
          intendedStartAt: firstChargeAt,
          trialEndsAt: trialEligible ? firstChargeAt : null,
          status: 'CREATING',
          provisioningData
        }
      });

      // 2. Call provider API
      let providerSub: any;
      try {
        providerSub = await provider.create({
          planId: product.providerPlanId,
          totalCount: 120,
          startAt: trialEligible || firstChargeAt.getTime() > now.getTime() ? firstChargeAt : undefined,
          customerNotify: true,
          notes: {
            attemptId: row.id,
            kind: input.context.kind
          }
        });
      } catch (error: any) {
        const isTimeout =
          error?.code === 'ETIMEDOUT' ||
          error?.code === 'ECONNRESET' ||
          error?.code === 'ENOTFOUND' ||
          error?.status === 504 ||
          error?.status === 503;

        if (isTimeout) {
          await client.planSubscription.update({
            where: { id: row.id },
            data: { status: 'PROVIDER_UNKNOWN' }
          });
          throw new SubscriptionCheckoutError('SUBSCRIPTION_PROVIDER_UNCERTAIN');
        }

        await client.planSubscription.update({
          where: { id: row.id },
          data: { status: 'PROVIDER_FAILED' }
        });
        throw error;
      }

      // 3. Update durable row with provider subscription ID
      const updated = await client.planSubscription.update({
        where: { id: row.id },
        data: {
          providerSubscriptionId: providerSub.id,
          providerCreatedAt: providerSub.createdAt,
          status: 'CREATED'
        }
      });

      const razorpayConfig = getRazorpayConfig();
      const keyId = env.RAZORPAY_KEY_ID?.trim() || razorpayConfig.keyId;

      return {
        mode: 'SUBSCRIPTION',
        attemptId: updated.id,
        subscriptionId: providerSub.id,
        keyId,
        plan: product.plan,
        billingCycle: 'MONTHLY',
        amount: product.amountPaise,
        currency: 'INR',
        trialEligible,
        firstChargeAt,
        totalCount: 120
      };
    },

    async verifyMonthlySubscriptionCheckout(input) {
      const razorpayConfig = getRazorpayConfig();
      const secret = env.RAZORPAY_KEY_SECRET?.trim() || razorpayConfig.keySecret;

      const validSignature = verifySubscriptionCheckoutSignature(
        input.razorpay_payment_id,
        input.razorpay_subscription_id,
        input.razorpay_signature,
        secret
      );

      if (!validSignature) {
        throw new SubscriptionCheckoutError('INVALID_PAYMENT_SIGNATURE');
      }

      const stored = await client.planSubscription.findUnique({
        where: { providerSubscriptionId: input.razorpay_subscription_id }
      });

      if (!stored) {
        throw new SubscriptionCheckoutError('SUBSCRIPTION_NOT_FOUND');
      }

      if (input.instituteId && stored.instituteId !== input.instituteId) {
        throw new SubscriptionCheckoutError('SUBSCRIPTION_BINDING_MISMATCH');
      }
      if (input.contextKind === 'PUBLIC_ONBOARDING') {
        const provisioning = stored.provisioningData as Record<string, unknown> | null;
        if (stored.instituteId || stored.onboardingLinkId || provisioning?.kind !== 'PUBLIC') {
          throw new SubscriptionCheckoutError('SUBSCRIPTION_BINDING_MISMATCH');
        }
      }
      if (input.contextKind === 'INVITE_ONBOARDING' && (
        !input.onboardingLinkId || stored.onboardingLinkId !== input.onboardingLinkId
      )) {
        throw new SubscriptionCheckoutError('SUBSCRIPTION_BINDING_MISMATCH');
      }

      const [providerSub, providerPayment] = await Promise.all([
        provider.fetchSubscription(input.razorpay_subscription_id),
        provider.fetchPayment(input.razorpay_payment_id)
      ]);

      if (providerSub.planId && stored.providerPlanId && providerSub.planId !== stored.providerPlanId) {
        throw new SubscriptionCheckoutError('SUBSCRIPTION_BINDING_MISMATCH');
      }

      if (
        providerPayment.subscriptionId &&
        providerPayment.subscriptionId !== input.razorpay_subscription_id
      ) {
        throw new SubscriptionCheckoutError('SUBSCRIPTION_BINDING_MISMATCH');
      }

      if (providerPayment.currency !== stored.currency) {
        throw new SubscriptionCheckoutError('SUBSCRIPTION_BINDING_MISMATCH');
      }

      return stored;
    }
  };
}

export const planSubscriptionCheckoutService = createPlanSubscriptionCheckoutService();
