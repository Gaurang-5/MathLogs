import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { createApp } from '../src/index';
import { prisma } from '../src/prisma';

let server: Server; let baseUrl: string; let adminId: string; let token: string;
const headers = (challengeId?: string, key?: string) => ({ Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', ...(challengeId ? { 'X-Superadmin-Challenge': challengeId } : {}), ...(key ? { 'Idempotency-Key': key } : {}) });
async function challenge() { return prisma.superAdminReauthChallenge.create({ data: { adminId, actionClass: 'INSTITUTE_DELETE', otpHash: await bcrypt.hash('123456', 4), expiresAt: new Date(Date.now() + 300_000), verifiedAt: new Date() } }); }
before(async () => { const suffix = `${Date.now()}-${Math.random()}`; const admin = await prisma.admin.create({ data: { username: `deletion-super-${suffix}`, password: await bcrypt.hash('test', 4), role: 'SUPER_ADMIN' } }); adminId = admin.id; token = jwt.sign({ id: admin.id, username: admin.username, role: admin.role, passwordVersion: 1 }, 'test-secret'); const app = createApp(); await new Promise<void>(resolve => { server = app.listen(0, resolve); }); baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`; });
after(async () => { await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve())); await prisma.$disconnect(); });

test('legacy direct deletion is unavailable and scheduling requires exact name, OTP, reason, and idempotency', async () => {
  const institute = await prisma.institute.create({ data: { name: `Protected Deletion ${Date.now()}` } });
  const legacy = await fetch(`${baseUrl}/api/institutes/${institute.id}`, { method: 'DELETE', headers: headers() }); assert.equal(legacy.status, 404);
  const denied = await fetch(`${baseUrl}/api/super-admin/institutes/${institute.id}/deletion`, { method: 'POST', headers: headers(undefined, 'delete-denied'), body: JSON.stringify({ typedName: institute.name, reason: 'Schedule verified institute deletion' }) }); assert.equal(denied.status, 403);
  const verified = await challenge();
  const wrong = await fetch(`${baseUrl}/api/super-admin/institutes/${institute.id}/deletion`, { method: 'POST', headers: headers(verified.id, 'delete-wrong'), body: JSON.stringify({ typedName: 'Wrong name', reason: 'Schedule verified institute deletion' }) }); assert.equal(wrong.status, 409);
});

test('scheduled deletion can be cancelled and restores prior institute state', async () => {
  const institute = await prisma.institute.create({ data: { name: `Cancellation Academy ${Date.now()}`, status: 'ACTIVE', areRegistrationsPaused: false } }); const verified = await challenge();
  const scheduled = await fetch(`${baseUrl}/api/super-admin/institutes/${institute.id}/deletion`, { method: 'POST', headers: headers(verified.id, `schedule-${institute.id}`), body: JSON.stringify({ typedName: institute.name, reason: 'Institute owner confirmed closure request' }) }); assert.equal(scheduled.status, 201);
  const inactive = await prisma.institute.findUniqueOrThrow({ where: { id: institute.id } }); assert.equal(inactive.status, 'INACTIVE'); assert.equal(inactive.areRegistrationsPaused, true);
  const cancelled = await fetch(`${baseUrl}/api/super-admin/institutes/${institute.id}/deletion`, { method: 'DELETE', headers: headers(), body: JSON.stringify({ reason: 'Owner withdrew the verified closure request' }) }); assert.equal(cancelled.status, 200);
  const restored = await prisma.institute.findUniqueOrThrow({ where: { id: institute.id } }); assert.equal(restored.status, 'ACTIVE'); assert.equal(restored.areRegistrationsPaused, false);
});

test('finalization enforces delay then removes institute data while retaining deletion and audit records', async () => {
  const institute = await prisma.institute.create({ data: { name: `Final Deletion ${Date.now()}`, email: `delete-${Date.now()}@example.com` } });
  await prisma.admin.create({ data: { username: `delete-owner-${Date.now()}`, password: await bcrypt.hash('test', 4), role: 'INSTITUTE_ADMIN', instituteId: institute.id } });
  const firstChallenge = await challenge(); const scheduledResponse = await fetch(`${baseUrl}/api/super-admin/institutes/${institute.id}/deletion`, { method: 'POST', headers: headers(firstChallenge.id, `schedule-final-${institute.id}`), body: JSON.stringify({ typedName: institute.name, reason: 'Owner confirmed permanent institute closure' }) }); assert.equal(scheduledResponse.status, 201); const scheduled = (await scheduledResponse.json() as any).data;
  const earlyChallenge = await challenge(); const early = await fetch(`${baseUrl}/api/super-admin/institutes/${institute.id}/deletion/finalize`, { method: 'POST', headers: headers(earlyChallenge.id), body: JSON.stringify({ typedName: institute.name, reason: 'Finalize confirmed permanent institute closure' }) }); assert.equal(early.status, 409);
  await prisma.superAdminDeletionRequest.update({ where: { id: scheduled.id }, data: { eligibleAt: new Date(Date.now() - 1000) } });
  const finalChallenge = await challenge(); const finalized = await fetch(`${baseUrl}/api/super-admin/institutes/${institute.id}/deletion/finalize`, { method: 'POST', headers: headers(finalChallenge.id), body: JSON.stringify({ typedName: institute.name, reason: 'Finalize confirmed permanent institute closure' }) }); assert.equal(finalized.status, 200);
  assert.equal(await prisma.institute.count({ where: { id: institute.id } }), 0);
  const retained = await prisma.superAdminDeletionRequest.findUniqueOrThrow({ where: { id: scheduled.id } }); assert.equal(retained.status, 'COMPLETED'); assert.equal(retained.instituteId, null);
  assert.equal(await prisma.superAdminAuditLog.count({ where: { action: 'INSTITUTE_DELETION_FINALIZED', entityId: institute.id } }), 1);
});
