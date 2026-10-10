import { describe, expect, it } from 'vitest';
import { ONBOARDING_STEPS, buildInitialOnboarding } from './OnboardingWizard';

describe('superadmin canonical onboarding', () => {
  it('uses five steps and canonical subscription fields', () => {
    expect(ONBOARDING_STEPS).toEqual(['Owner', 'Institute', 'Subscription', 'Marketplace', 'Review']);
    expect(buildInitialOnboarding().subscription).toEqual({ plan: 'ENTERPRISE', billingCycle: 'MONTHLY', startTrial: true });
    expect(buildInitialOnboarding().institute.city).toBe('Muzaffarnagar');
    expect(buildInitialOnboarding()).not.toHaveProperty('access');
    expect(buildInitialOnboarding()).not.toHaveProperty('limits');
  });
});
