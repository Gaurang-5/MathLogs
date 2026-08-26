import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import {
  getMonthlySubscriptionProduct,
  verifySubscriptionCheckoutSignature,
  subscriptionsCreationEnabled,
  createPlanSubscriptionProvider,
  type PlanSubscriptionProvider
} from '../src/services/planSubscriptionProvider';

test('maps only approved monthly plans and fails closed', () => {
  const env = {
    RAZORPAY_PLAN_QUIZ_MONTHLY: 'plan_quiz',
    RAZORPAY_PLAN_ENTERPRISE_MONTHLY: 'plan_enterprise'
  };
  assert.deepEqual(getMonthlySubscriptionProduct('QUIZ', env), {
    plan: 'QUIZ',
    providerPlanId: 'plan_quiz',
    amountPaise: 24900,
    currency: 'INR',
    totalCount: 120
  });
  assert.deepEqual(getMonthlySubscriptionProduct('ENTERPRISE', env), {
    plan: 'ENTERPRISE',
    providerPlanId: 'plan_enterprise',
    amountPaise: 49900,
    currency: 'INR',
    totalCount: 120
  });
  assert.throws(() => getMonthlySubscriptionProduct('MARKETPLACE', env), /INVALID_SUBSCRIPTION_PLAN/);
  assert.throws(() => getMonthlySubscriptionProduct('UNKNOWN', env), /INVALID_SUBSCRIPTION_PLAN/);
  assert.throws(() => getMonthlySubscriptionProduct('QUIZ', {}), /SUBSCRIPTION_PLAN_NOT_CONFIGURED/);
  assert.throws(() => getMonthlySubscriptionProduct('ENTERPRISE', {}), /SUBSCRIPTION_PLAN_NOT_CONFIGURED/);
});

test('verifies payment_id pipe subscription_id in documented order', () => {
  const signature = crypto.createHmac('sha256', 'secret').update('pay_1|sub_1').digest('hex');
  assert.equal(verifySubscriptionCheckoutSignature('pay_1', 'sub_1', signature, 'secret'), true);
  assert.equal(verifySubscriptionCheckoutSignature('pay_1', 'sub_2', signature, 'secret'), false);
  assert.equal(verifySubscriptionCheckoutSignature('pay_2', 'sub_1', signature, 'secret'), false);
  assert.equal(verifySubscriptionCheckoutSignature('pay_1', 'sub_1', 'invalid', 'secret'), false);
});

test('subscriptionsCreationEnabled evaluates normalized boolean', () => {
  assert.equal(subscriptionsCreationEnabled({ RAZORPAY_SUBSCRIPTIONS_ENABLED: 'true' }), true);
  assert.equal(subscriptionsCreationEnabled({ RAZORPAY_SUBSCRIPTIONS_ENABLED: ' TRUE ' }), true);
  assert.equal(subscriptionsCreationEnabled({ RAZORPAY_SUBSCRIPTIONS_ENABLED: 'false' }), false);
  assert.equal(subscriptionsCreationEnabled({ RAZORPAY_SUBSCRIPTIONS_ENABLED: '' }), false);
  assert.equal(subscriptionsCreationEnabled({}), false);
});

test('provider adapter calls SDK methods and parses timestamps from seconds', async () => {
  const mockSdk = {
    subscriptions: {
      create: async (payload: any) => ({
        id: 'sub_test',
        plan_id: payload.plan_id,
        status: 'created',
        total_count: payload.total_count,
        created_at: 1723900000,
        start_at: payload.start_at,
        notes: payload.notes
      }),
      fetch: async (id: string) => ({
        id,
        plan_id: 'plan_quiz',
        status: 'authenticated',
        created_at: 1723900000,
        charge_at: 1725109600,
        current_start: 1723900000,
        current_end: 1725109600,
        notes: { attemptId: 'att_1' }
      }),
      all: async (params: any) => ({
        items: [
          { id: 'sub_1', plan_id: 'plan_quiz', status: 'created', notes: { attemptId: 'att_1' } },
          { id: 'sub_2', plan_id: 'plan_quiz', status: 'created', notes: { attemptId: 'att_2' } }
        ]
      }),
      cancel: async (id: string, cancelAtCycleEnd: boolean) => ({
        id,
        status: 'cancelled',
        ended_at: 1725109600
      })
    },
    payments: {
      fetch: async (id: string) => ({
        id,
        subscription_id: 'sub_test',
        amount: 24900,
        currency: 'INR',
        status: 'captured',
        created_at: 1723900000
      })
    }
  };

  const provider = createPlanSubscriptionProvider(mockSdk as any);
  const created = await provider.create({
    planId: 'plan_quiz',
    totalCount: 120,
    customerNotify: true,
    startAt: new Date(1725109600000),
    notes: { attemptId: 'att_1' }
  });
  assert.equal(created.id, 'sub_test');
  assert.equal(created.createdAt?.getTime(), 1723900000000);
  assert.equal(created.startAt?.getTime(), 1725109600000);

  const fetched = await provider.fetchSubscription('sub_test');
  assert.equal(fetched.status, 'authenticated');
  assert.equal(fetched.chargeAt?.getTime(), 1725109600000);

  const matched = await provider.findByAttemptId('att_1');
  assert.equal(matched.length, 1);
  assert.equal(matched[0].id, 'sub_1');

  const cancelled = await provider.cancel('sub_test', true);
  assert.equal(cancelled.status, 'cancelled');

  const payment = await provider.fetchPayment('pay_1');
  assert.equal(payment.id, 'pay_1');
  assert.equal(payment.subscriptionId, 'sub_test');
  assert.equal(payment.amountPaise, 24900);
});
