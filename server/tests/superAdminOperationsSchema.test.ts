import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
after(async () => prisma.$disconnect());

test('persists support, consent, and targeted communication state', async () => {
  const suffix = `${Date.now()}-${Math.random()}`;
  const institute = await prisma.institute.create({ data: { name: `Operations Schema ${suffix}` } });
  const actor = await prisma.admin.create({ data: { username: `operations-schema-${suffix}`, password: 'test', role: 'SUPER_ADMIN' } });
  const ticket = await prisma.supportTicket.create({
    data: { reference: `SUP-${suffix}`, instituteId: institute.id, category: 'BILLING', subject: 'Renewal not reflected', description: 'Payment completed but renewal date is unchanged.', priority: 'HIGH' }
  });
  const message = await prisma.supportMessage.create({ data: { ticketId: ticket.id, authorAdminId: actor.id, visibility: 'INTERNAL', body: 'Verify provider settlement before replying.' } });
  const internalCase = await prisma.internalCase.create({ data: { instituteId: institute.id, title: 'Renewal investigation', category: 'BILLING' } });
  await prisma.internalCaseNote.create({ data: { caseId: internalCase.id, authorAdminId: actor.id, body: 'Cross-check subscription and manual references.' } });
  const preference = await prisma.instituteCommunicationPreference.create({ data: { instituteId: institute.id, whatsappOperational: true, consentSource: 'OWNER_SETTINGS', whatsappConsentedAt: new Date() } });
  const send = await prisma.targetedCommunicationSend.create({
    data: { channel: 'WHATSAPP', templateName: 'trial_expiring', audienceDefinition: { plan: 'ENTERPRISE', expiresWithinDays: 7 }, reason: 'Notify expiring trial institutes', idempotencyKey: `send-${suffix}`, createdByAdminId: actor.id }
  });
  const recipient = await prisma.targetedCommunicationRecipient.create({ data: { sendId: send.id, instituteId: institute.id, destination: '919876543210', variables: ['Operations Schema', '7'] } });
  assert.equal(ticket.status, 'NEW');
  assert.equal(message.visibility, 'INTERNAL');
  assert.equal(internalCase.status, 'OPEN');
  assert.equal(preference.whatsappOperational, true);
  assert.equal(send.status, 'DRAFT');
  assert.equal(recipient.status, 'PENDING');
});
