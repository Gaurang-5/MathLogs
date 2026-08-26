import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { getPublicPlanCatalogue } from '../src/controllers/planCatalogController';
import { resolveCheckoutProduct, verifyRazorpaySignature } from '../src/controllers/billingController';
import { sanitizeBillingWebhook, verifyBillingWebhookSignature } from '../src/controllers/billingWebhookController';
import { verifyOnboardingPaymentSignature } from '../src/services/onboardingPaymentService';
import { getRazorpayConfig } from '../src/utils/env';

test('public plan catalogue exposes only the approved products and authoritative paise prices', async () => {
  let body: unknown;
  const response = { json(value: unknown) { body = value; return this; } };
  await getPublicPlanCatalogue({} as never, response as never);

  assert.equal((body as { success: boolean }).success, true);
  assert.deepEqual((body as { data: Array<Record<string, unknown>> }).data.map(plan => ({
    id: plan.id,
    oneTimePricePaise: plan.oneTimePricePaise,
    promotionalPricePaise: plan.promotionalPricePaise,
    monthlyPricePaise: plan.monthlyPricePaise,
    yearlyPricePaise: plan.yearlyPricePaise
  })), [
      { id: 'MARKETPLACE', oneTimePricePaise: 9_900, promotionalPricePaise: 0, monthlyPricePaise: null, yearlyPricePaise: null },
      { id: 'QUIZ', oneTimePricePaise: null, promotionalPricePaise: null, monthlyPricePaise: 24_900, yearlyPricePaise: 249_900 },
      { id: 'ENTERPRISE', oneTimePricePaise: null, promotionalPricePaise: null, monthlyPricePaise: 49_900, yearlyPricePaise: 499_900 }
  ]);
});

test('billing webhook verification uses raw bytes and stores only a bounded projection', () => {
  const secret = 'webhook-test-secret';
  const raw = Buffer.from(JSON.stringify({
    id: 'evt_1', event: 'payment.failed',
    payload: { payment: { entity: { id: 'pay_1', order_id: 'order_1', amount: 24_900, currency: 'INR', email: 'private@example.com', contact: '9999999999' } } }
  }));
  const signature = crypto.createHmac('sha256', secret).update(raw).digest('hex');
  assert.equal(verifyBillingWebhookSignature(raw, signature, secret), true);
  assert.equal(verifyBillingWebhookSignature(Buffer.from('{}'), signature, secret), false);
  assert.deepEqual(sanitizeBillingWebhook(JSON.parse(raw.toString())), {
    providerEventId: 'evt_1', eventType: 'payment.failed', paymentId: 'pay_1', orderId: 'order_1', subscriptionId: null,
    providerPlanId: null, providerStatus: null, currentStart: null, currentEnd: null, chargeAt: null, occurredAt: null,
    amount: 24_900, currency: 'INR'
  });
});

test('payment verification accepts only the signature over the stored provider binding', () => {
  const secret = 'billing-test-secret';
  const signature = crypto.createHmac('sha256', secret).update('order_1|payment_1').digest('hex');
  assert.equal(verifyRazorpaySignature('order_1', 'payment_1', signature, secret), true);
  assert.equal(verifyRazorpaySignature('order_other', 'payment_1', signature, secret), false);
  assert.equal(verifyRazorpaySignature('order_1', 'payment_1', 'not-hex', secret), false);
});

test('public onboarding verification also binds the payment to the server-created order', () => {
  const signature = crypto.createHmac('sha256', getRazorpayConfig().keySecret).update('order_onboarding|payment_onboarding').digest('hex');
  assert.equal(verifyOnboardingPaymentSignature('order_onboarding', 'payment_onboarding', signature), true);
  assert.equal(verifyOnboardingPaymentSignature('order_other', 'payment_onboarding', signature), false);
  assert.equal(verifyOnboardingPaymentSignature('order_onboarding', 'payment_onboarding', 'invalid'), false);
});

test('checkout accepts only canonical plan/cycle pairs and fixed lifetime credit packs', () => {
  assert.deepEqual(resolveCheckoutProduct('QUIZ', 'MONTHLY'), {
    kind: 'PLAN', plan: 'QUIZ', billingCycle: 'MONTHLY', amountPaise: 24_900
  });
  assert.deepEqual(resolveCheckoutProduct('ENTERPRISE', 'YEARLY'), {
    kind: 'PLAN', plan: 'ENTERPRISE', billingCycle: 'YEARLY', amountPaise: 499_900
  });
  assert.deepEqual(resolveCheckoutProduct('MARKETPLACE', 'ONE_TIME'), {
    kind: 'PLAN', plan: 'MARKETPLACE', billingCycle: 'ONE_TIME', amountPaise: 0
  });
  assert.deepEqual(resolveCheckoutProduct('quiz_credits_25', undefined), {
    kind: 'CREDIT_PACK', creditPackId: 'quiz_credits_25', credits: 25, amountPaise: 100_000
  });
  assert.throws(() => resolveCheckoutProduct('gold', 'MONTHLY'), /INVALID_PLAN/);
  assert.throws(() => resolveCheckoutProduct('QUIZ', 'ONE_TIME'), /INVALID_PLAN_CYCLE/);
  assert.throws(() => resolveCheckoutProduct('quiz_credits_12', undefined), /INVALID_CREDIT_PACK/);
});
