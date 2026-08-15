import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { createApp } from '../src/index';
import { prisma } from '../src/prisma';

let server: Server; let baseUrl: string; let superToken: string; let instituteToken: string; let instituteId: string;
before(async () => { const suffix = `${Date.now()}-${Math.random()}`; const institute = await prisma.institute.create({ data: { name: `Legacy Guard ${suffix}` } }); instituteId = institute.id; const [superAdmin, owner] = await Promise.all([prisma.admin.create({ data: { username: `legacy-super-${suffix}`, password: await bcrypt.hash('test', 4), role: 'SUPER_ADMIN' } }), prisma.admin.create({ data: { username: `legacy-owner-${suffix}`, password: await bcrypt.hash('test', 4), role: 'INSTITUTE_ADMIN', instituteId } })]); superToken = jwt.sign({ id: superAdmin.id, username: superAdmin.username, role: superAdmin.role, passwordVersion: 1 }, 'test-secret'); instituteToken = jwt.sign({ id: owner.id, username: owner.username, role: owner.role, instituteId, passwordVersion: 1 }, 'test-secret'); const app = createApp(); await new Promise<void>(resolve => { server = app.listen(0, resolve); }); baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`; });
after(async () => { await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve())); await prisma.$disconnect(); });
const headers = (token: string) => ({ Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' });

test('legacy global Superadmin reads and mutations are no longer routable', async () => {
  const targets: Array<[string, string]> = [['GET', '/api/institutes'], ['GET', '/api/institutes/analytics'], ['POST', '/api/institutes/bulk-import'], ['PUT', `/api/institutes/${instituteId}/plan`], ['PUT', `/api/institutes/${instituteId}/config`], ['PUT', `/api/institutes/${instituteId}/details`], ['PUT', `/api/institutes/${instituteId}/suspend`], ['PATCH', `/api/institutes/${instituteId}/toggle-listing`], ['GET', '/api/onboarding/leads'], ['POST', '/api/admin-onboarding/create-link'], ['GET', '/api/admin-onboarding/links']];
  for (const token of [instituteToken, superToken]) for (const [method, path] of targets) { const response = await fetch(`${baseUrl}${path}`, { method, headers: headers(token), ...(method !== 'GET' ? { body: '{}' } : {}) }); assert.equal(response.status, 404, `${method} ${path}`); }
});

test('institute-owned routes and the new Superadmin router remain available', async () => {
  assert.equal((await fetch(`${baseUrl}/api/institute/me`, { headers: headers(instituteToken) })).status, 200);
  assert.equal((await fetch(`${baseUrl}/api/super-admin/home`, { headers: headers(superToken) })).status, 200);
});
