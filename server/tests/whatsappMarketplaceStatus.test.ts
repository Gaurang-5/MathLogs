import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { prisma } from '../src/prisma';
import { processWhatsappJob } from '../src/utils/whatsappWorker';
import { enqueueWhatsApp, enqueueWhatsAppTracked } from '../src/utils/whatsapp';

const instituteIds: string[] = [];

after(async () => {
  if (instituteIds.length) {
    await prisma.marketplaceAuditLog.deleteMany({ where: { instituteId: { in: instituteIds } } });
    await prisma.marketplaceClaim.deleteMany({ where: { instituteId: { in: instituteIds } } });
    await prisma.leadInquiry.deleteMany({ where: { instituteId: { in: instituteIds } } });
    await prisma.institute.deleteMany({ where: { id: { in: instituteIds } } });
  }
  await prisma.$disconnect();
});

async function fixture() {
  const institute = await prisma.institute.create({ data: { name: `WA ${Date.now()} ${Math.random()}` } });
  instituteIds.push(institute.id);
  return institute;
}

test('successful WhatsApp delivery synchronizes a linked claim to SENT', async () => {
  const institute = await fixture();
  const job = await prisma.whatsappJob.create({
    data: { recipient: '919876543210', templateId: 'claim-approved', data: ['Riya', 'Apex', 'https://mathlogs.app/login'], status: 'PROCESSING', attempts: 1, instituteId: institute.id }
  });
  const claim = await prisma.marketplaceClaim.create({
    data: { instituteId: institute.id, claimantName: 'Riya', phone: '9876543210', normalizedPhone: '9876543210', communicationStatus: 'QUEUED', whatsappJobId: job.id }
  });

  await processWhatsappJob(job, async () => ({ data: { messages: [{ id: 'meta-1' }] } }) as any);

  const updatedJob = await prisma.whatsappJob.findUniqueOrThrow({ where: { id: job.id } });
  const updatedClaim = await prisma.marketplaceClaim.findUniqueOrThrow({ where: { id: claim.id } });
  assert.equal(updatedJob.status, 'COMPLETED');
  assert.equal(updatedClaim.communicationStatus, 'SENT');
  assert.ok(updatedClaim.communicationSentAt);
  await prisma.whatsappJob.delete({ where: { id: job.id } });
});

test('exhausted WhatsApp delivery synchronizes a linked lead to FAILED with a bounded error', async () => {
  const institute = await fixture();
  const job = await prisma.whatsappJob.create({
    data: { recipient: '919876543210', templateId: 'marketplace-lead', data: ['Owner', 'Apex', 'Aman', 'Math', 'settings'], status: 'PROCESSING', attempts: 3, instituteId: institute.id }
  });
  const lead = await prisma.leadInquiry.create({
    data: { instituteId: institute.id, studentName: 'Aman', phone: '9988776655', deliveryStatus: 'QUEUED', notificationJobId: job.id }
  });

  await processWhatsappJob(job, async () => { throw new Error('x'.repeat(700)); });

  const updatedJob = await prisma.whatsappJob.findUniqueOrThrow({ where: { id: job.id } });
  const updatedLead = await prisma.leadInquiry.findUniqueOrThrow({ where: { id: lead.id } });
  assert.equal(updatedJob.status, 'FAILED');
  assert.equal(updatedLead.deliveryStatus, 'FAILED');
  assert.equal(updatedLead.notificationError?.length, 500);
  await prisma.whatsappJob.delete({ where: { id: job.id } });
});

test('non-exhausted delivery failure requeues both job and linked marketplace record', async () => {
  const institute = await fixture();
  const job = await prisma.whatsappJob.create({
    data: { recipient: '919876543210', templateId: 'marketplace-lead', data: ['Owner'], status: 'PROCESSING', attempts: 1, instituteId: institute.id }
  });
  const lead = await prisma.leadInquiry.create({
    data: { instituteId: institute.id, studentName: 'Aman', phone: '9988776655', deliveryStatus: 'QUEUED', notificationJobId: job.id }
  });
  await processWhatsappJob(job, async () => { throw new Error('temporary'); });
  assert.equal((await prisma.whatsappJob.findUniqueOrThrow({ where: { id: job.id } })).status, 'PENDING');
  assert.equal((await prisma.leadInquiry.findUniqueOrThrow({ where: { id: lead.id } })).deliveryStatus, 'QUEUED');
  await prisma.whatsappJob.delete({ where: { id: job.id } });
});

test('tracked enqueue returns a job ID while the compatibility wrapper remains boolean', async () => {
  const institute = await fixture();
  const tracked = await enqueueWhatsAppTracked('9876543210', 'test-template', ['one'], institute.id);
  assert.equal(tracked.queued, true);
  assert.ok(tracked.jobId);
  const compatible = await enqueueWhatsApp('9876543210', 'test-template', ['two'], institute.id);
  assert.equal(compatible, true);
  await prisma.whatsappJob.deleteMany({ where: { instituteId: institute.id } });
});
