import test from 'node:test';
import assert from 'node:assert/strict';
import { previewInstituteOnboarding } from '../src/services/superAdminInstituteService';

const base = {
  owner: { name: 'Gita Sharma', phone: '+91 9876543210', email: 'gita@example.com' },
  institute: { name: 'Guided Academy', city: 'Muaffarnagar' },
  marketplace: { isPubliclyListed: true, isVerified: false }
};

test('Superadmin onboarding accepts canonical unlimited plans and derives trial state', () => {
  const result = previewInstituteOnboarding({
    ...base,
    subscription: { plan: 'ENTERPRISE', billingCycle: 'MONTHLY', startTrial: true }
  });
  assert.equal(result.valid, true);
  assert.equal((result.summary as any).subscription.plan, 'ENTERPRISE');
  assert.equal((result.summary as any).unlimitedStudents, true);
  assert.equal((result.summary as any).institute.city, 'Muzaffarnagar');
  assert.equal('limits' in (result.normalized as any), false);
});

test('Superadmin onboarding rejects legacy/custom plans and invalid cycle combinations', () => {
  assert.equal(previewInstituteOnboarding({ ...base, subscription: { plan: 'BASIC', billingCycle: 'MONTHLY', startTrial: false } }).valid, false);
  assert.equal(previewInstituteOnboarding({ ...base, subscription: { plan: 'CUSTOM', billingCycle: 'MONTHLY', startTrial: false } }).valid, false);
  assert.equal(previewInstituteOnboarding({ ...base, subscription: { plan: 'MARKETPLACE', billingCycle: 'MONTHLY', startTrial: true } }).valid, false);
  assert.equal(previewInstituteOnboarding({ ...base, subscription: { plan: 'QUIZ', billingCycle: 'ONE_TIME', startTrial: false } }).valid, false);
});
