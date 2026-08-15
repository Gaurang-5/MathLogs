import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { createApp } from '../src/index';
import { prisma } from '../src/prisma';

let server: Server;
let baseUrl: string;
let instituteId: string;
let superToken: string;
let instituteToken: string;

before(async () => {
  const suffix = `${Date.now()}-${Math.random()}`;
  const institute = await prisma.institute.create({
    data: {
      name: `Apex Academy ${suffix}`,
      teacherName: 'Asha Verma',
      phoneNumber: '9876501111',
      email: `apex-${suffix}@example.com`,
      city: 'Pune',
      plan: 'BASIC',
      config: { maxStudents: 125, subjects: ['Math'], allowedClasses: ['9', '10'], requiresGrades: true }
    }
  });
  instituteId = institute.id;
  const superAdmin = await prisma.admin.create({
    data: { username: `institute-super-${suffix}`, password: await bcrypt.hash('test', 4), role: 'SUPER_ADMIN' }
  });
  const instituteAdmin = await prisma.admin.create({
    data: { username: `institute-owner-${suffix}`, password: await bcrypt.hash('test', 4), role: 'INSTITUTE_ADMIN', instituteId }
  });
  superToken = jwt.sign({ id: superAdmin.id, username: superAdmin.username, role: superAdmin.role, passwordVersion: 1 }, 'test-secret');
  instituteToken = jwt.sign({ id: instituteAdmin.id, username: instituteAdmin.username, role: instituteAdmin.role, passwordVersion: 1 }, 'test-secret');
  await prisma.marketplaceClaim.create({
    data: { instituteId, claimantName: 'Riya', phone: '9876543210', normalizedPhone: '9876543210' }
  });
  const app = createApp();
  await new Promise<void>(resolve => { server = app.listen(0, resolve); });
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

after(async () => {
  await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  await prisma.$disconnect();
});

function headers(token = superToken, extra: Record<string, string> = {}) {
  return { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', ...extra };
}

test('directory is paginated, searchable, and restricted to Superadmin', async () => {
  const denied = await fetch(`${baseUrl}/api/super-admin/institutes`, { headers: headers(instituteToken) });
  assert.equal(denied.status, 403);

  const response = await fetch(`${baseUrl}/api/super-admin/institutes?q=Apex%20Academy&status=ACTIVE&page=1&pageSize=25`, { headers: headers() });
  assert.equal(response.status, 200);
  const body = await response.json() as any;
  assert.deepEqual(Object.keys(body.data), ['items', 'page', 'pageSize', 'total']);
  assert.ok(body.data.items.some((item: any) => item.id === instituteId && item.name.startsWith('Apex Academy')));
  assert.ok(body.data.items.every((item: any) => !('razorpaySubscriptionId' in item) && !('config' in item)));
});

test('institute workspace has a stable 360-degree contract without provider credentials', async () => {
  const response = await fetch(`${baseUrl}/api/super-admin/institutes/${instituteId}`, { headers: headers() });
  assert.equal(response.status, 200);
  const body = await response.json() as any;
  assert.deepEqual(Object.keys(body.data), ['overview', 'account', 'usage', 'billing', 'marketplace', 'leads', 'support', 'activity']);
  assert.equal(body.data.overview.id, instituteId);
  assert.equal(body.data.account.admins.length, 1);
  assert.equal(JSON.stringify(body).includes('razorpaySubscriptionId'), false);
  assert.equal(JSON.stringify(body).includes('password'), false);
});

test('structured detail updates reject unknown fields, detect stale edits, and write immutable audit', async () => {
  const detail = await fetch(`${baseUrl}/api/super-admin/institutes/${instituteId}`, { headers: headers() }).then(response => response.json()) as any;
  const expectedUpdatedAt = detail.data.overview.updatedAt;

  const unknown = await fetch(`${baseUrl}/api/super-admin/institutes/${instituteId}/details`, {
    method: 'PATCH', headers: headers(),
    body: JSON.stringify({ expectedUpdatedAt, reason: 'Correct verified contact details', plan: 'PRO' })
  });
  assert.equal(unknown.status, 400);

  const updated = await fetch(`${baseUrl}/api/super-admin/institutes/${instituteId}/details`, {
    method: 'PATCH', headers: headers(undefined, { 'X-Correlation-Id': 'institute-details-test' }),
    body: JSON.stringify({ expectedUpdatedAt, reason: 'Correct verified contact details', teacherName: 'Asha Sharma' })
  });
  assert.equal(updated.status, 200);
  const updatedBody = await updated.json() as any;
  assert.equal(updatedBody.data.teacherName, 'Asha Sharma');

  const stale = await fetch(`${baseUrl}/api/super-admin/institutes/${instituteId}/details`, {
    method: 'PATCH', headers: headers(),
    body: JSON.stringify({ expectedUpdatedAt, reason: 'Second concurrent correction', teacherName: 'Stale Writer' })
  });
  assert.equal(stale.status, 409);
  const staleBody = await stale.json() as any;
  assert.equal(staleBody.error, 'STALE_INSTITUTE');
  assert.equal(staleBody.data.teacherName, 'Asha Sharma');

  const audit = await prisma.superAdminAuditLog.findFirst({
    where: { action: 'INSTITUTE_DETAILS_UPDATED', instituteId }, orderBy: { createdAt: 'desc' }
  });
  assert.equal(audit?.correlationId, 'institute-details-test');
  assert.equal((audit?.after as any).teacherName, 'Asha Sharma');
});

test('structured configuration updates merge allowed values and preserve platform-managed settings', async () => {
  const detail = await fetch(`${baseUrl}/api/super-admin/institutes/${instituteId}`, { headers: headers() }).then(response => response.json()) as any;
  const response = await fetch(`${baseUrl}/api/super-admin/institutes/${instituteId}/configuration`, {
    method: 'PATCH', headers: headers(),
    body: JSON.stringify({
      expectedUpdatedAt: detail.data.overview.updatedAt,
      reason: 'Raise verified capacity for the new academic term',
      maxStudents: 180,
      allowedClasses: ['9', '10', '11'],
      subjects: ['Math', 'Physics'],
      requiresGrades: true
    })
  });
  assert.equal(response.status, 200);
  const body = await response.json() as any;
  assert.equal(body.data.maxStudents, 180);
  assert.deepEqual(body.data.subjects, ['Math', 'Physics']);
  const persisted = await prisma.institute.findUniqueOrThrow({ where: { id: instituteId } });
  assert.equal((persisted.config as any).maxStudents, 180);
  assert.equal(persisted.plan, 'BASIC');
});
