import test, { afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { billingControllerDependencies, createBillingSession, cancelSubscription, getBillingSubscription } from '../src/controllers/billingController';
import { prisma } from '../src/prisma';
import { planSubscriptionCheckoutService } from '../src/services/planSubscriptionCheckoutService';
import { planSubscriptionLifecycleService } from '../src/services/planSubscriptionLifecycleService';

const restores: Array<() => void> = [];
function replace<T extends object, K extends keyof T>(target: T, key: K, value: T[K]) {
  const original = target[key];
  target[key] = value;
  restores.push(() => { target[key] = original; });
}
afterEach(() => { while (restores.length) restores.pop()?.(); });

function response() {
  return {
    statusCode: 200,
    body: undefined as unknown,
    status(code: number) { this.statusCode = code; return this; },
    json(body: unknown) { this.body = body; return this; },
  };
}

const adminWithInstitute = {
  id: 'admin-1',
  institute: { id: 'inst-1', phoneNumber: '9557940810', email: 'owner@example.com', razorpaySubscriptionId: 'sub_1' },
};

test('monthly billing returns one flat tagged subscription checkout contract', async () => {
  replace(prisma.admin, 'findUnique', (async () => adminWithInstitute) as typeof prisma.admin.findUnique);
  replace(planSubscriptionCheckoutService, 'createMonthlySubscriptionCheckout', (async () => ({
    mode: 'SUBSCRIPTION', attemptId: 'attempt-1', subscriptionId: 'sub_1', keyId: 'rzp_live_public',
    plan: 'QUIZ', billingCycle: 'MONTHLY', amount: 24_900, currency: 'INR', trialEligible: true,
    firstChargeAt: new Date('2026-09-09T00:00:00.000Z'), totalCount: 120,
  })) as typeof planSubscriptionCheckoutService.createMonthlySubscriptionCheckout);
  const res = response();

  await createBillingSession({ user: { id: 'admin-1' }, body: { planId: 'QUIZ', billingCycle: 'MONTHLY' } } as never, res as never);

  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.body, {
    success: true, mode: 'SUBSCRIPTION', subscriptionId: 'sub_1', keyId: 'rzp_live_public', plan: 'QUIZ',
    billingCycle: 'MONTHLY', amount: 24_900, currency: 'INR', trialEligible: true,
    firstChargeAt: '2026-09-09T00:00:00.000Z', totalCount: 120,
  });
});

test('Marketplace billing returns the same flat tagged checkout contract', async () => {
  replace(prisma.admin, 'findUnique', (async () => adminWithInstitute) as typeof prisma.admin.findUnique);
  replace(prisma.institute, 'update', (async () => ({} as never)) as typeof prisma.institute.update);
  replace(billingControllerDependencies, 'activateMarketplace', (async () => ({ effectivePlan: 'MARKETPLACE' })) as typeof billingControllerDependencies.activateMarketplace);
  const res = response();

  await createBillingSession({ user: { id: 'admin-1' }, body: { planId: 'MARKETPLACE', billingCycle: 'ONE_TIME' } } as never, res as never);

  assert.deepEqual(res.body, {
    success: true,
    mode: 'ACTIVATED',
    plan: 'MARKETPLACE',
  });
});

test('cancelling AutoPay preserves the provider binding and returns its effective access boundary', async () => {
  replace(prisma.admin, 'findUnique', (async () => adminWithInstitute) as typeof prisma.admin.findUnique);
  replace(planSubscriptionLifecycleService, 'cancelSubscriptionForInstitute', (async () => ({
    cancelled: true, cancelAtPeriodEnd: true, effectiveUntil: new Date('2026-09-30T00:00:00.000Z'),
  })) as typeof planSubscriptionLifecycleService.cancelSubscriptionForInstitute);
  let instituteUpdateCalled = false;
  replace(prisma.institute, 'update', (async () => { instituteUpdateCalled = true; return {} as never; }) as typeof prisma.institute.update);
  const res = response();

  await cancelSubscription({ user: { id: 'admin-1' } } as never, res as never);

  assert.equal(instituteUpdateCalled, false);
  assert.deepEqual(res.body, {
    success: true, cancelled: true, cancelAtPeriodEnd: true, effectiveAt: '2026-09-30T00:00:00.000Z',
  });
});

test('subscription status exposes local lifecycle state without provider secrets', async () => {
  replace(prisma.admin, 'findUnique', (async () => adminWithInstitute) as typeof prisma.admin.findUnique);
  replace(prisma.planSubscription, 'findFirst', (async () => ({
    status: 'PENDING', plan: 'ENTERPRISE', amountPaise: 49_900, nextChargeAt: null,
    currentPeriodEnd: new Date('2026-09-01T00:00:00.000Z'), graceEndsAt: new Date('2026-09-04T00:00:00.000Z'),
    cancelAtPeriodEnd: false, cancelEffectiveAt: null,
  })) as typeof prisma.planSubscription.findFirst);
  const res = response();

  await getBillingSubscription({ user: { id: 'admin-1' } } as never, res as never);

  assert.deepEqual(res.body, {
    subscription: {
      status: 'PENDING', plan: 'ENTERPRISE', amountPaise: 49_900, nextChargeAt: null,
      currentPeriodEnd: '2026-09-01T00:00:00.000Z', graceEndsAt: '2026-09-04T00:00:00.000Z',
      cancelAtPeriodEnd: false, cancelEffectiveAt: null,
    },
  });
  assert.equal(JSON.stringify(res.body).includes('providerPlanId'), false);
});
