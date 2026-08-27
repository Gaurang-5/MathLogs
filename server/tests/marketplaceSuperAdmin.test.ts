import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { createApp } from '../src/index';
import { prisma } from '../src/prisma';
import { invalidateAuthCache } from '../src/middleware/auth';

let server: Server;
let baseUrl: string;
let superAdminId: string;
let instituteAdminId: string;
let instituteId: string;
let foreignInstituteId: string;
let pageOnlyAdminId: string;
let pageOnlyInstituteId: string;
let superToken: string;
let instituteToken: string;
let pageOnlyToken: string;

const auth = (token: string) => ({ Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' });

before(async () => {
  const suffix = `${Date.now()}-${Math.random()}`;
  const password = await bcrypt.hash('test', 4);
  const institute = await prisma.institute.create({
    data: {
      name: `Operations ${suffix}`, teacherName: 'Teacher One', phoneNumber: '9000000000', publicPhone: '9000000001',
      whatsappPhone: '9000000002', city: 'Muzaffarnagar', area: 'Gandhi Colony', address: 'One Street', tagline: 'Learn well',
      aboutUs: 'Detailed profile', logoUrl: 'https://example.com/logo.png', subjectsOffered: ['Math'], classesOffered: ['10'],
      ownershipStatus: 'CLAIMED', isPubliclyListed: true, isVerified: false, googleRating: 4.5, googleReviewCount: 20,
      plan: 'ENTERPRISE', planExpiryDate: new Date('2099-01-01T00:00:00Z'), marketplaceAccessGrantedAt: new Date()
    }
  });
  instituteId = institute.id;
  const foreign = await prisma.institute.create({
    data: { name: `Foreign ${suffix}`, ownershipStatus: 'UNCLAIMED', city: 'Muzaffarnagar' }
  });
  foreignInstituteId = foreign.id;
  const pageOnlyInstitute = await prisma.institute.create({
    data: { name: `Marketplace only ${suffix}`, ownershipStatus: 'CLAIMED', plan: 'MARKETPLACE', marketplaceAccessGrantedAt: new Date() }
  });
  pageOnlyInstituteId = pageOnlyInstitute.id;
  const superAdmin = await prisma.admin.create({ data: { username: `super-${suffix}`, password, role: 'SUPER_ADMIN' } });
  superAdminId = superAdmin.id;
  const instituteAdmin = await prisma.admin.create({ data: { username: `owner-${suffix}`, password, role: 'INSTITUTE_ADMIN', instituteId } });
  instituteAdminId = instituteAdmin.id;
  const pageOnlyAdmin = await prisma.admin.create({ data: { username: `page-owner-${suffix}`, password, role: 'INSTITUTE_ADMIN', instituteId: pageOnlyInstituteId } });
  pageOnlyAdminId = pageOnlyAdmin.id;
  superToken = jwt.sign({ id: superAdmin.id, role: superAdmin.role, passwordVersion: 1 }, 'test-secret');
  instituteToken = jwt.sign({ id: instituteAdmin.id, role: instituteAdmin.role, instituteId, passwordVersion: 1 }, 'test-secret');
  pageOnlyToken = jwt.sign({ id: pageOnlyAdmin.id, role: pageOnlyAdmin.role, instituteId: pageOnlyInstituteId, passwordVersion: 1 }, 'test-secret');

  const app = createApp();
  await new Promise<void>((resolve) => { server = app.listen(0, resolve); });
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

after(async () => {
  const allInstituteIds = [instituteId, foreignInstituteId, pageOnlyInstituteId];
  await prisma.marketplaceAuditLog.deleteMany({ where: { instituteId: { in: allInstituteIds } } });
  await prisma.marketplaceClaim.deleteMany({ where: { instituteId: { in: allInstituteIds } } });
  await prisma.leadInquiry.deleteMany({ where: { instituteId: { in: allInstituteIds } } });
  await prisma.review.deleteMany({ where: { instituteId: { in: allInstituteIds } } });
  await prisma.whatsappJob.deleteMany({ where: { instituteId: { in: allInstituteIds } } });
  await prisma.admin.deleteMany({ where: { OR: [{ id: { in: [superAdminId, instituteAdminId, pageOnlyAdminId] } }, { instituteId: { in: allInstituteIds } }] } });
  await prisma.institute.deleteMany({ where: { id: { in: allInstituteIds } } });
  await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  await prisma.$disconnect();
});

test('superadmin endpoints reject anonymous and institute-admin callers', async () => {
  assert.equal((await fetch(`${baseUrl}/api/marketplace/super-admin/claims`)).status, 401);
  assert.equal((await fetch(`${baseUrl}/api/marketplace/super-admin/claims`, { headers: auth(instituteToken) })).status, 403);
});

test('Marketplace-only owners can use Marketplace routes but cannot mutate ERP data', async () => {
  const lead = await prisma.leadInquiry.create({
    data: { instituteId: pageOnlyInstituteId, studentName: 'Page owner lead', phone: '9888877777', deliveryStatus: 'DELIVERED' }
  });

  const profile = await fetch(`${baseUrl}/api/marketplace/admin/profile`, { headers: auth(pageOnlyToken) });
  assert.equal(profile.status, 200);
  const leads = await fetch(`${baseUrl}/api/marketplace/admin/leads`, { headers: auth(pageOnlyToken) });
  assert.equal(leads.status, 200);
  assert.ok(((await leads.json()) as any).data.some((item: any) => item.id === lead.id));
  const profileUpdate = await fetch(`${baseUrl}/api/marketplace/admin/profile`, {
    method: 'PUT', headers: auth(pageOnlyToken), body: JSON.stringify({ tagline: 'Marketplace owner profile' })
  });
  assert.equal(profileUpdate.status, 200);
  const leadUpdate = await fetch(`${baseUrl}/api/marketplace/admin/leads/${lead.id}`, {
    method: 'PATCH', headers: auth(pageOnlyToken), body: JSON.stringify({ status: 'CONTACTED' })
  });
  assert.equal(leadUpdate.status, 200);
  const instituteForUpgrade = await fetch(`${baseUrl}/api/institute/me`, { headers: auth(pageOnlyToken) });
  assert.equal(instituteForUpgrade.status, 200);

  const erpMutation = await fetch(`${baseUrl}/api/students/manual`, {
    method: 'POST', headers: auth(pageOnlyToken), body: '{}'
  });
  assert.equal(erpMutation.status, 403);
  assert.equal(((await erpMutation.json()) as any).error, 'MARKETPLACE_ONLY_ACCESS_RESTRICTED');

  const paidMutation = await fetch(`${baseUrl}/api/students/manual`, {
    method: 'POST', headers: auth(instituteToken), body: '{}'
  });
  assert.notEqual(paidMutation.status, 403);

  await prisma.institute.update({
    where: { id: pageOnlyInstituteId },
    data: { plan: 'ENTERPRISE', planExpiryDate: new Date(Date.now() + 86_400_000) }
  });
  invalidateAuthCache(pageOnlyAdminId);
  const upgradedMutation = await fetch(`${baseUrl}/api/students/manual`, {
    method: 'POST', headers: auth(pageOnlyToken), body: '{}'
  });
  assert.notEqual(upgradedMutation.status, 403);
});

test('owner and superadmin lead APIs never expose legacy claim marker rows', async () => {
  const marker = await prisma.leadInquiry.create({
    data: {
      instituteId: pageOnlyInstituteId,
      studentName: '[CLAIM REQUEST] Legacy Owner',
      phone: '9777766666',
      message: 'legacy claim payload',
      deliveryStatus: 'DELIVERED'
    }
  });

  const ownerList = await fetch(`${baseUrl}/api/marketplace/admin/leads`, { headers: auth(pageOnlyToken) });
  assert.equal(ownerList.status, 200);
  assert.equal(((await ownerList.json()) as any).data.some((item: any) => item.id === marker.id), false);
  const ownerMutation = await fetch(`${baseUrl}/api/marketplace/admin/leads/${marker.id}`, {
    method: 'PATCH', headers: auth(pageOnlyToken), body: JSON.stringify({ status: 'CONTACTED' })
  });
  assert.equal(ownerMutation.status, 404);

  const superList = await fetch(`${baseUrl}/api/marketplace/super-admin/leads`, { headers: auth(superToken) });
  assert.equal(superList.status, 200);
  assert.equal(((await superList.json()) as any).data.some((item: any) => item.id === marker.id), false);
});

test('claim API lists, contacts, rejects, and records notification failure independently', async () => {
  const claim = await prisma.marketplaceClaim.create({
    data: { instituteId: foreignInstituteId, claimantName: 'Riya', phone: '9876543210', normalizedPhone: '9876543210' }
  });
  const list = await fetch(`${baseUrl}/api/marketplace/super-admin/claims?status=open&query=Riya`, { headers: auth(superToken) });
  assert.equal(list.status, 200);
  assert.ok(((await list.json()) as any).data.some((item: any) => item.id === claim.id));

  const contacted = await fetch(`${baseUrl}/api/marketplace/super-admin/claims/${claim.id}/contacted`, { method: 'PATCH', headers: auth(superToken) });
  assert.equal(contacted.status, 200);
  assert.equal(((await contacted.json()) as any).data.status, 'CONTACTED');

  const rejected = await fetch(`${baseUrl}/api/marketplace/super-admin/claims/${claim.id}/reject`, {
    method: 'POST', headers: auth(superToken), body: JSON.stringify({ verificationNote: 'Called registered office', rejectionReason: 'Ownership could not be verified' })
  });
  assert.equal(rejected.status, 200);
  const rejectedBody: any = await rejected.json();
  assert.equal(rejectedBody.data.status, 'REJECTED');
  assert.equal(rejectedBody.data.communicationStatus, 'FAILED');
  assert.equal(rejectedBody.data.rejectionReason, 'Ownership could not be verified');
});

test('claim approval is idempotent and failed communication can be retried without reprovisioning', async () => {
  const claim = await prisma.marketplaceClaim.create({
    data: { instituteId: foreignInstituteId, claimantName: 'Neha', phone: '9765432100', normalizedPhone: '9765432100' }
  });
  const approved = await fetch(`${baseUrl}/api/marketplace/super-admin/claims/${claim.id}/approve`, {
    method: 'POST', headers: auth(superToken), body: JSON.stringify({ verificationNote: 'Matched registration details' })
  });
  assert.equal(approved.status, 200);
  const body: any = await approved.json();
  assert.equal(body.data.status, 'APPROVED');
  assert.equal(body.data.communicationStatus, 'FAILED');
  const institute = await prisma.institute.findUniqueOrThrow({ where: { id: foreignInstituteId } });
  assert.equal(institute.ownershipStatus, 'CLAIMED');
  assert.equal(institute.isVerified, true);
  assert.equal(institute.isPubliclyListed, true);
  const adminCount = await prisma.admin.count({ where: { instituteId: foreignInstituteId } });

  const repeated = await fetch(`${baseUrl}/api/marketplace/super-admin/claims/${claim.id}/approve`, {
    method: 'POST', headers: auth(superToken), body: JSON.stringify({ verificationNote: 'Repeated request' })
  });
  assert.equal(repeated.status, 200);
  assert.equal((await prisma.admin.count({ where: { instituteId: foreignInstituteId } })), adminCount);

  const resend = await fetch(`${baseUrl}/api/marketplace/super-admin/claims/${claim.id}/resend`, {
    method: 'POST', headers: auth(superToken), body: '{}'
  });
  assert.equal(resend.status, 200);
  assert.equal(((await resend.json()) as any).data.communicationRetryCount, 1);
  assert.equal(await prisma.marketplaceAuditLog.count({ where: { entityId: claim.id, action: 'CLAIM_MESSAGE_RETRIED' } }), 1);
});

test('concurrent claim resends enqueue and audit exactly once', async () => {
  const claim = await prisma.marketplaceClaim.create({
    data: {
      instituteId, claimantName: 'Concurrent', phone: '9654321098', normalizedPhone: '9654321098',
      status: 'APPROVED', communicationStatus: 'FAILED'
    }
  });
  process.env.WHATSAPP_PHONE_NUMBER_ID = 'test-phone-number-id';
  process.env.WHATSAPP_ACCESS_TOKEN = 'test-access-token';
  process.env.WHATSAPP_TEMPLATE_MARKETPLACE_CLAIM_APPROVED = 'claim-approved';

  try {
    const responses = await Promise.all([
      fetch(`${baseUrl}/api/marketplace/super-admin/claims/${claim.id}/resend`, { method: 'POST', headers: auth(superToken), body: '{}' }),
      fetch(`${baseUrl}/api/marketplace/super-admin/claims/${claim.id}/resend`, { method: 'POST', headers: auth(superToken), body: '{}' })
    ]);

    assert.deepEqual(responses.map((response) => response.status).sort(), [200, 409]);
    assert.equal(await prisma.whatsappJob.count({
      where: { marketplaceEntityType: 'MarketplaceClaim', marketplaceEntityId: claim.id } as any
    }), 1);
    assert.equal(await prisma.marketplaceAuditLog.count({
      where: { entityId: claim.id, action: 'CLAIM_MESSAGE_RETRIED' }
    }), 1);
  } finally {
    delete process.env.WHATSAPP_PHONE_NUMBER_ID;
    delete process.env.WHATSAPP_ACCESS_TOKEN;
    delete process.env.WHATSAPP_TEMPLATE_MARKETPLACE_CLAIM_APPROVED;
  }
});

test('claim resend repairs NOT_SENT and QUEUED-without-job crash windows', async () => {
  process.env.WHATSAPP_PHONE_NUMBER_ID = 'test-phone-number-id';
  process.env.WHATSAPP_ACCESS_TOKEN = 'test-access-token';
  process.env.WHATSAPP_TEMPLATE_MARKETPLACE_CLAIM_APPROVED = 'claim-approved';

  try {
    for (const [index, communicationStatus] of ['NOT_SENT', 'QUEUED'].entries()) {
      const claim = await prisma.marketplaceClaim.create({
        data: {
          instituteId, claimantName: `Recovery ${communicationStatus}`, phone: `965432109${index}`,
          normalizedPhone: `965432109${index}`, status: 'APPROVED', communicationStatus,
          whatsappJobId: null
        }
      });
      const response = await fetch(`${baseUrl}/api/marketplace/super-admin/claims/${claim.id}/resend`, {
        method: 'POST', headers: auth(superToken), body: '{}'
      });
      assert.equal(response.status, 200);
      const updated: any = (await response.json() as any).data;
      assert.equal(updated.communicationStatus, 'QUEUED');
      assert.ok(updated.whatsappJobId);
    }
  } finally {
    delete process.env.WHATSAPP_PHONE_NUMBER_ID;
    delete process.env.WHATSAPP_ACCESS_TOKEN;
    delete process.env.WHATSAPP_TEMPLATE_MARKETPLACE_CLAIM_APPROVED;
  }
});

test('listing update protects Google data, detects stale edits, and writes audit history', async () => {
  const detail = await fetch(`${baseUrl}/api/marketplace/super-admin/listings/${instituteId}`, { headers: auth(superToken) });
  const original: any = (await detail.json() as any).data;

  const protectedUpdate = await fetch(`${baseUrl}/api/marketplace/super-admin/listings/${instituteId}`, {
    method: 'PATCH', headers: auth(superToken), body: JSON.stringify({ expectedUpdatedAt: original.updatedAt, googleRating: 1 })
  });
  assert.equal(protectedUpdate.status, 400);

  const updated = await fetch(`${baseUrl}/api/marketplace/super-admin/listings/${instituteId}`, {
    method: 'PATCH', headers: auth(superToken), body: JSON.stringify({ expectedUpdatedAt: original.updatedAt, name: 'Operations Updated', isVerified: true })
  });
  assert.equal(updated.status, 200);
  assert.equal(((await updated.json()) as any).data.name, 'Operations Updated');

  const conflict = await fetch(`${baseUrl}/api/marketplace/super-admin/listings/${instituteId}`, {
    method: 'PATCH', headers: auth(superToken), body: JSON.stringify({ expectedUpdatedAt: original.updatedAt, name: 'Stale overwrite' })
  });
  assert.equal(conflict.status, 409);
  assert.equal(((await conflict.json()) as any).data.name, 'Operations Updated');
  assert.equal((await prisma.institute.findUniqueOrThrow({ where: { id: instituteId } })).googleRating, 4.5);
  assert.equal(await prisma.marketplaceAuditLog.count({ where: { instituteId, action: 'LISTING_UPDATED' } }), 1);
});

test('listing update rejects publishing a missing or unsupported city', async () => {
  const detail = await fetch(`${baseUrl}/api/marketplace/super-admin/listings/${instituteId}`, { headers: auth(superToken) });
  const current: any = (await detail.json() as any).data;

  for (const city of ['', 'Jaipur']) {
    const response = await fetch(`${baseUrl}/api/marketplace/super-admin/listings/${instituteId}`, {
      method: 'PATCH',
      headers: auth(superToken),
      body: JSON.stringify({ expectedUpdatedAt: current.updatedAt, city, isPubliclyListed: true })
    });
    assert.equal(response.status, 400);
    assert.match(((await response.json()) as any).message, /Muzaffarnagar|required/i);
  }
});

test('overview, review moderation, lead delivery and activity use dedicated operational state', async () => {
  const review = await prisma.review.create({ data: { instituteId, reviewerName: 'Aman', rating: 4, comment: 'Helpful', status: 'PENDING' } });
  const held = await prisma.leadInquiry.create({ data: { instituteId: foreignInstituteId, studentName: 'Held', phone: '9999999999', deliveryStatus: 'HELD' } });
  const overview = await fetch(`${baseUrl}/api/marketplace/super-admin/overview`, { headers: auth(superToken) });
  const metrics: any = (await overview.json() as any).data.metrics;
  assert.ok(metrics.claimedListings >= 1);
  assert.ok(metrics.pendingReviews >= 1);
  assert.ok(metrics.heldLeads >= 1);

  const moderated = await fetch(`${baseUrl}/api/marketplace/super-admin/reviews/${review.id}`, {
    method: 'PATCH', headers: auth(superToken), body: JSON.stringify({ status: 'APPROVED' })
  });
  assert.equal(moderated.status, 200);
  assert.equal(await prisma.marketplaceAuditLog.count({ where: { entityId: review.id, action: 'REVIEW_MODERATED' } }), 1);

  const leads = await fetch(`${baseUrl}/api/marketplace/super-admin/leads?deliveryStatus=HELD&query=Held`, { headers: auth(superToken) });
  assert.ok(((await leads.json()) as any).data.some((item: any) => item.studentName === 'Held'));
  const released = await fetch(`${baseUrl}/api/marketplace/super-admin/leads/${held.id}/release`, { method: 'POST', headers: auth(superToken) });
  assert.equal(released.status, 200);
  const releasedLead: any = (await released.json() as any).data;
  assert.equal(releasedLead.deliveryStatus, 'FAILED');
  assert.equal(releasedLead.status, 'NEW');
  const retried = await fetch(`${baseUrl}/api/marketplace/super-admin/leads/${held.id}/retry`, { method: 'POST', headers: auth(superToken) });
  assert.equal(retried.status, 200);
  assert.equal(((await retried.json()) as any).data.notificationRetryCount, 1);
  const activity = await fetch(`${baseUrl}/api/marketplace/super-admin/activity?instituteId=${instituteId}`, { headers: auth(superToken) });
  assert.ok(((await activity.json()) as any).data.length >= 2);
});

test('institute owner updates only their own lead using allowed sales states', async () => {
  const own = await prisma.leadInquiry.create({ data: { instituteId, studentName: 'Own', phone: '9888888888', deliveryStatus: 'DELIVERED' } });
  const foreign = await prisma.leadInquiry.create({ data: { instituteId: foreignInstituteId, studentName: 'Foreign', phone: '9777777777', deliveryStatus: 'HELD' } });
  const valid = await fetch(`${baseUrl}/api/marketplace/admin/leads/${own.id}`, {
    method: 'PATCH', headers: auth(instituteToken), body: JSON.stringify({ status: 'CONTACTED' })
  });
  assert.equal(valid.status, 200);
  assert.equal(((await valid.json()) as any).data.status, 'CONTACTED');
  assert.equal((await fetch(`${baseUrl}/api/marketplace/admin/leads/${foreign.id}`, {
    method: 'PATCH', headers: auth(instituteToken), body: JSON.stringify({ status: 'CLOSED' })
  })).status, 404);
  assert.equal((await fetch(`${baseUrl}/api/marketplace/admin/leads/${own.id}`, {
    method: 'PATCH', headers: auth(instituteToken), body: JSON.stringify({ status: 'INVALID' })
  })).status, 400);
});

test('Google unlink is superadmin-only and appends an audit entry', async () => {
  await prisma.institute.update({ where: { id: instituteId }, data: { googlePlaceId: 'place-1' } });
  assert.equal((await fetch(`${baseUrl}/api/marketplace/coaching/${instituteId}/unlink-google-place`, { method: 'POST', headers: auth(instituteToken) })).status, 403);
  const result = await fetch(`${baseUrl}/api/marketplace/coaching/${instituteId}/unlink-google-place`, { method: 'POST', headers: auth(superToken) });
  assert.equal(result.status, 200);
  assert.equal(await prisma.marketplaceAuditLog.count({ where: { instituteId, action: 'GOOGLE_UNLINKED' } }), 1);
});
