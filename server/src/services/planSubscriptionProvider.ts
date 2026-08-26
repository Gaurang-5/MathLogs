import crypto from 'crypto';
import Razorpay from 'razorpay';
import { getRazorpayConfig } from '../utils/env';
import { normalizePlanId } from '../domain/plans/planCatalog';

export interface ProviderSubscription {
  id: string;
  planId: string;
  status: string;
  totalCount: number;
  startAt: Date | null;
  createdAt: Date | null;
  chargeAt?: Date | null;
  currentStart?: Date | null;
  currentEnd?: Date | null;
  endedAt?: Date | null;
  notes?: Record<string, string>;
}

export interface ProviderPayment {
  id: string;
  subscriptionId: string | null;
  amountPaise: number;
  currency: string;
  status: string;
  method?: string | null;
  createdAt: Date | null;
}

export interface PlanSubscriptionProduct {
  plan: 'QUIZ' | 'ENTERPRISE';
  providerPlanId: string;
  amountPaise: number;
  currency: 'INR';
  totalCount: 120;
}

export interface PlanSubscriptionProvider {
  create(input: {
    planId: string;
    totalCount: 120;
    startAt?: Date;
    customerNotify: true;
    notes: Record<string, string>;
  }): Promise<ProviderSubscription>;
  fetchSubscription(id: string): Promise<ProviderSubscription>;
  fetchPayment(id: string): Promise<ProviderPayment>;
  findByAttemptId(attemptId: string): Promise<ProviderSubscription[]>;
  cancel(id: string, cancelAtCycleEnd: boolean): Promise<ProviderSubscription>;
}

function parseSeconds(val: unknown): Date | null {
  if (val === null || val === undefined) return null;
  const num = Number(val);
  if (!Number.isFinite(num) || num <= 0) return null;
  return new Date(num * 1000);
}

function mapSubscription(entity: any): ProviderSubscription {
  return {
    id: String(entity?.id || ''),
    planId: String(entity?.plan_id || ''),
    status: String(entity?.status || '').toLowerCase(),
    totalCount: Number(entity?.total_count || 120),
    startAt: parseSeconds(entity?.start_at),
    createdAt: parseSeconds(entity?.created_at),
    chargeAt: parseSeconds(entity?.charge_at),
    currentStart: parseSeconds(entity?.current_start),
    currentEnd: parseSeconds(entity?.current_end),
    endedAt: parseSeconds(entity?.ended_at),
    notes: entity?.notes && typeof entity.notes === 'object' ? entity.notes : {}
  };
}

function mapPayment(entity: any): ProviderPayment {
  return {
    id: String(entity?.id || ''),
    subscriptionId: entity?.subscription_id ? String(entity.subscription_id) : null,
    amountPaise: Number(entity?.amount || 0),
    currency: String(entity?.currency || 'INR'),
    status: String(entity?.status || '').toLowerCase(),
    method: entity?.method ? String(entity.method) : null,
    createdAt: parseSeconds(entity?.created_at)
  };
}

export function getMonthlySubscriptionProduct(
  plan: unknown,
  env: NodeJS.ProcessEnv | Record<string, string | undefined> = process.env
): PlanSubscriptionProduct {
  let normalizedPlan: string;
  try {
    normalizedPlan = normalizePlanId(plan);
  } catch {
    throw new Error('INVALID_SUBSCRIPTION_PLAN');
  }

  if (normalizedPlan !== 'QUIZ' && normalizedPlan !== 'ENTERPRISE') {
    throw new Error('INVALID_SUBSCRIPTION_PLAN');
  }

  let providerPlanId: string | undefined;
  let amountPaise: number;

  if (normalizedPlan === 'QUIZ') {
    providerPlanId = env.RAZORPAY_PLAN_QUIZ_MONTHLY?.trim();
    amountPaise = 24900;
  } else {
    providerPlanId = env.RAZORPAY_PLAN_ENTERPRISE_MONTHLY?.trim();
    amountPaise = 49900;
  }

  if (!providerPlanId) {
    throw new Error('SUBSCRIPTION_PLAN_NOT_CONFIGURED');
  }

  return {
    plan: normalizedPlan,
    providerPlanId,
    amountPaise,
    currency: 'INR',
    totalCount: 120
  };
}

export function verifySubscriptionCheckoutSignature(
  paymentId: string,
  subscriptionId: string,
  signature: string,
  secret?: string
): boolean {
  const actualSecret = secret || getRazorpayConfig().keySecret;
  if (!paymentId || !subscriptionId || !actualSecret || !/^[a-f0-9]{64}$/i.test(signature)) {
    return false;
  }
  const expected = crypto
    .createHmac('sha256', actualSecret)
    .update(`${paymentId}|${subscriptionId}`)
    .digest();
  const supplied = Buffer.from(signature, 'hex');
  return supplied.length === expected.length && crypto.timingSafeEqual(supplied, expected);
}

export function subscriptionsCreationEnabled(
  env: NodeJS.ProcessEnv | Record<string, string | undefined> = process.env
): boolean {
  return env.RAZORPAY_SUBSCRIPTIONS_ENABLED?.trim().toLowerCase() === 'true';
}

export function createPlanSubscriptionProvider(sdkClient?: Razorpay): PlanSubscriptionProvider {
  let razorpayInstance: Razorpay | undefined = sdkClient;

  function getSdk(): Razorpay {
    if (!razorpayInstance) {
      const config = getRazorpayConfig();
      razorpayInstance = new Razorpay({
        key_id: config.keyId,
        key_secret: config.keySecret
      });
    }
    return razorpayInstance;
  }

  return {
    async create(input) {
      const sdk = getSdk();
      const payload: Record<string, any> = {
        plan_id: input.planId,
        total_count: input.totalCount,
        customer_notify: 1,
        notes: input.notes
      };
      if (input.startAt) {
        payload.start_at = Math.floor(input.startAt.getTime() / 1000);
      }
      const response = await (sdk.subscriptions as any).create(payload);
      return mapSubscription(response);
    },

    async fetchSubscription(id: string) {
      const sdk = getSdk();
      const response = await (sdk.subscriptions as any).fetch(id);
      return mapSubscription(response);
    },

    async fetchPayment(id: string) {
      const sdk = getSdk();
      const response = await (sdk.payments as any).fetch(id);
      return mapPayment(response);
    },

    async findByAttemptId(attemptId: string) {
      const sdk = getSdk();
      const response = await (sdk.subscriptions as any).all({ count: 100 });
      const items = Array.isArray(response?.items) ? response.items : [];
      return items
        .filter((item: any) => item?.notes?.attemptId === attemptId)
        .map(mapSubscription);
    },

    async cancel(id: string, cancelAtCycleEnd: boolean) {
      const sdk = getSdk();
      const response = await (sdk.subscriptions as any).cancel(id, cancelAtCycleEnd);
      return mapSubscription(response);
    }
  };
}

export const planSubscriptionProvider = createPlanSubscriptionProvider();
