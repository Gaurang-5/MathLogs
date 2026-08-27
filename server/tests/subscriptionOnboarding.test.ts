import test, { afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { createOrder } from '../src/controllers/onboardingController';
import { createAdminOnboardingOrder, verifyAdminOnboardingPayment } from '../src/controllers/adminOnboardingController';
import { prisma } from '../src/prisma';
import { planSubscriptionCheckoutService } from '../src/services/planSubscriptionCheckoutService';
import { provisionInstitute } from '../src/services/accountProvisioningService';

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

const session = {
  mode: 'SUBSCRIPTION' as const,
  attemptId: 'attempt-1',
  subscriptionId: 'sub_1',
  keyId: 'rzp_live_public',
  plan: 'QUIZ' as const,
  billingCycle: 'MONTHLY' as const,
  amount: 24_900,
  currency: 'INR' as const,
  trialEligible: true,
  firstChargeAt: new Date('2026-09-09T00:00:00.000Z'),
  totalCount: 120 as const,
};

const expectedCheckout = {
  success: true,
  mode: 'SUBSCRIPTION',
  subscriptionId: 'sub_1',
  keyId: 'rzp_live_public',
  plan: 'QUIZ',
  billingCycle: 'MONTHLY',
  amount: 24_900,
  currency: 'INR',
  trialEligible: true,
  firstChargeAt: '2026-09-09T00:00:00.000Z',
  totalCount: 120,
};

test('public monthly onboarding returns the flat shared subscription checkout contract', async () => {
  replace(prisma.admin, 'findUnique', (async () => null) as typeof prisma.admin.findUnique);
  replace(planSubscriptionCheckoutService, 'createMonthlySubscriptionCheckout', (async () => session) as typeof planSubscriptionCheckoutService.createMonthlySubscriptionCheckout);
  const res = response();

  await createOrder({ body: {
    tuitionName: 'Test Institute', ownerName: 'Teacher', phone: '9557940807', email: 'test@example.com',
    planId: 'QUIZ', billingCycle: 'MONTHLY',
  } } as never, res as never);

  assert.deepEqual(res.body, expectedCheckout);
});

test('invite monthly onboarding returns the flat shared subscription checkout contract', async () => {
  replace(prisma.adminOnboardingLink, 'findUnique', (async () => ({
    id: 'link-1', token: 'token-1', status: 'PENDING', expiresAt: new Date('2026-10-01T00:00:00.000Z'),
    plan: 'QUIZ', billingCycle: 'monthly', isFreeTrial: false, trialDays: 14,
  })) as typeof prisma.adminOnboardingLink.findUnique);
  replace(prisma.admin, 'findUnique', (async () => null) as typeof prisma.admin.findUnique);
  replace(planSubscriptionCheckoutService, 'createMonthlySubscriptionCheckout', (async () => session) as typeof planSubscriptionCheckoutService.createMonthlySubscriptionCheckout);
  const res = response();

  await createAdminOnboardingOrder({ body: {
    token: 'token-1', billingCycle: 'monthly', instituteName: 'Test Institute', teacherName: 'Teacher',
    phoneNumber: '9557940807', email: 'test@example.com',
  } } as never, res as never);

  assert.deepEqual(res.body, expectedCheckout);
});

test('invite subscription verification replay returns the original unused setup link after the link is marked used', async () => {
  replace(prisma.adminOnboardingLink, 'findUnique', (async () => ({
    id: 'link-1', token: 'token-1', status: 'USED', instituteId: 'inst-1',
    expiresAt: new Date('2026-10-01T00:00:00.000Z'), plan: 'QUIZ', billingCycle: 'monthly',
  })) as typeof prisma.adminOnboardingLink.findUnique);
  replace(planSubscriptionCheckoutService, 'verifyMonthlySubscriptionCheckout', (async () => ({
    id: 'attempt-1', onboardingLinkId: 'link-1', instituteId: 'inst-1'
  } as never)) as typeof planSubscriptionCheckoutService.verifyMonthlySubscriptionCheckout);
  const lifecycle = await import('../src/services/planSubscriptionLifecycleService');
  replace(lifecycle.planSubscriptionLifecycleService, 'applySubscriptionEvent', (async () => undefined) as typeof lifecycle.planSubscriptionLifecycleService.applySubscriptionEvent);
  replace(prisma.planSubscription, 'findUniqueOrThrow', (async () => ({
    instituteId: 'inst-1', onboardingLinkId: 'link-1', provisioningData: { phone: '', email: '' }
  })) as typeof prisma.planSubscription.findUniqueOrThrow);
  replace(prisma.inviteToken, 'findFirst', (async () => ({ token: 'setup-token' })) as typeof prisma.inviteToken.findFirst);
  const res = response();

  await verifyAdminOnboardingPayment({
    body: { token: 'token-1', razorpay_subscription_id: 'sub_1', razorpay_payment_id: 'pay_1', razorpay_signature: 'sig' },
    protocol: 'https', get: () => 'mathlogs.app',
  } as never, res as never);

  assert.equal(res.statusCode, 200);
  assert.equal((res.body as { setupLink: string }).setupLink, 'https://mathlogs.app/setup?token=setup-token');
});

test('newly provisioned institutes remain private until setup and normalize a supplied city', async () => {
  const suffix = `${Date.now()}-${Math.random()}`;
  let instituteId = '';
  try {
    const result = await prisma.$transaction((tx) => provisionInstitute(tx, {
      kind: 'PUBLIC',
      instituteName: `Private Before Setup ${suffix}`,
      ownerName: 'Teacher',
      phone: `94${String(Date.now()).slice(-8)}`,
      email: `private-${suffix}@example.com`,
      marketplace: { listed: true, city: 'Muaffarnagar' }
    }, { kind: 'MARKETPLACE', startsAt: new Date() }));
    instituteId = result.instituteId;
    const institute = await prisma.institute.findUniqueOrThrow({ where: { id: instituteId } });
    assert.equal(institute.isPubliclyListed, false);
    assert.equal(institute.city, 'Muzaffarnagar');
  } finally {
    if (instituteId) {
      await prisma.inviteToken.deleteMany({ where: { instituteId } });
      await prisma.institute.delete({ where: { id: instituteId } });
    }
  }
});
