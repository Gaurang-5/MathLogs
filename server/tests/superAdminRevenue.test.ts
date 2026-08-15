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
      plan: 'BASIC',
      planStartDate: new Date(),
      planExpiryDate: new Date(Date.now() + 30 * 86_400_000),
      quizCredits: 20,
      config: { maxStudents: 100 }
    }
  });
  instituteId = institute.id;
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
  assert.ok(body.data.byPlan.some((item: any) => item.plan === 'BASIC'));
  assert.equal('mrrPaise' in body.data.metrics, false);

  const subscriptions = await fetch(`${baseUrl}/api/super-admin/revenue/subscriptions?page=1&pageSize=25`, { headers: headers() });
  assert.equal(subscriptions.status, 200);
  const subscriptionBody = await subscriptions.json() as any;
  assert.ok(subscriptionBody.data.items.some((item: any) => item.instituteId === instituteId));
  assert.equal(JSON.stringify(subscriptionBody).includes('razorpaySubscriptionId'), false);
});

test('billing preview matches immediate quiz-credit application and idempotent replay', async () => {
  const draft = { type: 'QUIZ_CREDIT_ADJUSTMENT', reason: 'Approved service recovery adjustment', payload: { delta: 7 } };
  const preview = await fetch(`${baseUrl}/api/super-admin/institutes/${instituteId}/billing-operations/preview`, {
    method: 'POST', headers: headers(), body: JSON.stringify(draft)
  });
  assert.equal(preview.status, 200);
  const previewBody = await preview.json() as any;
  assert.equal(previewBody.data.before.quizCredits, 20);
  assert.equal(previewBody.data.after.quizCredits, 27);

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

test('plan revocation requires its own challenge and writes an audit entry', async () => {
  const challenge = await verifiedChallenge('PLAN_REVOKE');
  const response = await fetch(`${baseUrl}/api/super-admin/institutes/${instituteId}/billing-operations`, {
    method: 'POST',
    headers: headers({ 'Idempotency-Key': `revoke-${Date.now()}`, 'X-Superadmin-Challenge': challenge.id }),
    body: JSON.stringify({ type: 'PLAN_REVOKE', reason: 'Verified account closure requested by owner', payload: {} })
  });
  assert.equal(response.status, 200);
  assert.equal((await prisma.institute.findUniqueOrThrow({ where: { id: instituteId } })).plan, 'NO_PLAN');
  const audit = await prisma.superAdminAuditLog.findFirst({ where: { instituteId, action: 'BILLING_PLAN_REVOKE_APPLIED' } });
  assert.ok(audit);
});

test('future plan changes remain pending until the due worker applies them exactly once', async () => {
  const effectiveAt = new Date(Date.now() + 60_000).toISOString();
  const expiryDate = new Date(Date.now() + 365 * 86_400_000).toISOString();
  const response = await fetch(`${baseUrl}/api/super-admin/institutes/${instituteId}/billing-operations`, {
    method: 'POST', headers: headers({ 'Idempotency-Key': `schedule-${Date.now()}` }),
    body: JSON.stringify({ type: 'PLAN_CHANGE', reason: 'Schedule the approved annual renewal plan', effectiveAt, payload: { plan: 'PRO', expiryDate } })
  });
  assert.equal(response.status, 202);
  const operation = (await response.json() as any).data;
  await prisma.superAdminBillingOperation.update({ where: { id: operation.id }, data: { effectiveAt: new Date(Date.now() - 1_000), nextAttemptAt: new Date(Date.now() - 1_000) } });
  const [first, second] = await Promise.all([processDueSuperAdminBillingOperations(), processDueSuperAdminBillingOperations()]);
  assert.ok(first + second >= 1);
  const stored = await prisma.superAdminBillingOperation.findUniqueOrThrow({ where: { id: operation.id } });
  assert.equal(stored.status, 'APPLIED');
  assert.equal(stored.attempts, 1);
  assert.equal((await prisma.institute.findUniqueOrThrow({ where: { id: instituteId } })).plan, 'PRO');
});

test('billing history separates local operations from sanitized provider state', async () => {
  const response = await fetch(`${baseUrl}/api/super-admin/institutes/${instituteId}/billing-history`, { headers: headers() });
  assert.equal(response.status, 200);
  const body = await response.json() as any;
  assert.deepEqual(Object.keys(body.data), ['operations', 'providerState', 'subscriptionPayments', 'invoices']);
  assert.equal(JSON.stringify(body).includes('key_secret'), false);
  assert.equal(JSON.stringify(body).includes('customer'), false);
});
