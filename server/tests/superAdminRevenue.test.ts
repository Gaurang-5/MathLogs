import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { createApp } from '../src/index';
import { prisma } from '../src/prisma';
import { processDueSuperAdminBillingOperations } from '../src/workers/superAdminBillingWorker';

let server: Server;
let baseUrl: string;
let token: string;
let adminId: string;
let instituteId: string;

before(async () => {
  const suffix = `${Date.now()}-${Math.random()}`;
  const institute = await prisma.institute.create({
    data: {
      name: `Revenue Academy ${suffix}`,
      plan: 'ENTERPRISE',
      billingCycle: 'MONTHLY',
      planStartDate: new Date(),
      planExpiryDate: new Date(Date.now() + 30 * 86_400_000),
      quizCredits: 20,
      includedQuizCredits: 5,
      lifetimeQuizCredits: 15
    }
  });
  instituteId = institute.id;
  const subscription = await prisma.planSubscription.create({ data: {
    instituteId: institute.id, ownerIdentityHash: `history-${suffix}`,
    providerSubscriptionId: `sub_history_${Date.now()}`, providerPlanId: 'plan_enterprise_history',
    plan: 'ENTERPRISE', billingCycle: 'MONTHLY', amountPaise: 49_900, currency: 'INR', totalCount: 120,
    trialEligible: false, intendedStartAt: new Date(), status: 'PENDING',
    nextChargeAt: new Date(Date.now() + 86_400_000), currentPeriodEnd: institute.planExpiryDate,
    graceEndsAt: new Date(Date.now() + 3 * 86_400_000)
  } });
  await prisma.planSubscriptionCharge.create({ data: {
    planSubscriptionId: subscription.id, providerPaymentId: `pay_history_${Date.now()}`,
    amountPaise: 49_900, currency: 'INR', periodStart: new Date(), periodEnd: institute.planExpiryDate!, creditedAt: new Date()
  } });
  const admin = await prisma.admin.create({
    data: { username: `revenue-super-${suffix}`, password: await bcrypt.hash('test', 4), role: 'SUPER_ADMIN' }
  });
  adminId = admin.id;
  token = jwt.sign({ id: admin.id, username: admin.username, role: admin.role, passwordVersion: 1 }, 'test-secret');
  const app = createApp();
  await new Promise<void>(resolve => { server = app.listen(0, resolve); });
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

after(async () => {
  await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  await prisma.$disconnect();
});

function headers(extra: Record<string, string> = {}) {
  return { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', ...extra };
}

async function verifiedChallenge(actionClass: 'PLAN_REVOKE' | 'BILLING_ADJUSTMENT') {
  return prisma.superAdminReauthChallenge.create({
    data: {
      adminId,
      actionClass,
      otpHash: 'test-hash',
      verifiedAt: new Date(),
      expiresAt: new Date(Date.now() + 5 * 60_000)
    }
  });
}

test('revenue overview and subscriptions use real plan state without manufacturing provider revenue', async () => {
  const overview = await fetch(`${baseUrl}/api/super-admin/revenue/overview`, { headers: headers() });
  assert.equal(overview.status, 200);
  const body = await overview.json() as any;
  assert.ok(body.data.metrics.activeSubscriptions >= 1);
  assert.ok(body.data.byPlan.some((item: any) => item.plan === 'ENTERPRISE'));
  assert.equal(JSON.stringify(body.data.byPlan).includes('BASIC'), false);
  assert.equal(JSON.stringify(body.data.byPlan).includes('PRO'), false);
  assert.equal('mrrPaise' in body.data.metrics, false);

  const subscriptions = await fetch(`${baseUrl}/api/super-admin/revenue/subscriptions?page=1&pageSize=25`, { headers: headers() });
  assert.equal(subscriptions.status, 200);
  const subscriptionBody = await subscriptions.json() as any;
  assert.ok(subscriptionBody.data.items.some((item: any) => item.instituteId === instituteId));
  assert.equal(JSON.stringify(subscriptionBody).includes('razorpaySubscriptionId'), false);
});

test('billing preview matches immediate lifetime-credit application and idempotent replay', async () => {
  const draft = { type: 'LIFETIME_CREDIT_ADJUSTMENT', reason: 'Approved service recovery adjustment', payload: { delta: 7 } };
  const preview = await fetch(`${baseUrl}/api/super-admin/institutes/${instituteId}/billing-operations/preview`, {
    method: 'POST', headers: headers(), body: JSON.stringify(draft)
  });
  assert.equal(preview.status, 200);
  const previewBody = await preview.json() as any;
  assert.equal(previewBody.data.before.lifetimeQuizCredits, 15);
  assert.equal(previewBody.data.after.lifetimeQuizCredits, 22);

  const denied = await fetch(`${baseUrl}/api/super-admin/institutes/${instituteId}/billing-operations`, {
    method: 'POST', headers: headers({ 'Idempotency-Key': `credits-denied-${Date.now()}` }), body: JSON.stringify(draft)
  });
  assert.equal(denied.status, 403);

  const challenge = await verifiedChallenge('BILLING_ADJUSTMENT');
  const key = `credits-${Date.now()}`;
  const applied = await fetch(`${baseUrl}/api/super-admin/institutes/${instituteId}/billing-operations`, {
    method: 'POST', headers: headers({ 'Idempotency-Key': key, 'X-Superadmin-Challenge': challenge.id }), body: JSON.stringify(draft)
  });
  assert.equal(applied.status, 200);
  const appliedBody = await applied.json() as any;
  assert.equal(appliedBody.data.status, 'APPLIED');
  assert.equal((await prisma.institute.findUniqueOrThrow({ where: { id: instituteId } })).quizCredits, 27);

  const replay = await fetch(`${baseUrl}/api/super-admin/institutes/${instituteId}/billing-operations`, {
    method: 'POST', headers: headers({ 'Idempotency-Key': key }), body: JSON.stringify(draft)
  });
  assert.equal(replay.status, 200);
  assert.equal((await replay.json() as any).replay, true);
  assert.equal((await prisma.institute.findUniqueOrThrow({ where: { id: instituteId } })).quizCredits, 27);
});

test('retired student-limit and generic credit operations are rejected', async () => {
  for (const type of ['STUDENT_LIMIT_ADJUSTMENT', 'QUIZ_CREDIT_ADJUSTMENT']) {
    const response = await fetch(`${baseUrl}/api/super-admin/institutes/${instituteId}/billing-operations/preview`, {
      method: 'POST', headers: headers(), body: JSON.stringify({ type, reason: 'This retired operation must be rejected', payload: { delta: 1, maxStudents: 10 } })
    });
    assert.equal(response.status, 400);
    assert.equal((await response.json() as any).error, 'INVALID_BILLING_OPERATION');
  }
});

test('plan revocation requires its own challenge and writes an audit entry', async () => {
  const challenge = await verifiedChallenge('PLAN_REVOKE');
  const response = await fetch(`${baseUrl}/api/super-admin/institutes/${instituteId}/billing-operations`, {
    method: 'POST',
    headers: headers({ 'Idempotency-Key': `revoke-${Date.now()}`, 'X-Superadmin-Challenge': challenge.id }),
    body: JSON.stringify({ type: 'PLAN_REVOKE', reason: 'Verified account closure requested by owner', payload: {} })
  });
  assert.equal(response.status, 200);
  const revoked = await prisma.institute.findUniqueOrThrow({ where: { id: instituteId } });
  assert.equal(revoked.plan, 'MARKETPLACE');
  assert.equal(revoked.marketplaceAccessGrantedAt instanceof Date, true);
  const audit = await prisma.superAdminAuditLog.findFirst({ where: { instituteId, action: 'BILLING_PLAN_REVOKE_APPLIED' } });
  assert.ok(audit);
});

test('future plan changes remain pending until the due worker applies them exactly once', async () => {
  const effectiveAt = new Date(Date.now() + 60_000).toISOString();
  const response = await fetch(`${baseUrl}/api/super-admin/institutes/${instituteId}/billing-operations`, {
    method: 'POST', headers: headers({ 'Idempotency-Key': `schedule-${Date.now()}` }),
    body: JSON.stringify({ type: 'PLAN_CHANGE', reason: 'Schedule the approved annual renewal plan', effectiveAt, payload: { plan: 'ENTERPRISE', billingCycle: 'YEARLY' } })
  });
  assert.equal(response.status, 202);
  const operation = (await response.json() as any).data;
  await prisma.superAdminBillingOperation.update({ where: { id: operation.id }, data: { effectiveAt: new Date(Date.now() - 1_000), nextAttemptAt: new Date(Date.now() - 1_000) } });
  const [first, second] = await Promise.all([processDueSuperAdminBillingOperations(), processDueSuperAdminBillingOperations()]);
  assert.ok(first + second >= 1);
  const stored = await prisma.superAdminBillingOperation.findUniqueOrThrow({ where: { id: operation.id } });
  assert.equal(stored.status, 'APPLIED');
  assert.equal(stored.attempts, 1);
  assert.equal((await prisma.institute.findUniqueOrThrow({ where: { id: instituteId } })).plan, 'ENTERPRISE');
});

test('billing history separates local operations from sanitized provider state', async () => {
  const response = await fetch(`${baseUrl}/api/super-admin/institutes/${instituteId}/billing-history`, { headers: headers() });
  assert.equal(response.status, 200);
  const body = await response.json() as any;
  assert.equal(body.data.plan, 'ENTERPRISE');
  assert.equal(body.data.lifetimeQuizCredits, 22);
  assert.ok(Array.isArray(body.data.notifications));
  assert.ok(Array.isArray(body.data.payments));
  assert.equal(body.data.subscription.status, 'PENDING');
  assert.equal(body.data.subscription.amountPaise, 49_900);
  assert.ok(body.data.subscription.graceEndsAt);
  assert.equal(body.data.charges.length, 1);
  assert.equal(JSON.stringify(body).includes('key_secret'), false);
  assert.equal(JSON.stringify(body).includes('customer'), false);
});
