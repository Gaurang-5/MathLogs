import test from 'node:test';
import assert from 'node:assert/strict';
import { PLAN_CATALOG, normalizePlanId, publicPlanCatalogue, resolvePlanPrice } from '../src/domain/plans/planCatalog';

test('publishes exactly the three approved plans and prices', () => {
  const plans = publicPlanCatalogue();
  assert.deepEqual(plans.map(plan => plan.id), ['MARKETPLACE', 'QUIZ', 'ENTERPRISE']);
  assert.deepEqual(plans.map(plan => [plan.monthlyPricePaise, plan.yearlyPricePaise, plan.oneTimePricePaise]), [
    [null, null, 9_900],
    [24_900, 249_900, null],
    [49_900, 499_900, null]
  ]);
  assert.equal(plans[0].promotionalPricePaise, 0);
  assert.equal(plans[1].trialDays, 14);
  assert.equal(plans[2].includedQuizCredits, 5);
  assert.ok(plans.every(plan => plan.unlimitedStudents));
});

test('normalizes known legacy aliases and rejects unknown plans', () => {
  assert.equal(normalizePlanId('listing'), 'MARKETPLACE');
  assert.equal(normalizePlanId('QUIZ_ONLY'), 'QUIZ');
  assert.equal(normalizePlanId('PRO'), 'ENTERPRISE');
  assert.equal(normalizePlanId('BASIC'), 'ENTERPRISE');
  assert.throws(() => normalizePlanId('gold'), /INVALID_PLAN/);
  assert.equal(resolvePlanPrice('QUIZ', 'YEARLY'), 249_900);
});

test('keeps the authoritative catalogue deeply immutable and public results isolated', () => {
  assert.ok(Object.isFrozen(PLAN_CATALOG));
  assert.ok(PLAN_CATALOG.every(plan => Object.isFrozen(plan) && Object.isFrozen(plan.features)));

  const publicPlans = publicPlanCatalogue();
  const publicFeatures = publicPlans[0].features as string[];
  publicFeatures.push('local change');
  assert.equal(PLAN_CATALOG[0].features.includes('local change'), false);
});

test('resolves every valid price cycle and rejects incompatible or invalid cycles', () => {
  assert.equal(resolvePlanPrice('MARKETPLACE', 'ONE_TIME'), 9_900);
  assert.equal(resolvePlanPrice('QUIZ', 'MONTHLY'), 24_900);
  assert.equal(resolvePlanPrice('QUIZ', 'YEARLY'), 249_900);
  assert.equal(resolvePlanPrice('ENTERPRISE', 'MONTHLY'), 49_900);
  assert.equal(resolvePlanPrice('ENTERPRISE', 'YEARLY'), 499_900);

  assert.throws(() => resolvePlanPrice('MARKETPLACE', 'MONTHLY'), /INVALID_PLAN_CYCLE/);
  assert.throws(() => resolvePlanPrice('MARKETPLACE', 'YEARLY'), /INVALID_PLAN_CYCLE/);
  assert.throws(() => resolvePlanPrice('QUIZ', 'ONE_TIME'), /INVALID_PLAN_CYCLE/);
  assert.throws(() => resolvePlanPrice('ENTERPRISE', 'ONE_TIME'), /INVALID_PLAN_CYCLE/);
  assert.throws(() => resolvePlanPrice('QUIZ', 'WEEKLY'), /INVALID_BILLING_CYCLE/);
});
