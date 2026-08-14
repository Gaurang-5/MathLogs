import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import { prisma } from '../src/prisma';
import {
  createMarketplaceLead,
  releaseMarketplaceLead,
  retryMarketplaceLeadNotification
} from '../src/services/marketplaceLeadService';

const instituteIds: string[] = [];
let actorAdminId: string;

before(async () => {
  const actor = await prisma.admin.create({
    data: { username: `lead-actor-${Date.now()}`, password: 'test', role: 'SUPER_ADMIN' }
  });
  actorAdminId = actor.id;
});

after(async () => {
  if (instituteIds.length) {
    const jobs = await prisma.leadInquiry.findMany({ where: { instituteId: { in: instituteIds } }, select: { notificationJobId: true } });
    await prisma.marketplaceAuditLog.deleteMany({ where: { instituteId: { in: instituteIds } } });
    await prisma.leadInquiry.deleteMany({ where: { instituteId: { in: instituteIds } } });
    await prisma.whatsappJob.deleteMany({ where: { id: { in: jobs.flatMap((item) => item.notificationJobId ? [item.notificationJobId] : []) } } });
    await prisma.institute.deleteMany({ where: { id: { in: instituteIds } } });
  }
  if (actorAdminId) await prisma.admin.delete({ where: { id: actorAdminId } });
  await prisma.$disconnect();
});

async function institute(ownershipStatus: 'CLAIMED' | 'UNCLAIMED') {
  const value = await prisma.institute.create({
    data: {
      name: `Lead ${Date.now()} ${Math.random()}`,
      teacherName: 'Ms Rao',
      phoneNumber: '9000000000',
      whatsappPhone: '9111111111',
      ownershipStatus
    }
  });
  instituteIds.push(value.id);
  return value;
}

const leadInput = (instituteId: string, phone = '+91 99887 76655') => ({
  instituteId,
  studentName: 'Aman',
  phone,
  subject: 'Mathematics',
  classGrade: 'Class 10',
  message: 'Morning batch'
});

test('claimed listing queues a teacher notification to WhatsApp phone', async () => {
  const inst = await institute('CLAIMED');
  const calls: any[] = [];
  const result = await createMarketplaceLead(leadInput(inst.id), async (input) => {
    calls.push(input);
    return { queued: true, jobId: 'tracked-job' };
  });

  assert.equal(result.lead.deliveryStatus, 'QUEUED');
  assert.equal(result.lead.destinationPhone, '9111111111');
  assert.equal(result.lead.phone, '9988776655');
  assert.equal(result.lead.notificationJobId, 'tracked-job');
  assert.equal(calls[0].phone, '9111111111');
});

test('unclaimed listing holds contact details without a destination or notification', async () => {
  const inst = await institute('UNCLAIMED');
  let called = false;
  const result = await createMarketplaceLead(leadInput(inst.id), async () => {
    called = true;
    return { queued: true, jobId: 'unexpected' };
  });
  assert.equal(result.lead.deliveryStatus, 'HELD');
  assert.equal(result.lead.destinationPhone, null);
  assert.equal(called, false);
});

test('same normalized phone and institute within 15 minutes points to the first lead', async () => {
  const inst = await institute('UNCLAIMED');
  const first = await createMarketplaceLead(leadInput(inst.id, '9988776655'));
  const second = await createMarketplaceLead(leadInput(inst.id, '+91-99887-76655'));
  assert.equal(first.lead.possibleDuplicate, false);
  assert.equal(second.lead.possibleDuplicate, true);
  assert.equal(second.lead.duplicateOfId, first.lead.id);
});

test('release is rejected while unclaimed and queues after ownership is claimed', async () => {
  const inst = await institute('UNCLAIMED');
  const created = await createMarketplaceLead(leadInput(inst.id));
  await assert.rejects(
    releaseMarketplaceLead({ leadId: created.lead.id, actorAdminId }),
    /INSTITUTE_NOT_CLAIMED/
  );

  await prisma.institute.update({ where: { id: inst.id }, data: { ownershipStatus: 'CLAIMED' } });
  const released = await releaseMarketplaceLead(
    { leadId: created.lead.id, actorAdminId },
    async () => ({ queued: true, jobId: 'release-job' })
  );
  assert.equal(released.deliveryStatus, 'QUEUED');
  assert.ok(released.releasedAt);
  assert.equal(released.status, 'NEW');
});

test('retry requires a failed delivery and does not change owner sales status', async () => {
  const inst = await institute('CLAIMED');
  const created = await createMarketplaceLead(leadInput(inst.id), async () => ({ queued: false, error: 'offline' }));
  const retried = await retryMarketplaceLeadNotification(
    { leadId: created.lead.id, actorAdminId },
    async () => ({ queued: true, jobId: 'retry-job' })
  );
  assert.equal(retried.deliveryStatus, 'QUEUED');
  assert.equal(retried.notificationRetryCount, 1);
  assert.equal(retried.status, 'NEW');
});
