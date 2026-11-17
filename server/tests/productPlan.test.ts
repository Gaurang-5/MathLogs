import assert from 'node:assert/strict';
import test from 'node:test';
import { productPlanAccess, resolveProductPlan } from '../src/domain/plans/productPlan';

const now = new Date('2026-11-18T00:00:00.000Z');

test('Basic includes the offline-capable core workspace but no credit features', () => {
  assert.deepEqual(productPlanAccess({ plan: 'BASIC' }, now), {
    plan: 'BASIC',
    capabilities: {
      coreWorkspace: true,
      offlineReads: true,
      offlineWrites: true,
      aiQuizGeneration: false,
      onlineQuizDelivery: false,
      quizCreditTopUps: false,
    },
  });
});

test('Pro adds AI quiz, online delivery, and credit top-ups to every Basic capability', () => {
  assert.deepEqual(productPlanAccess({ plan: 'PRO' }, now), {
    plan: 'PRO',
    capabilities: {
      coreWorkspace: true,
      offlineReads: true,
      offlineWrites: true,
      aiQuizGeneration: true,
      onlineQuizDelivery: true,
      quizCreditTopUps: true,
    },
  });
});

test('legacy Quiz and Enterprise subscriptions resolve to Pro without changing stored records', () => {
  assert.equal(resolveProductPlan({ plan: 'QUIZ', planExpiryDate: new Date('2026-12-01T00:00:00.000Z') }, now), 'PRO');
  assert.equal(resolveProductPlan({ plan: 'ENTERPRISE', trialEndsAt: new Date('2026-11-18T00:00:00.000Z') }, now), 'PRO');
});

test('expired Pro-compatible plans fall back to Basic and unknown legacy plans stay Basic', () => {
  assert.equal(resolveProductPlan({ plan: 'PRO', planExpiryDate: new Date('2026-11-17T23:59:59.999Z') }, now), 'BASIC');
  assert.equal(resolveProductPlan({ plan: 'MARKETPLACE' }, now), 'BASIC');
  assert.equal(resolveProductPlan({ plan: 'FREE' }, now), 'BASIC');
  assert.equal(resolveProductPlan({ plan: 'unexpected' }, now), 'BASIC');
});
