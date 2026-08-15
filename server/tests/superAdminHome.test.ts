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
let instituteId: string;

before(async () => {
  const suffix = `${Date.now()}-${Math.random()}`;
  const institute = await prisma.institute.create({
    data: {
      name: `Apex Attention ${suffix}`,
      teacherName: 'Asha Verma',
      phoneNumber: '9876501234',
      email: `apex-${suffix}@example.com`,
      planExpiryDate: new Date(Date.now() + 3 * 86_400_000),
      ownershipStatus: 'UNCLAIMED'
    }
  });
  instituteId = institute.id;
  await prisma.marketplaceClaim.create({
    data: { instituteId, claimantName: 'Riya', phone: '9876543210', normalizedPhone: '9876543210' }
  });
  await prisma.supportTicket.create({
    data: { reference: `SUP-HOME-${Date.now()}`, instituteId, category: 'TECHNICAL', subject: 'Urgent login failure', description: 'The institute owner cannot access the dashboard.', priority: 'URGENT' }
  });
  const admin = await prisma.admin.create({
    data: { username: `home-super-${suffix}`, password: await bcrypt.hash('test', 4), role: 'SUPER_ADMIN' }
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

const headers = () => ({ Authorization: `Bearer ${token}` });

test('Home returns stable metrics, attention, activity, and system contracts', async () => {
  const response = await fetch(`${baseUrl}/api/super-admin/home`, { headers: headers() });
  assert.equal(response.status, 200);
  const body = await response.json() as any;
  assert.deepEqual(Object.keys(body.data), ['metrics', 'attention', 'recentActivity', 'system']);
  assert.ok(body.data.attention.some((item: any) => item.kind === 'CLAIM' && item.severity === 'TODAY' && item.instituteId === instituteId));
  assert.ok(body.data.attention.some((item: any) => item.kind === 'PLAN_EXPIRY' && item.severity === 'TODAY' && item.instituteId === instituteId));
  assert.ok(body.data.attention.some((item: any) => item.kind === 'SUPPORT' && item.severity === 'CRITICAL' && item.instituteId === instituteId));
  assert.ok(body.data.metrics.openSupportTickets >= 1);
});

test('global search requires two characters and returns bounded institute summaries', async () => {
  const short = await fetch(`${baseUrl}/api/super-admin/search?q=A`, { headers: headers() });
  assert.equal(short.status, 400);
  const response = await fetch(`${baseUrl}/api/super-admin/search?q=Apex%20Attention`, { headers: headers() });
  assert.equal(response.status, 200);
  const body = await response.json() as any;
  assert.ok(body.data.some((item: any) => item.instituteId === instituteId && item.name.startsWith('Apex Attention')));
  assert.ok(body.data.length <= 12);
  assert.equal(JSON.stringify(body).includes('websiteConfig'), false);
  assert.equal(JSON.stringify(body).includes('razorpay'), false);
});
