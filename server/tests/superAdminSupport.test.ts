import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { createApp } from '../src/index';
import { prisma } from '../src/prisma';

let server: Server; let baseUrl: string; let instituteId: string; let otherInstituteId: string; let superToken: string; let ownerToken: string; let otherToken: string;
before(async () => {
  const suffix = `${Date.now()}-${Math.random()}`;
  const activePlan = { plan: 'ENTERPRISE' as const, planStartDate: new Date(), planExpiryDate: new Date('2099-01-01T00:00:00.000Z'), marketplaceAccessGrantedAt: new Date() };
  const institute = await prisma.institute.create({ data: { name: `Support Academy ${suffix}`, ...activePlan } }); instituteId = institute.id;
  const other = await prisma.institute.create({ data: { name: `Other Support ${suffix}`, ...activePlan } }); otherInstituteId = other.id;
  const [superAdmin, owner, otherOwner] = await Promise.all([
    prisma.admin.create({ data: { username: `support-super-${suffix}`, password: await bcrypt.hash('test', 4), role: 'SUPER_ADMIN' } }),
    prisma.admin.create({ data: { username: `support-owner-${suffix}`, password: await bcrypt.hash('test', 4), role: 'INSTITUTE_ADMIN', instituteId } }),
    prisma.admin.create({ data: { username: `support-other-${suffix}`, password: await bcrypt.hash('test', 4), role: 'INSTITUTE_ADMIN', instituteId: other.id } })
  ]);
  superToken = jwt.sign({ id: superAdmin.id, username: superAdmin.username, role: superAdmin.role, passwordVersion: 1 }, 'test-secret');
  ownerToken = jwt.sign({ id: owner.id, username: owner.username, role: owner.role, passwordVersion: 1 }, 'test-secret');
  otherToken = jwt.sign({ id: otherOwner.id, username: otherOwner.username, role: otherOwner.role, passwordVersion: 1 }, 'test-secret');
  const app = createApp(); await new Promise<void>(resolve => { server = app.listen(0, resolve); }); baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
after(async () => { await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve())); await prisma.$disconnect(); });
const headers = (token: string) => ({ Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' });

test('institute creates and sees only its own support tickets', async () => {
  const created = await fetch(`${baseUrl}/api/support/tickets`, { method: 'POST', headers: headers(ownerToken), body: JSON.stringify({ category: 'BILLING', subject: 'Renewal not reflected', description: 'Payment completed but the renewal date is still unchanged.', priority: 'HIGH' }) });
  assert.equal(created.status, 201); const ticket = (await created.json() as any).data;
  const list = await fetch(`${baseUrl}/api/support/tickets`, { headers: headers(ownerToken) }); assert.equal(list.status, 200);
  assert.equal((await list.json() as any).data.every((item: any) => item.instituteId === instituteId), true);
  const denied = await fetch(`${baseUrl}/api/support/tickets/${ticket.id}`, { headers: headers(otherToken) }); assert.equal(denied.status, 404);
});

test('support attachments are signature-validated, private, and authorized by ticket ownership', async () => {
  const ticket = await prisma.supportTicket.create({ data: { reference: `SUP-ATT-${Date.now()}`, instituteId, category: 'TECHNICAL', subject: 'Screenshot for support', description: 'Attached is a screenshot showing the issue clearly.' } });
  const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00]);
  const form = new FormData();
  form.append('attachments', new Blob([png], { type: 'image/png' }), 'issue.png');
  const uploaded = await fetch(`${baseUrl}/api/support/tickets/${ticket.id}/attachments`, { method: 'POST', headers: { Authorization: `Bearer ${ownerToken}` }, body: form });
  assert.equal(uploaded.status, 201);
  const attachment = (await uploaded.json() as any).data[0];
  assert.equal(attachment.fileName, 'issue.png');
  assert.equal('storageKey' in attachment, false);

  const ownerDownload = await fetch(`${baseUrl}/api/support/attachments/${attachment.id}`, { headers: { Authorization: `Bearer ${ownerToken}` } });
  assert.equal(ownerDownload.status, 200);
  assert.equal(ownerDownload.headers.get('cache-control'), 'private, no-store');
  assert.deepEqual(Buffer.from(await ownerDownload.arrayBuffer()), png);
  assert.equal((await fetch(`${baseUrl}/api/support/attachments/${attachment.id}`, { headers: { Authorization: `Bearer ${otherToken}` } })).status, 404);
  assert.equal((await fetch(`${baseUrl}/api/support/attachments/${attachment.id}`, { headers: { Authorization: `Bearer ${superToken}` } })).status, 200);

  const spoofed = new FormData();
  spoofed.append('attachments', new Blob([Buffer.from('not-an-image')], { type: 'image/jpeg' }), 'fake.jpg');
  const rejected = await fetch(`${baseUrl}/api/support/tickets/${ticket.id}/attachments`, { method: 'POST', headers: { Authorization: `Bearer ${ownerToken}` }, body: spoofed });
  assert.equal(rejected.status, 400);
  assert.equal((await rejected.json() as any).error, 'INVALID_ATTACHMENT_CONTENT');
});

test('internal notes never leak to institute users and ticket transitions are explicit', async () => {
  const ticket = await prisma.supportTicket.create({ data: { reference: `SUP-VIS-${Date.now()}`, instituteId, category: 'TECHNICAL', subject: 'Dashboard error', description: 'Dashboard shows an unexpected error on load.' } });
  const internal = await fetch(`${baseUrl}/api/super-admin/support/tickets/${ticket.id}/messages`, { method: 'POST', headers: headers(superToken), body: JSON.stringify({ visibility: 'INTERNAL', body: 'Investigating application logs.', expectedUpdatedAt: ticket.updatedAt }) });
  assert.equal(internal.status, 201);
  const ownerView = await fetch(`${baseUrl}/api/support/tickets/${ticket.id}`, { headers: headers(ownerToken) }); const ownerBody = await ownerView.json() as any;
  assert.equal(ownerBody.data.messages.some((message: any) => message.visibility === 'INTERNAL'), false);
  const latest = await prisma.supportTicket.findUniqueOrThrow({ where: { id: ticket.id } });
  const invalidResolve = await fetch(`${baseUrl}/api/super-admin/support/tickets/${ticket.id}/status`, { method: 'PATCH', headers: headers(superToken), body: JSON.stringify({ status: 'RESOLVED', expectedUpdatedAt: latest.updatedAt }) });
  assert.equal(invalidResolve.status, 400);
  const resolved = await fetch(`${baseUrl}/api/super-admin/support/tickets/${ticket.id}/status`, { method: 'PATCH', headers: headers(superToken), body: JSON.stringify({ status: 'RESOLVED', resolutionSummary: 'Renewal state was recomputed and verified with the owner.', expectedUpdatedAt: latest.updatedAt }) });
  assert.equal(resolved.status, 200);
  assert.equal((await prisma.supportTicket.findUniqueOrThrow({ where: { id: ticket.id } })).status, 'RESOLVED');
});

test('Superadmin case notes and follow-up state remain internal and audited', async () => {
  const created = await fetch(`${baseUrl}/api/super-admin/support/cases`, { method: 'POST', headers: headers(superToken), body: JSON.stringify({ instituteId, title: 'Monitor renewal stability', category: 'BILLING', priority: 'HIGH', followUpAt: new Date(Date.now() + 86_400_000).toISOString() }) });
  assert.equal(created.status, 201); const internalCase = (await created.json() as any).data;
  const note = await fetch(`${baseUrl}/api/super-admin/support/cases/${internalCase.id}/notes`, { method: 'POST', headers: headers(superToken), body: JSON.stringify({ body: 'Check again after the next billing worker cycle.' }) });
  assert.equal(note.status, 201);
  const audit = await prisma.superAdminAuditLog.findFirst({ where: { instituteId, action: 'INTERNAL_CASE_CREATED' } }); assert.ok(audit);
  const otherCount = await prisma.internalCase.count({ where: { instituteId: otherInstituteId } }); assert.equal(otherCount, 0);
});
