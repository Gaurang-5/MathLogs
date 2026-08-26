import type { CanonicalPlan } from '../plans/types';

export type ActivatedCheckoutSession = {
  success: true;
  mode: 'ACTIVATED';
  plan: 'MARKETPLACE';
};

export type OrderCheckoutSession = {
  success: true;
  mode: 'ORDER';
  orderId: string;
  keyId: string;
  amount: number;
  currency: 'INR';
  billingPaymentId?: string;
};

export type SubscriptionCheckoutSession = {
  success: true;
  mode: 'SUBSCRIPTION';
  subscriptionId: string;
  keyId: string;
  amount: number;
  currency: 'INR';
  plan: Exclude<CanonicalPlan, 'MARKETPLACE'>;
  billingCycle: 'MONTHLY';
  trialEligible: boolean;
  firstChargeAt: string;
  totalCount: 120;
};

export type CheckoutSession = ActivatedCheckoutSession | OrderCheckoutSession | SubscriptionCheckoutSession;

export type RazorpayCheckoutResult = {
  razorpay_order_id?: string;
  razorpay_payment_id?: string;
  razorpay_subscription_id?: string;
  razorpay_signature?: string;
};

export type CheckoutCustomer = { name?: string; email?: string; contact?: string };

export function buildRazorpayOptions(
  session: Exclude<CheckoutSession, ActivatedCheckoutSession>,
  customer: CheckoutCustomer,
  handler: (result: RazorpayCheckoutResult) => void,
): Record<string, unknown> {
  const shared = {
    key: session.keyId,
    amount: session.amount,
    currency: session.currency,
    name: 'MathLogs',
    prefill: customer,
    theme: { color: '#111111' },
    handler,
  };
  return session.mode === 'SUBSCRIPTION'
    ? { ...shared, subscription_id: session.subscriptionId }
    : { ...shared, order_id: session.orderId };
}

export function checkoutSuccessMessage(session: CheckoutSession): string {
  if (session.mode === 'ACTIVATED') return 'Marketplace access activated.';
  if (session.mode === 'ORDER') return 'Payment verified. Your plan is active.';
  return session.trialEligible
    ? 'AutoPay authorized. Your 14-day trial has started.'
    : 'AutoPay authorized. Waiting for the verified first payment.';
}

export function onboardingCheckoutOptions(
  session: Exclude<CheckoutSession, ActivatedCheckoutSession>,
  customer: CheckoutCustomer,
  handler: (result: RazorpayCheckoutResult) => void,
): Record<string, unknown> {
  return buildRazorpayOptions(session, customer, handler);
}

export function onboardingSuccessMessage(session: CheckoutSession): string {
  return checkoutSuccessMessage(session);
}
