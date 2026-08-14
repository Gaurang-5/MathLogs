import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { prisma } from '../src/prisma';

const uniqueName = () => `Marketplace Schema ${Date.now()}-${Math.random()}`;

let instituteId: string | undefined;
let adminId: string | undefined;

after(async () => {
  if (instituteId) {
    await prisma.marketplaceAuditLog.deleteMany({ where: { instituteId } });
    await prisma.marketplaceClaim.deleteMany({ where: { instituteId } });
    await prisma.institute.delete({ where: { id: instituteId } });
  }

  if (adminId) {
    await prisma.admin.delete({ where: { id: adminId } });
  }

  await prisma.$disconnect();
});

test('persists marketplace claim and audit state', async () => {
  const institute = await prisma.institute.create({
    data: { name: uniqueName(), ownershipStatus: 'UNCLAIMED' }
  });
  instituteId = institute.id;

  const claim = await prisma.marketplaceClaim.create({
    data: {
      instituteId: institute.id,
      claimantName: 'Riya Sharma',
      phone: '+91 98765 43210',
      normalizedPhone: '9876543210'
    }
  });

  assert.equal(claim.status, 'NEW');
  assert.equal(claim.communicationStatus, 'NOT_SENT');

  const actor = await prisma.admin.create({
    data: {
      username: `marketplace-auditor-${Date.now()}-${Math.random()}`,
      password: 'test-password'
    }
  });
  adminId = actor.id;

  const auditLog = await prisma.marketplaceAuditLog.create({
    data: {
      action: 'CLAIM_CREATED',
      entityType: 'MarketplaceClaim',
      entityId: claim.id,
      actorAdminId: actor.id,
      instituteId: institute.id
    },
    include: { actorAdmin: true, institute: true }
  });

  assert.equal(auditLog.actorAdmin?.id, actor.id);
  assert.equal(auditLog.institute?.id, institute.id);
});
