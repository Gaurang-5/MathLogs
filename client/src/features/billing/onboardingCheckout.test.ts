import { describe, expect, it, vi } from 'vitest';
import { onboardingCheckoutOptions, onboardingSuccessMessage, type CheckoutSession } from './checkout';

describe('onboarding checkout contract', () => {
  it('builds monthly onboarding with subscription_id and annual onboarding with order_id', () => {
    const monthly: CheckoutSession = {
      success: true, mode: 'SUBSCRIPTION', subscriptionId: 'sub_monthly', keyId: 'rzp_key', amount: 24_900,
      currency: 'INR', plan: 'QUIZ', billingCycle: 'MONTHLY', trialEligible: true,
      firstChargeAt: '2026-09-09T00:00:00.000Z', totalCount: 120,
    };
    const annual: CheckoutSession = {
      success: true, mode: 'ORDER', orderId: 'order_yearly', keyId: 'rzp_key', amount: 249_900, currency: 'INR',
    };

    expect(onboardingCheckoutOptions(monthly, {}, vi.fn())).toMatchObject({ subscription_id: 'sub_monthly' });
    expect(onboardingCheckoutOptions(annual, {}, vi.fn())).toMatchObject({ order_id: 'order_yearly' });
  });

  it('labels mandate authorization separately from a successful plan payment', () => {
    const eligible: CheckoutSession = {
      success: true, mode: 'SUBSCRIPTION', subscriptionId: 'sub_trial', keyId: 'rzp_key', amount: 24_900,
      currency: 'INR', plan: 'QUIZ', billingCycle: 'MONTHLY', trialEligible: true,
      firstChargeAt: '2026-09-09T00:00:00.000Z', totalCount: 120,
    };
    const immediate = { ...eligible, subscriptionId: 'sub_immediate', trialEligible: false } satisfies CheckoutSession;

    expect(onboardingSuccessMessage(eligible)).toBe('AutoPay authorized. Your 14-day trial has started.');
    expect(onboardingSuccessMessage(immediate)).toBe('AutoPay authorized. Waiting for the verified first payment.');
  });
});
