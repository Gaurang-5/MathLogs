import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { createApp } from '../src/index';
import { prisma } from '../src/prisma';
import { expireSuperAdminSupportSessions } from '../src/workers/superAdminSessionWorker';

const originalSupportFlag = process.env.SUPPORT_FEATURE_ENABLED;
process.env.SUPPORT_FEATURE_ENABLED = 'true';

let server: Server; let baseUrl: string; let adminId: string; let instituteId: string;
before(async () => { const suffix = `${Date.now()}-${Math.random()}`; const institute = await prisma.institute.create({ data: { name: `Assisted Academy ${suffix}`, planExpiryDate: new Date(Date.now() + 86_400_000) } }); instituteId = institute.id; const superAdmin = await prisma.admin.create({ data: { username: `assistance-super-${suffix}`, password: await bcrypt.hash('test', 4), role: 'SUPER_ADMIN' } }); adminId = superAdmin.id; await prisma.admin.create({ data: { username: `assistance-owner-${suffix}`, password: await bcrypt.hash('test', 4), role: 'INSTITUTE_ADMIN', instituteId } }); const app = createApp(); await new Promise<void>(resolve => { server = app.listen(0, resolve); }); baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`; });
after(async () => {
  if (originalSupportFlag === undefined) delete process.env.SUPPORT_FEATURE_ENABLED;
  else process.env.SUPPORT_FEATURE_ENABLED = originalSupportFlag;
  await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  await prisma.$disconnect();
});

test('support token enters institute context, audits mutations, and blocks sensitive actions', async () => {
  const session = await prisma.superAdminSupportSession.create({ data: { adminId, instituteId, reason: 'Investigate institute workflow safely', expiresAt: new Date(Date.now() + 300_000) } });
  const token = jwt.sign({ kind: 'SUPPORT_SESSION', sessionId: session.id, actorAdminId: adminId, instituteId, role: 'INSTITUTE_ADMIN' }, 'test-secret', { expiresIn: '5m' });
  const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', 'X-Correlation-Id': 'corr-support-mutation' };
  const profile = await fetch(`${baseUrl}/api/institute/me`, { headers }); assert.equal(profile.status, 200);
  const mutation = await fetch(`${baseUrl}/api/support/tickets`, { method: 'POST', headers, body: JSON.stringify({ category: 'TECHNICAL', subject: 'Assisted workflow check', description: 'Superadmin verified this workflow during support mode.', priority: 'NORMAL' }) }); assert.equal(mutation.status, 201);
  await new Promise(resolve => setTimeout(resolve, 20));
  assert.equal(await prisma.superAdminAuditLog.count({ where: { action: 'SUPPORT_MUTATION', supportSessionId: session.id, correlationId: 'corr-support-mutation' } }), 1);
  const forbidden = await fetch(`${baseUrl}/api/billing/create`, { method: 'POST', headers, body: '{}' }); assert.equal(forbidden.status, 403); assert.equal((await forbidden.json() as any).error, 'SUPPORT_SESSION_ACTION_FORBIDDEN');
});

test('expired support sessions are ended and audited exactly once', async () => {
  const session = await prisma.superAdminSupportSession.create({ data: { adminId, instituteId, reason: 'Expire the bounded assistance session', expiresAt: new Date(Date.now() - 1000) } });
  assert.ok((await expireSuperAdminSupportSessions()) >= 1); assert.equal(await expireSuperAdminSupportSessions(), 0);
  const ended = await prisma.superAdminSupportSession.findUniqueOrThrow({ where: { id: session.id } }); assert.equal(ended.endReason, 'EXPIRED');
  assert.equal(await prisma.superAdminAuditLog.count({ where: { action: 'SUPPORT_SESSION_EXPIRED', supportSessionId: session.id } }), 1);
});
