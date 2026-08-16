import test from 'node:test';
import assert from 'node:assert/strict';
import { effectiveEntitlements, includedCreditPeriod, nextBillingAnniversary, paidPlanExpiry } from '../src/domain/plans/entitlements';

test('expired Enterprise falls back to Marketplace and preserves stored credits', () => {
  const access = effectiveEntitlements({
    plan: 'ENTERPRISE',
    planExpiryDate: new Date('2026-08-01T00:00:00Z'),
    marketplaceAccessGrantedAt: new Date('2026-01-01T00:00:00Z'),
    lifetimeQuizCredits: 12
  }, new Date('2026-08-15T00:00:00Z'));

  assert.deepEqual(access, { marketplace: true, quiz: false, enterprise: false, usableQuizCredits: 0 });
});

test('active Quiz and Enterprise access includes credits and Marketplace compatibility', () => {
  const now = new Date('2026-08-15T00:00:00Z');
  assert.deepEqual(effectiveEntitlements({ plan: 'QUIZ', planExpiryDate: new Date('2026-08-15T00:00:00Z'), includedQuizCredits: 5, lifetimeQuizCredits: 2 }, now), {
    marketplace: true, quiz: true, enterprise: false, usableQuizCredits: 7
  });
  assert.deepEqual(effectiveEntitlements({ plan: 'ENTERPRISE', trialEndsAt: new Date('2026-08-16T00:00:00Z'), includedQuizCredits: 4, lifetimeQuizCredits: 3 }, now), {
    marketplace: true, quiz: true, enterprise: true, usableQuizCredits: 7
  });
  assert.deepEqual(effectiveEntitlements({ plan: 'MARKETPLACE', marketplaceAccessGrantedAt: new Date('2026-01-01T00:00:00Z') }, now), {
    marketplace: true, quiz: false, enterprise: false, usableQuizCredits: 0
  });
});

test('Marketplace compatibility requires a Marketplace grant and trial end equality remains active', () => {
  const now = new Date('2026-08-15T00:00:00Z');
  assert.equal(effectiveEntitlements({ plan: 'MARKETPLACE' }, now).marketplace, false);
  assert.equal(effectiveEntitlements({ plan: 'QUIZ', trialEndsAt: now }, now).quiz, true);
});

test('yearly plans refresh monthly and clamp a 31st anniversary in UTC', () => {
  assert.equal(nextBillingAnniversary(new Date('2026-01-31T00:00:00Z'), new Date('2026-02-01T00:00:00Z')).toISOString(), '2026-02-28T00:00:00.000Z');
  assert.equal(nextBillingAnniversary(new Date('2024-01-31T12:34:56Z'), new Date('2024-02-01T00:00:00Z')).toISOString(), '2024-02-29T12:34:56.000Z');
});

test('paid monthly and yearly expiries clamp end-of-month dates in UTC', () => {
  assert.equal(paidPlanExpiry(new Date('2026-01-31T12:00:00Z'), 'MONTHLY').toISOString(), '2026-02-28T12:00:00.000Z');
  assert.equal(paidPlanExpiry(new Date('2024-02-29T12:00:00Z'), 'YEARLY').toISOString(), '2025-02-28T12:00:00.000Z');
});

test('included credits end and renew at the next monthly anniversary from the preserved start', () => {
  assert.deepEqual(includedCreditPeriod({ plan: 'ENTERPRISE', planStartDate: new Date('2026-01-31T00:00:00Z') }, new Date('2026-02-01T00:00:00Z')), {
    includedQuizCreditsExpireAt: new Date('2026-02-28T00:00:00Z'),
    quizCreditsRenewAt: new Date('2026-02-28T00:00:00Z')
  });
});
