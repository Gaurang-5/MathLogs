import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizePlanId, publicPlanCatalogue, resolvePlanPrice } from '../src/domain/plans/planCatalog';

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
