import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { createApp } from '../src/index';
import { prisma } from '../src/prisma';

let server: Server; let baseUrl: string; let superAdminId: string; let superToken: string; let ownerToken: string; let includedInstituteId: string; let excludedInstituteId: string;
const headers = (token: string, extra: Record<string, string> = {}) => ({ Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', ...extra });

before(async () => {
  const suffix = `${Date.now()}-${Math.random()}`;
  const [included, excluded] = await Promise.all([
    prisma.institute.create({ data: { name: `Consent Academy ${suffix}`, teacherName: 'Asha', email: `consent-${suffix}@example.com`, status: 'ACTIVE' } }),
    prisma.institute.create({ data: { name: `No Consent Academy ${suffix}`, teacherName: 'Ravi', email: `excluded-${suffix}@example.com`, status: 'ACTIVE' } })
  ]);
  includedInstituteId = included.id; excludedInstituteId = excluded.id;
  await prisma.instituteCommunicationPreference.create({ data: { instituteId: included.id, emailOperational: true, emailConsentedAt: new Date(), consentSource: 'TEST' } });
  const [superAdmin, owner] = await Promise.all([
    prisma.admin.create({ data: { username: `communications-super-${suffix}`, password: await bcrypt.hash('test', 4), role: 'SUPER_ADMIN' } }),
    prisma.admin.create({ data: { username: `communications-owner-${suffix}`, password: await bcrypt.hash('test', 4), role: 'INSTITUTE_ADMIN', instituteId: included.id } })
  ]);
  superAdminId = superAdmin.id;
  superToken = jwt.sign({ id: superAdmin.id, username: superAdmin.username, role: superAdmin.role, passwordVersion: 1 }, 'test-secret');
  ownerToken = jwt.sign({ id: owner.id, username: owner.username, role: owner.role, instituteId: included.id, passwordVersion: 1 }, 'test-secret');
  const app = createApp(); await new Promise<void>(resolve => { server = app.listen(0, resolve); }); baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

after(async () => { await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve())); await prisma.$disconnect(); });

test('preview includes only consented destinations and never accepts arbitrary templates', async () => {
  const invalid = await fetch(`${baseUrl}/api/super-admin/communications/preview`, { method: 'POST', headers: headers(superToken), body: JSON.stringify({ channel: 'EMAIL', templateName: 'WRITE_ANYTHING', reason: 'Attempt arbitrary communication', audience: { instituteIds: [includedInstituteId] } }) });
  assert.equal(invalid.status, 400);
  const response = await fetch(`${baseUrl}/api/super-admin/communications/preview`, { method: 'POST', headers: headers(superToken), body: JSON.stringify({ channel: 'EMAIL', templateName: 'SERVICE_UPDATE', reason: 'Send verified operational service update', audience: { instituteIds: [includedInstituteId, excludedInstituteId] } }) });
  assert.equal(response.status, 200); const body = await response.json() as any;
  assert.equal(body.data.includedCount, 1); assert.equal(body.data.excludedCount, 1);
  assert.equal(body.data.recipients.find((item: any) => item.instituteId === excludedInstituteId).exclusionReason, 'CONSENT_MISSING');
  assert.equal(JSON.stringify(body).includes(`consent-`), false);
  assert.equal(body.data.recipients.some((item: any) => item.destinationMasked?.includes('***@example.com')), true);
});

test('dispatch requires OTP, queues durable jobs once, and audits the approved template', async () => {
  const request = { channel: 'EMAIL', templateName: 'SERVICE_UPDATE', reason: 'Send verified operational service update', audience: { instituteIds: [includedInstituteId, excludedInstituteId] } };
  const denied = await fetch(`${baseUrl}/api/super-admin/communications/dispatch`, { method: 'POST', headers: headers(superToken, { 'Idempotency-Key': `communication-${Date.now()}` }), body: JSON.stringify(request) });
  assert.equal(denied.status, 403);
  const challenge = await prisma.superAdminReauthChallenge.create({ data: { adminId: superAdminId, actionClass: 'TARGETED_COMMUNICATION', otpHash: await bcrypt.hash('123456', 4), expiresAt: new Date(Date.now() + 300_000), verifiedAt: new Date() } });
  const idempotencyKey = `communication-${Date.now()}-${Math.random()}`;
  const response = await fetch(`${baseUrl}/api/super-admin/communications/dispatch`, { method: 'POST', headers: headers(superToken, { 'Idempotency-Key': idempotencyKey, 'X-Superadmin-Challenge': challenge.id, 'X-Correlation-Id': 'corr-communication' }), body: JSON.stringify(request) });
  assert.equal(response.status, 201); const result = (await response.json() as any).data;
  assert.equal(result.includedCount, 1); assert.equal(result.excludedCount, 1);
  assert.equal(await prisma.emailJob.count({ where: { superAdminEntityType: 'TargetedCommunicationRecipient', instituteId: includedInstituteId } }), 1);
  const audit = await prisma.superAdminAuditLog.findFirstOrThrow({ where: { action: 'TARGETED_COMMUNICATION_DISPATCHED', entityId: result.id } });
  assert.equal(audit.correlationId, 'corr-communication');
});

test('institute users control their own operational consent', async () => {
  const response = await fetch(`${baseUrl}/api/communication-preferences`, { method: 'PATCH', headers: headers(ownerToken), body: JSON.stringify({ emailOperational: false, whatsappOperational: true }) });
  assert.equal(response.status, 200); const body = await response.json() as any;
  assert.equal(body.data.instituteId, includedInstituteId); assert.equal(body.data.emailOperational, false); assert.equal(body.data.whatsappOperational, true);
});
