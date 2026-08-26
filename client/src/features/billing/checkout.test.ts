import { describe, expect, it, vi } from 'vitest';
import { buildRazorpayOptions, type CheckoutSession } from './checkout';

const customer = { name: 'Gaurang', email: 'owner@example.com', contact: '9557940810' };

describe('Razorpay checkout contract', () => {
  it('uses subscription_id without order_id or a restricted payment method for monthly AutoPay', () => {
    const session: CheckoutSession = {
      success: true,
      mode: 'SUBSCRIPTION',
      subscriptionId: 'sub_monthly',
      keyId: 'rzp_live_public',
      amount: 24_900,
      currency: 'INR',
      plan: 'QUIZ',
      billingCycle: 'MONTHLY',
      trialEligible: true,
      firstChargeAt: '2026-09-09T00:00:00.000Z',
      totalCount: 120,
    };

    const options = buildRazorpayOptions(session, customer, vi.fn());

    expect(options).toMatchObject({ subscription_id: 'sub_monthly', key: 'rzp_live_public' });
    expect(options).not.toHaveProperty('order_id');
    expect(options).not.toHaveProperty('method');
  });

  it('uses order_id only for a one-time checkout', () => {
    const session: CheckoutSession = {
      success: true,
      mode: 'ORDER',
      orderId: 'order_yearly',
      keyId: 'rzp_live_public',
      amount: 249_900,
      currency: 'INR',
    };

    const options = buildRazorpayOptions(session, customer, vi.fn());

    expect(options).toMatchObject({ order_id: 'order_yearly', amount: 249_900 });
    expect(options).not.toHaveProperty('subscription_id');
  });
});
