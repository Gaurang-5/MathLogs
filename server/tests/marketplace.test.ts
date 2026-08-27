import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import { createApp } from '../src/index';
import { prisma } from '../src/prisma';

let server: Server;
let baseUrl: string;
let testInstituteId: string;
let testSlug: string;
let testInstituteName: string;
const facetInstituteIds: string[] = [];

before(async () => {
  try {
    const app = createApp();
    await new Promise<void>((resolve) => {
      server = app.listen(0, () => resolve());
    });
    const address = server.address() as AddressInfo;
    baseUrl = `http://127.0.0.1:${address.port}`;

    // Create test institute for marketplace
    testSlug = `test-coaching-${Date.now()}`;
    testInstituteName = `Apex Mathematics Academy ${testSlug}`;
    const inst = await prisma.institute.create({
      data: {
        name: testInstituteName,
        teacherName: 'Prof. Sharma',
        slug: testSlug,
        phoneNumber: '9876543210',
        publicPhone: '9876543210',
        whatsappPhone: '9876543210',
        city: 'Muzaffarnagar',
        area: 'Gandhi Colony',
        address: '123 Main Street, Muzaffarnagar',
        tagline: 'Excellence in Class 10-12 Mathematics',
        subjectsOffered: ['Mathematics', 'Physics'],
        classesOffered: ['Class 10', 'Class 11', 'Class 12'],
        isPubliclyListed: true,
        isExclusive: true,
        plan: 'ENTERPRISE',
        status: 'ACTIVE'
      }
    });
    testInstituteId = inst.id;

    const facetSuffix = `${Date.now()}-${Math.random()}`;
    const facetInstitutes = await Promise.all([
      prisma.institute.create({ data: {
        name: `Exact Apex ${facetSuffix}`, slug: `exact-apex-${facetSuffix}`, city: 'Muzaffarnagar', area: 'Gandhi Colony',
        subjectsOffered: ['Mathematics'], classesOffered: ['Class 9'], isPubliclyListed: true, status: 'ACTIVE'
      } }),
      prisma.institute.create({ data: {
        name: `Broad Scholar ${facetSuffix}`, slug: `broad-scholar-${facetSuffix}`, city: 'Muzaffarnagar', area: 'New Gandhi Colony',
        subjectsOffered: ['Mathematics Advanced'], classesOffered: ['Class 9 Foundation'], isPubliclyListed: true, status: 'ACTIVE'
      } }),
      prisma.institute.create({ data: {
        name: `Private Apex ${facetSuffix}`, slug: `private-apex-${facetSuffix}`, city: 'Muzaffarnagar', area: 'Gandhi Colony',
        subjectsOffered: ['Mathematics'], classesOffered: ['Class 9'], isPubliclyListed: false, status: 'ACTIVE'
      } }),
      prisma.institute.create({ data: {
        name: `Inactive Apex ${facetSuffix}`, slug: `inactive-apex-${facetSuffix}`, city: 'Muzaffarnagar', area: 'Gandhi Colony',
        subjectsOffered: ['Mathematics'], classesOffered: ['Class 9'], isPubliclyListed: true, status: 'INACTIVE'
      } }),
    ]);
    facetInstituteIds.push(...facetInstitutes.map(item => item.id));
  } catch (err) {
    console.error('Test before setup failed:', err);
    throw err;
  }
});

after(async () => {
  if (testInstituteId) {
    await prisma.review.deleteMany({ where: { instituteId: testInstituteId } });
    await prisma.marketplaceAuditLog.deleteMany({ where: { instituteId: testInstituteId } });
    await prisma.marketplaceClaim.deleteMany({ where: { instituteId: testInstituteId } });
    await prisma.leadInquiry.deleteMany({ where: { instituteId: testInstituteId } });
    await prisma.institute.delete({ where: { id: testInstituteId } });
  }
  if (facetInstituteIds.length) {
    await prisma.institute.deleteMany({ where: { id: { in: facetInstituteIds } } });
  }

  if (server) {
    await new Promise<void>((resolve, reject) => {
      server.close((err) => (err ? reject(err) : resolve()));
    });
  }
  await prisma.$disconnect();
});

test('GET /api/marketplace/search should return listed coachings', async () => {
  const res = await fetch(`${baseUrl}/api/marketplace/search?city=Muzaffarnagar&q=${encodeURIComponent(testInstituteName)}`);
  assert.equal(res.status, 200);

  const body: any = await res.json();
  assert.equal(body.success, true);
  assert.ok(Array.isArray(body.data));
  const found = body.data.find((item: any) => item.id === testInstituteId);
  assert.ok(found);
  assert.equal(found.teacherName, 'Prof. Sharma');
  assert.equal(found.isExclusive, true);
});

test('GET /api/marketplace/search uses case-insensitive exact facet filters', async () => {
  const res = await fetch(`${baseUrl}/api/marketplace/search?city=muzaffarnagar&area=gAnDhI%20cOlOnY&classGrade=cLaSs%209&subject=mAtHeMaTiCs`);
  assert.equal(res.status, 200);
  const body: any = await res.json();
  const matchingFacetFixtures = body.data.filter((item: any) => facetInstituteIds.includes(item.id));
  assert.equal(matchingFacetFixtures.length, 1);
  assert.match(matchingFacetFixtures[0].name, /^Exact Apex/);
  assert.deepEqual(body.availableFilters.cities, ['Muzaffarnagar']);
  assert.ok(body.availableFilters.areas.includes('Gandhi Colony'));
});

test('GET /api/marketplace/coaching/:slug should return public profile details', async () => {
  const res = await fetch(`${baseUrl}/api/marketplace/coaching/${testSlug}`);
  assert.equal(res.status, 200);

  const body: any = await res.json();
  assert.equal(body.success, true);
  assert.equal(body.data.name, testInstituteName);
  assert.equal(body.data.teacherName, 'Prof. Sharma');
  assert.equal(body.data.isExclusive, true);
});

test('POST /api/marketplace/coaching/:id/reviews should submit review', async () => {
  const res = await fetch(`${baseUrl}/api/marketplace/coaching/${testInstituteId}/reviews`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      reviewerName: 'Rohan Verma',
      reviewerRole: 'Student',
      rating: 5,
      comment: 'Best math teacher in Muzaffarnagar! Clear concepts and great guidance.'
    })
  });

  assert.equal(res.status, 201);
  const body: any = await res.json();
  assert.equal(body.success, true);
  assert.equal(body.data.reviewerName, 'Rohan Verma');
  assert.equal(body.data.rating, 5);
});

test('POST /api/marketplace/coaching/:id/inquire should submit lead inquiry', async () => {
  const res = await fetch(`${baseUrl}/api/marketplace/coaching/${testInstituteId}/inquire`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      studentName: 'Ananya Gupta',
      phone: '9988776655',
      subject: 'Mathematics',
      classGrade: 'Class 12',
      message: 'Interested in joining morning batch for Class 12 Boards.'
    })
  });

  assert.equal(res.status, 201);
  const body: any = await res.json();
  assert.equal(body.success, true);
  assert.equal(body.data.studentName, 'Ananya Gupta');
  assert.equal(body.data.deliveryStatus, 'HELD');
  assert.equal(body.data.destinationPhone, undefined);
});

test('POST /api/marketplace/coaching/:id/claim persists a dedicated claim and deduplicates open submissions', async () => {
  const payload = { claimantName: 'Riya Sharma', phone: '+91 98765 43210', email: 'riya@example.com', proofNote: 'I run the center.' };
  const first = await fetch(`${baseUrl}/api/marketplace/coaching/${testInstituteId}/claim`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload)
  });
  const firstBody: any = await first.json();
  assert.equal(first.status, 201);
  assert.equal(firstBody.data.status, 'NEW');
  assert.equal(firstBody.data.email, undefined);
  assert.equal(firstBody.data.proofNote, undefined);

  const repeated = await fetch(`${baseUrl}/api/marketplace/coaching/${testInstituteId}/claim`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload)
  });
  const repeatedBody: any = await repeated.json();
  assert.equal(repeated.status, 200);
  assert.equal(repeatedBody.deduplicated, true);
  assert.equal(repeatedBody.data.id, firstBody.data.id);
  assert.equal(await prisma.leadInquiry.count({ where: { instituteId: testInstituteId, studentName: { startsWith: '[CLAIM REQUEST]' } } }), 0);
});

test('POST /api/marketplace/register-teacher should create new external listing', async () => {
  const username = `extteacher_${Date.now()}`;
  const res = await fetch(`${baseUrl}/api/marketplace/register-teacher`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      coachingName: 'Bright Spark Physics',
      teacherName: 'Dr. Verma',
      username,
      password: 'password123',
      phoneNumber: '9123456789',
      city: 'Muaffarnagar',
      area: 'Civil Lines',
      subjectsOffered: ['Physics'],
      classesOffered: ['Class 11', 'Class 12']
    })
  });

  assert.equal(res.status, 201);
  const body: any = await res.json();
  assert.equal(body.success, true);
  assert.ok(body.token);
  assert.equal(body.institute.teacherName, 'Dr. Verma');
  assert.equal(body.institute.city, 'Muzaffarnagar');

  // Clean up registered test institute and admin
  if (body.institute.id) {
    await prisma.admin.deleteMany({ where: { instituteId: body.institute.id } });
    await prisma.institute.delete({ where: { id: body.institute.id } });
  }
});

test('POST /api/marketplace/register-teacher rejects unsupported marketplace cities', async () => {
  const response = await fetch(`${baseUrl}/api/marketplace/register-teacher`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      coachingName: 'Outside City Academy',
      teacherName: 'Teacher',
      username: `outside-${Date.now()}`,
      password: 'password123',
      phoneNumber: '9123456789',
      city: 'Jaipur',
      subjectsOffered: ['Mathematics'],
      classesOffered: ['Class 9']
    })
  });

  const body = await response.json() as any;
  try {
    assert.equal(response.status, 400);
    assert.match(body.message, /Muzaffarnagar/);
  } finally {
    if (body.institute?.id) {
      await prisma.admin.deleteMany({ where: { instituteId: body.institute.id } });
      await prisma.institute.deleteMany({ where: { id: body.institute.id } });
    }
  }
});
