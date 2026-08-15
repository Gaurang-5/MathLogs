import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { createApp } from '../src/index';
import { prisma } from '../src/prisma';
import { secureLogger } from '../src/utils/secureLogger';

let server: Server;
let baseUrl: string;
let superAdminId: string;
let instituteAdminId: string;
let instituteId: string;
let superToken: string;
let instituteToken: string;

const auth = (token: string, extra: Record<string, string> = {}) => ({
  Authorization: `Bearer ${token}`,
  'Content-Type': 'application/json',
  ...extra
});

async function post(path: string, token: string, body: unknown, extra: Record<string, string> = {}) {
  return fetch(`${baseUrl}${path}`, {
    method: 'POST',
    headers: auth(token, extra),
    body: JSON.stringify(body)
  });
}

before(async () => {
  const suffix = `${Date.now()}-${Math.random()}`;
  const password = await bcrypt.hash('correct-password', 4);
  const institute = await prisma.institute.create({ data: { name: `Security API ${suffix}` } });
  instituteId = institute.id;
  const superAdmin = await prisma.admin.create({
    data: { username: `security-${suffix}@example.com`, password, role: 'SUPER_ADMIN' }
  });
  superAdminId = superAdmin.id;
  const instituteAdmin = await prisma.admin.create({
    data: {
      username: `institute-security-${suffix}`,
      password,
      role: 'INSTITUTE_ADMIN',
      instituteId
    }
  });
  instituteAdminId = instituteAdmin.id;
  superToken = jwt.sign({
    id: superAdmin.id,
    username: superAdmin.username,
    passwordVersion: 1,
    role: superAdmin.role
  }, 'test-secret');
  instituteToken = jwt.sign({
    id: instituteAdmin.id,
    username: instituteAdmin.username,
    instituteId,
    passwordVersion: 1,
    role: instituteAdmin.role
  }, 'test-secret');

  const app = createApp();
  await new Promise<void>((resolve) => {
    server = app.listen(0, resolve);
  });
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

after(async () => {
  await new Promise<void>((resolve, reject) => {
    server.close((error) => error ? reject(error) : resolve());
  });
  await prisma.$disconnect();
});

test('Superadmin security routes reject institute admins and echo correlation IDs', async () => {
  const response = await post(
    '/api/super-admin/security/reauth/send',
    instituteToken,
    { actionClass: 'SUPPORT_SESSION' },
    { 'X-Correlation-Id': 'corr-role-boundary' }
  );

  assert.equal(response.status, 403);
  assert.equal(response.headers.get('x-correlation-id'), 'corr-role-boundary');
  assert.equal((await response.json() as any).error, 'SUPERADMIN_REQUIRED');
});

test('reauthentication stores only a hash and locks after five invalid codes', async () => {
  const logged: unknown[] = [];
  const originalDebug = secureLogger.debug;
  secureLogger.debug = ((...args: unknown[]) => { logged.push(args); }) as typeof secureLogger.debug;
  const sent = await post('/api/super-admin/security/reauth/send', superToken, { actionClass: 'SUPPORT_SESSION' })
    .finally(() => { secureLogger.debug = originalDebug; });
  assert.equal(sent.status, 200);
  const sentBody = await sent.json() as any;
  assert.equal(typeof sentBody.data.challengeId, 'string');
  assert.equal(JSON.stringify(sentBody).includes('otp'), false);

  const stored = await prisma.superAdminReauthChallenge.findUniqueOrThrow({
    where: { id: sentBody.data.challengeId }
  });
  assert.match(stored.otpHash, /^\$2[aby]\$/);
  assert.doesNotMatch(stored.otpHash, /^\d{6}$/);
  assert.doesNotMatch(JSON.stringify(logged), /\b\d{6}\b/);

  for (let attempt = 0; attempt < 5; attempt += 1) {
    await post('/api/super-admin/security/reauth/verify', superToken, {
      challengeId: stored.id,
      otp: '000000'
    });
  }
  const locked = await post('/api/super-admin/security/reauth/verify', superToken, {
    challengeId: stored.id,
    otp: '111111'
  });
  assert.equal(locked.status, 429);
  assert.equal((await locked.json() as any).error, 'REAUTH_CHALLENGE_LOCKED');
});

test('a verified challenge starts one audited support session and cannot be reused', async () => {
  const ticket = await prisma.supportTicket.create({
    data: { reference: `SUP-SESSION-${Date.now()}`, instituteId, category: 'ACCOUNT', subject: 'Owner login investigation', description: 'The owner needs audited help with their login.' }
  });
  const challenge = await prisma.superAdminReauthChallenge.create({
    data: {
      adminId: superAdminId,
      actionClass: 'SUPPORT_SESSION',
      otpHash: await bcrypt.hash('482913', 4),
      expiresAt: new Date(Date.now() + 300_000)
    }
  });
  const verified = await post('/api/super-admin/security/reauth/verify', superToken, {
    challengeId: challenge.id,
    otp: '482913'
  });
  assert.equal(verified.status, 200);

  const headers = { 'X-Superadmin-Challenge': challenge.id, 'X-Correlation-Id': 'corr-support-start' };
  const first = await post('/api/super-admin/support-sessions', superToken, {
    instituteId,
    ticketId: ticket.id,
    reason: 'Investigate the owner login issue'
  }, headers);
  assert.equal(first.status, 201);
  assert.equal(first.headers.get('x-correlation-id'), 'corr-support-start');
  const firstBody = await first.json() as any;
  assert.equal(firstBody.data.session.ticketId, ticket.id);
  const claims = jwt.verify(firstBody.data.supportToken, 'test-secret') as any;
  assert.deepEqual({
    kind: claims.kind,
    sessionId: claims.sessionId,
    actorAdminId: claims.actorAdminId,
    instituteId: claims.instituteId,
    role: claims.role
  }, {
    kind: 'SUPPORT_SESSION',
    sessionId: firstBody.data.session.id,
    actorAdminId: superAdminId,
    instituteId,
    role: 'INSTITUTE_ADMIN'
  });

  const repeated = await post('/api/super-admin/support-sessions', superToken, {
    instituteId,
    reason: 'Investigate the owner login issue'
  }, headers);
  assert.equal(repeated.status, 403);
  assert.equal((await repeated.json() as any).error, 'REAUTH_REQUIRED');

  const audit = await prisma.superAdminAuditLog.findFirstOrThrow({
    where: { action: 'SUPPORT_SESSION_STARTED', supportSessionId: firstBody.data.session.id }
  });
  assert.equal(audit.correlationId, 'corr-support-start');
  assert.equal(audit.actorAdminId, superAdminId);
  assert.equal((audit.metadata as any).ticketId, ticket.id);

  const ended = await fetch(`${baseUrl}/api/super-admin/support-sessions/${firstBody.data.session.id}`, {
    method: 'DELETE',
    headers: auth(superToken),
    body: JSON.stringify({ reason: 'Investigation completed' })
  });
  assert.equal(ended.status, 200);
  assert.equal((await ended.json() as any).data.endReason, 'MANUAL');
});

test('password login, refresh rotation, and logout retain a durable session trail', async () => {
  const admin = await prisma.admin.findUniqueOrThrow({ where: { id: superAdminId } });
  const warnings: unknown[] = [];
  const originalWarn = secureLogger.warn;
  secureLogger.warn = ((...args: unknown[]) => { warnings.push(args); }) as typeof secureLogger.warn;
  const failed = await fetch(`${baseUrl}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'User-Agent': 'Mozilla/5.0 Macintosh Safari' },
    body: JSON.stringify({ username: admin.username, password: 'wrong-password' })
  }).finally(() => { secureLogger.warn = originalWarn; });
  assert.equal(failed.status, 401);
  assert.equal(JSON.stringify(warnings).includes(admin.username), false);

  const login = await fetch(`${baseUrl}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'User-Agent': 'Mozilla/5.0 Macintosh Safari' },
    body: JSON.stringify({ username: admin.username, password: 'correct-password' })
  });
  assert.equal(login.status, 200);
  const loginBody = await login.json() as any;
  const firstRefresh = await prisma.refreshToken.findUniqueOrThrow({
    where: { token: loginBody.refreshToken },
    include: { session: true }
  });
  assert.ok(firstRefresh.sessionId);
  assert.equal(firstRefresh.session?.deviceLabel, 'Safari on macOS');

  const refreshed = await fetch(`${baseUrl}/api/auth/refresh`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'User-Agent': 'Mozilla/5.0 Macintosh Safari' },
    body: JSON.stringify({ refreshToken: loginBody.refreshToken })
  });
  assert.equal(refreshed.status, 200);
  const refreshedBody = await refreshed.json() as any;
  const rotated = await prisma.refreshToken.findUniqueOrThrow({
    where: { token: refreshedBody.refreshToken }
  });
  assert.equal(rotated.sessionId, firstRefresh.sessionId);

  const logout = await fetch(`${baseUrl}/api/auth/logout`, {
    method: 'POST',
    headers: auth(loginBody.token),
    body: JSON.stringify({ refreshToken: refreshedBody.refreshToken })
  });
  assert.equal(logout.status, 200);
  const session = await prisma.adminSession.findUniqueOrThrow({ where: { id: firstRefresh.sessionId! } });
  assert.ok(session.revokedAt);
  assert.equal(await prisma.refreshToken.count({ where: { sessionId: session.id } }), 0);

  const eventTypes = await prisma.authenticationEvent.findMany({
    where: { adminId: superAdminId },
    select: { eventType: true, success: true }
  });
  assert.ok(eventTypes.some((event) => event.eventType === 'LOGIN_FAILED' && !event.success));
  assert.ok(eventTypes.some((event) => event.eventType === 'LOGIN' && event.success));
  assert.ok(eventTypes.some((event) => event.eventType === 'REFRESH' && event.success));
  assert.ok(eventTypes.some((event) => event.eventType === 'LOGOUT' && event.success));
});

test('legacy mobile OTP dispatch never writes the code to application logs', async () => {
  const admin = await prisma.admin.findUniqueOrThrow({ where: { id: superAdminId } });
  const infoLogs: unknown[] = [];
  const originalInfo = secureLogger.info;
  secureLogger.info = ((...args: unknown[]) => { infoLogs.push(args); }) as typeof secureLogger.info;
  const response = await fetch(`${baseUrl}/api/auth/send-mobile-otp`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ phone: admin.username })
  }).finally(() => { secureLogger.info = originalInfo; });
  assert.equal(response.status, 200);
  assert.doesNotMatch(JSON.stringify(infoLogs), /\b\d{6}\b/);
});

test('idempotency claims replay completed responses and reject key reuse', async () => {
  const { claimSuperAdminIdempotency, completeSuperAdminIdempotency } = await import('../src/services/superAdminIdempotencyService');
  const key = `idempotency-${Date.now()}-${Math.random()}`;
  const first = await claimSuperAdminIdempotency({
    actorAdminId: superAdminId,
    scope: 'SYSTEM_JOB_RETRY',
    key,
    request: { kind: 'WHATSAPP', id: 'job-1' }
  });
  assert.equal(first.kind, 'CLAIMED');
  await completeSuperAdminIdempotency(first.recordId, { queued: true });

  const replay = await claimSuperAdminIdempotency({
    actorAdminId: superAdminId,
    scope: 'SYSTEM_JOB_RETRY',
    key,
    request: { kind: 'WHATSAPP', id: 'job-1' }
  });
  assert.deepEqual(replay, { kind: 'REPLAY', response: { queued: true } });

  await assert.rejects(
    claimSuperAdminIdempotency({
      actorAdminId: superAdminId,
      scope: 'SYSTEM_JOB_RETRY',
      key,
      request: { kind: 'WHATSAPP', id: 'job-2' }
    }),
    /IDEMPOTENCY_KEY_REUSED/
  );
});
