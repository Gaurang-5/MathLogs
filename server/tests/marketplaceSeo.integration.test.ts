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
let primaryId: string;
let duplicateId: string;
let primarySlug: string;
let duplicateSlug: string;
let adminId: string;
let adminToken: string;
let originalUpdatedAt: Date;
let exactName: string;

before(async () => {
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  exactName = `Manoj Bhatia Coaching Classes ${suffix}`;
  primarySlug = `manoj-bhatia-${suffix}`;
  duplicateSlug = `manoj-bhatia-duplicate-${suffix}`;
  const [primary, duplicate] = await Promise.all([
    prisma.institute.create({ data: {
      name: exactName, slug: primarySlug, teacherName: 'Manoj Bhatia', city: 'Muzaffarnagar', area: 'Gandhi Colony',
      subjectsOffered: ['Mathematics'], classesOffered: ['Class 9'], isPubliclyListed: true, status: 'ACTIVE',
    } }),
    prisma.institute.create({ data: {
      name: exactName, slug: duplicateSlug, teacherName: 'Anita Bhatia', city: 'Muzaffarnagar', area: 'Civil Lines',
      subjectsOffered: ['Science'], classesOffered: ['Class 10'], isPubliclyListed: true, status: 'ACTIVE',
    } }),
  ]);
  primaryId = primary.id;
  duplicateId = duplicate.id;
  originalUpdatedAt = primary.updatedAt;
  const admin = await prisma.admin.create({ data: {
    username: `seo-super-${suffix}`,
    password: await bcrypt.hash('test', 4),
    role: 'SUPER_ADMIN',
  } });
  adminId = admin.id;
  adminToken = jwt.sign({ id: admin.id, username: admin.username, role: admin.role, passwordVersion: 1 }, 'test-secret');

  const app = createApp();
  await new Promise<void>(resolve => { server = app.listen(0, resolve); });
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

after(async () => {
  await prisma.marketplaceAuditLog.deleteMany({ where: { instituteId: { in: [primaryId, duplicateId] } } });
  await prisma.institute.deleteMany({ where: { id: { in: [primaryId, duplicateId] } } });
  await prisma.admin.deleteMany({ where: { id: adminId } });
  await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  await prisma.$disconnect();
});

test('facet HTML exposes canonical data-backed metadata and noindexes empty routes', async () => {
  const path = '/coaching/muzaffarnagar/areas/gandhi-colony/classes/class-9';
  const valid = await fetch(`${baseUrl}${path}`);
  assert.equal(valid.status, 200);
  const html = await valid.text();
  assert.match(html, /<title>Class 9.*Gandhi Colony.*Muzaffarnagar/);
  assert.match(html, new RegExp(`rel="canonical" href="https:\/\/mathlogs\\.app${path}"`));
  assert.match(html, /BreadcrumbList/);
  assert.match(html, new RegExp(exactName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));

  const empty = await fetch(`${baseUrl}/coaching/muzaffarnagar/areas/unknown/classes/class-9`);
  assert.match(await empty.text(), /name="robots" content="noindex, follow"/);

  const redirect = await fetch(`${baseUrl}/coaching/muzaffarnagar`, { redirect: 'manual' });
  assert.equal(redirect.status, 301);
  assert.equal(redirect.headers.get('location'), '/coaching');
});

test('profile HTML leads with exact name, disambiguates duplicates, and preserves slug on rename', async () => {
  const primary = await fetch(`${baseUrl}/coaching/${primarySlug}`);
  const primaryHtml = await primary.text();
  assert.match(primaryHtml, new RegExp(`<title>${exactName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}.*Gandhi Colony.*Manoj Bhatia`));
  assert.match(primaryHtml, /Classes: Class 9/);
  assert.match(primaryHtml, /Subjects: Mathematics/);
  assert.match(primaryHtml, new RegExp(`"name":"${exactName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}"`));

  const duplicateHtml = await (await fetch(`${baseUrl}/coaching/${duplicateSlug}`)).text();
  assert.match(duplicateHtml, /Civil Lines.*Anita Bhatia/);

  const update = await fetch(`${baseUrl}/api/marketplace/super-admin/listings/${primaryId}`, {
    method: 'PATCH',
    headers: { Authorization: `Bearer ${adminToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: `${exactName} Renamed`, expectedUpdatedAt: originalUpdatedAt.toISOString() }),
  });
  assert.equal(update.status, 200);
  const stored = await prisma.institute.findUniqueOrThrow({ where: { id: primaryId }, select: { slug: true } });
  assert.equal(stored.slug, primarySlug);
});

test('dynamic sitemap includes real profile and facet URLs', async () => {
  const xml = await (await fetch(`${baseUrl}/sitemap.xml`)).text();
  assert.match(xml, new RegExp(`/coaching/${primarySlug}`));
  assert.match(xml, /\/coaching\/muzaffarnagar\/areas\/gandhi-colony\/classes\/class-9\/subjects\/mathematics/);
  assert.doesNotMatch(xml, /areas\/unknown/);
});
