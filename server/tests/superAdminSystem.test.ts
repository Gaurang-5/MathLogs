import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { createApp } from '../src/index';
import { prisma } from '../src/prisma';

let server: Server; let baseUrl: string; let adminId: string; let token: string; let instituteId: string; let failedEmailId: string; let sessionId: string; let boundToken: string;
const originalSupportFlag = process.env.SUPPORT_FEATURE_ENABLED;
const headers = (extra: Record<string, string> = {}) => ({ Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', ...extra });

before(async () => {
  process.env.SUPPORT_FEATURE_ENABLED = 'true';
  const suffix = `${Date.now()}-${Math.random()}`;
  const institute = await prisma.institute.create({ data: { name: `System Academy ${suffix}` } }); instituteId = institute.id;
  const admin = await prisma.admin.create({ data: { username: `system-super-${suffix}`, password: await bcrypt.hash('test', 4), role: 'SUPER_ADMIN' } }); adminId = admin.id;
  token = jwt.sign({ id: admin.id, username: admin.username, role: admin.role, passwordVersion: 1 }, 'test-secret');
  const session = await prisma.adminSession.create({ data: { adminId, deviceLabel: 'Chrome on macOS', expiresAt: new Date(Date.now() + 86_400_000) } }); sessionId = session.id;
  await prisma.superAdminSupportSession.create({ data: { adminId, instituteId, reason: 'Verify system support-session health', expiresAt: new Date(Date.now() + 86_400_000) } });
  boundToken = jwt.sign({ id: admin.id, username: admin.username, role: admin.role, passwordVersion: 1, sessionId }, 'test-secret');
  const failed = await prisma.emailJob.create({ data: { recipient: `private-${suffix}@example.com`, subject: 'Retry operational email', body: 'Body', status: 'FAILED', attempts: 3, error: 'Provider unavailable', instituteId } }); failedEmailId = failed.id;
  await prisma.authenticationEvent.create({ data: { adminId, eventType: 'LOGIN_FAILED', success: false, deviceLabel: 'Safari on iOS' } });
  const app = createApp(); await new Promise<void>(resolve => { server = app.listen(0, resolve); }); baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
after(async () => {
  if (originalSupportFlag === undefined) delete process.env.SUPPORT_FEATURE_ENABLED;
  else process.env.SUPPORT_FEATURE_ENABLED = originalSupportFlag;
  await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  await prisma.$disconnect();
});

test('system overview and job queue expose health without raw destinations or secrets', async () => {
  const overview = await fetch(`${baseUrl}/api/super-admin/system/overview`, { headers: headers() }); assert.equal(overview.status, 200); const overviewBody = await overview.json() as any;
  assert.ok(overviewBody.data.jobs.failedTotal >= 1); assert.equal(typeof overviewBody.data.database.latencyMs, 'number');
  assert.ok(overviewBody.data.security.activeSupportSessions >= 1);
  const jobs = await fetch(`${baseUrl}/api/super-admin/system/jobs?kind=EMAIL&status=FAILED`, { headers: headers() }); assert.equal(jobs.status, 200); const jobsBody = await jobs.json() as any;
  const job = jobsBody.data.find((item: any) => item.id === failedEmailId); assert.ok(job); assert.match(job.destinationMasked, /\*\*\*@example\.com$/); assert.equal(JSON.stringify(jobsBody).includes(`private-`), false);
  assert.equal(JSON.stringify(overviewBody).includes(process.env.JWT_SECRET || 'test-secret'), false);
});

test('system overview omits active Support sessions while the feature is disabled', async () => {
  process.env.SUPPORT_FEATURE_ENABLED = 'false';
  try {
    const response = await fetch(`${baseUrl}/api/super-admin/system/overview`, { headers: headers() });
    assert.equal(response.status, 200);
    assert.equal((await response.json() as any).data.security.activeSupportSessions, 0);
  } finally {
    process.env.SUPPORT_FEATURE_ENABLED = 'true';
  }
});

test('failed jobs retry once with idempotency and immutable audit', async () => {
  const key = `system-retry-${Date.now()}`;
  const response = await fetch(`${baseUrl}/api/super-admin/system/jobs/EMAIL/${failedEmailId}/retry`, { method: 'POST', headers: headers({ 'Idempotency-Key': key, 'X-Correlation-Id': 'corr-system-retry' }), body: JSON.stringify({ reason: 'Retry after provider health recovered' }) });
  assert.equal(response.status, 200); assert.equal((await response.json() as any).data.status, 'PENDING');
  const audit = await prisma.superAdminAuditLog.findFirstOrThrow({ where: { action: 'SYSTEM_JOB_RETRIED', entityId: failedEmailId } }); assert.equal(audit.correlationId, 'corr-system-retry');
});

test('OTP-gated session revocation immediately invalidates session-bound access tokens', async () => {
  const before = await fetch(`${baseUrl}/api/super-admin/home`, { headers: { Authorization: `Bearer ${boundToken}` } }); assert.equal(before.status, 200);
  const challenge = await prisma.superAdminReauthChallenge.create({ data: { adminId, actionClass: 'SYSTEM_SESSION_REVOKE', otpHash: await bcrypt.hash('123456', 4), expiresAt: new Date(Date.now() + 300_000), verifiedAt: new Date() } });
  const revoked = await fetch(`${baseUrl}/api/super-admin/system/sessions/${sessionId}/revoke`, { method: 'POST', headers: headers({ 'X-Superadmin-Challenge': challenge.id }), body: JSON.stringify({ reason: 'Revoke a verified unrecognized device session' }) });
  assert.equal(revoked.status, 200);
  const afterResponse = await fetch(`${baseUrl}/api/super-admin/home`, { headers: { Authorization: `Bearer ${boundToken}` } }); assert.equal(afterResponse.status, 403);
});

test('system audit and security views include bounded operational records', async () => {
  const [audit, security] = await Promise.all([fetch(`${baseUrl}/api/super-admin/system/audit?q=SYSTEM_JOB`, { headers: headers() }), fetch(`${baseUrl}/api/super-admin/system/security`, { headers: headers() })]);
  assert.equal(audit.status, 200); assert.equal(security.status, 200);
  assert.ok((await audit.json() as any).data.some((item: any) => item.action === 'SYSTEM_JOB_RETRIED'));
  const securityBody = await security.json() as any; assert.ok(securityBody.data.sessions.some((item: any) => item.id === sessionId && item.revokedAt)); assert.ok(securityBody.data.events.some((item: any) => item.eventType === 'LOGIN_FAILED'));
});
