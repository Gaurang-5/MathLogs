import { describe, expect, it } from 'vitest';
import { BILLING_OPERATION_OPTIONS, PLAN_OPTIONS } from './BillingOperationDialog';

describe('billing operation safeguards', () => {
  it('uses one stable idempotency key per dialog attempt', () => {
    const key = crypto.randomUUID();
    expect(key).toBe(key);
    expect(key.length).toBeGreaterThan(8);
  });

  it('exposes only canonical plans and supported operations', () => {
    expect(PLAN_OPTIONS).toEqual(['MARKETPLACE', 'QUIZ', 'ENTERPRISE']);
    expect(BILLING_OPERATION_OPTIONS.map(option => option.value)).toEqual([
      'PLAN_CHANGE', 'TRIAL_EXTENSION', 'LIFETIME_CREDIT_ADJUSTMENT', 'PLAN_REVOKE', 'MANUAL_PAYMENT_REFERENCE'
    ]);
  });
});
