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
let token: string;

before(async () => {
  const suffix = `${Date.now()}-${Math.random()}`;
  const admin = await prisma.admin.create({
    data: { username: `onboarding-super-${suffix}`, password: await bcrypt.hash('test', 4), role: 'SUPER_ADMIN' }
  });
  token = jwt.sign({ id: admin.id, username: admin.username, role: admin.role, passwordVersion: 1 }, 'test-secret');
  const app = createApp();
  await new Promise<void>(resolve => { server = app.listen(0, resolve); });
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

after(async () => {
  await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  await prisma.$disconnect();
});

function headers(key?: string) {
  return {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
    ...(key ? { 'Idempotency-Key': key } : {})
  };
}

function payload(phone: string, name = 'Guided Academy') {
  const emailPhone = phone.replace(/\D/g, '').slice(-10);
  return {
    owner: { name: 'Gita Sharma', phone, email: `gita-${emailPhone}@example.com` },
    institute: { name, city: 'Jaipur', area: 'Malviya Nagar' },
    access: { kind: 'FULL' },
    billing: { plan: 'BASIC', trialDays: 14, discountPercent: 0 },
    limits: { maxStudents: 120, quizCredits: 5 },
    marketplace: { isPubliclyListed: true, isVerified: false }
  };
}

test('onboarding preview normalizes owner login and derives a safe summary without writes', async () => {
  const phone = `98${String(Date.now()).slice(-8)}`;
  const response = await fetch(`${baseUrl}/api/super-admin/institutes/onboarding/preview`, {
    method: 'POST', headers: headers(), body: JSON.stringify(payload(`+91 ${phone}`))
  });
  assert.equal(response.status, 200);
  const body = await response.json() as any;
  assert.equal(body.data.valid, true);
  assert.equal(body.data.summary.owner.loginPhone, phone);
  assert.equal(body.data.summary.billing.plan, 'BASIC');
  assert.equal(await prisma.institute.count({ where: { phoneNumber: phone } }), 0);
});

test('onboarding commit is idempotent, creates a setup invite, and never returns the token', async () => {
  const phone = `97${String(Date.now()).slice(-8)}`;
  const key = `onboard-${Date.now()}`;
  const request = payload(phone, 'Idempotent Academy');
  const first = await fetch(`${baseUrl}/api/super-admin/institutes/onboarding/commit`, {
    method: 'POST', headers: headers(key), body: JSON.stringify(request)
  });
  assert.equal(first.status, 201);
  const firstBody = await first.json() as any;
  const second = await fetch(`${baseUrl}/api/super-admin/institutes/onboarding/commit`, {
    method: 'POST', headers: headers(key), body: JSON.stringify(request)
  });
  assert.equal(second.status, 200);
  const secondBody = await second.json() as any;
  assert.equal(firstBody.data.instituteId, secondBody.data.instituteId);
  assert.equal(JSON.stringify(firstBody).toLowerCase().includes('token'), false);
  const invite = await prisma.inviteToken.findFirst({ where: { instituteId: firstBody.data.instituteId, isUsed: false } });
  assert.ok(invite);
  const institute = await prisma.institute.findUniqueOrThrow({ where: { id: firstBody.data.instituteId } });
  assert.equal(institute.phoneNumber, phone);

  const reused = await fetch(`${baseUrl}/api/super-admin/institutes/onboarding/commit`, {
    method: 'POST', headers: headers(key), body: JSON.stringify(payload(phone, 'Different Request'))
  });
  assert.equal(reused.status, 409);
});

test('import preview reports row-level errors and commit creates only valid rows', async () => {
  const validPhone = `96${String(Date.now()).slice(-8)}`;
  const rows = [payload(validPhone, 'Bulk Valid Academy'), payload('123', 'Bulk Invalid Academy')];
  const preview = await fetch(`${baseUrl}/api/super-admin/institutes/import/preview`, {
    method: 'POST', headers: headers(), body: JSON.stringify({ rows })
  });
  assert.equal(preview.status, 200);
  const previewBody = await preview.json() as any;
  assert.equal(previewBody.data.validRows, 1);
  assert.equal(previewBody.data.errors[0].row, 2);
  assert.equal(previewBody.data.errors[0].field, 'owner.phone');

  const commit = await fetch(`${baseUrl}/api/super-admin/institutes/import/commit`, {
    method: 'POST', headers: headers(`import-${Date.now()}`), body: JSON.stringify({ rows })
  });
  assert.equal(commit.status, 200);
  const commitBody = await commit.json() as any;
  assert.equal(commitBody.data.created.length, 1);
  assert.equal(commitBody.data.failed.length, 1);
  assert.equal(await prisma.institute.count({ where: { name: 'Bulk Invalid Academy' } }), 0);
});
