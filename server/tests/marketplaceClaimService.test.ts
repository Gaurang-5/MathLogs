import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import type { Prisma } from '@prisma/client';
import { prisma } from '../src/prisma';
import {
  approveMarketplaceClaim,
  markMarketplaceClaimContacted,
  normalizeMarketplacePhone,
  rejectMarketplaceClaim,
  submitMarketplaceClaim
} from '../src/services/marketplaceClaimService';

const createdInstituteIds: string[] = [];
const createdAdminIds: string[] = [];

const unique = (prefix: string) => `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;

async function createInstitute(config?: Prisma.InputJsonObject) {
  const institute = await prisma.institute.create({
    data: {
      name: unique('Marketplace claim institute'),
      config: config ?? undefined
    }
  });
  createdInstituteIds.push(institute.id);
  return institute;
}

async function createAdmin(instituteId?: string) {
  const admin = await prisma.admin.create({
    data: {
      username: unique('marketplace-admin'),
      password: 'test-password',
      instituteId
    }
  });
  createdAdminIds.push(admin.id);
  return admin;
}

after(async () => {
  for (const instituteId of createdInstituteIds) {
    await prisma.marketplaceAuditLog.deleteMany({ where: { instituteId } });
    await prisma.marketplaceClaim.deleteMany({ where: { instituteId } });
  }

  for (const adminId of createdAdminIds) {
    await prisma.admin.deleteMany({ where: { id: adminId } });
  }

  for (const instituteId of createdInstituteIds) {
    await prisma.institute.deleteMany({ where: { id: instituteId } });
  }

  await prisma.$disconnect();
});

test('normalizes Indian-formatted marketplace phone numbers to digits', () => {
  assert.equal(normalizeMarketplacePhone('+91 98765-43210'), '9876543210');
});

test('rejects marketplace phone numbers outside 10 to 15 digits', async () => {
  const institute = await createInstitute();

  await assert.rejects(
    submitMarketplaceClaim({
      instituteId: institute.id,
      claimantName: 'Rohit Gupta',
      phone: '12345'
    }),
    { message: 'INVALID_PHONE' }
  );
});

test('returns an existing open claim for the same institute and phone', async () => {
  const institute = await createInstitute();

  const firstClaim = await submitMarketplaceClaim({
    instituteId: institute.id,
    claimantName: 'Riya Sharma',
    phone: '+91 98765-43210'
  });
  const repeatedClaim = await submitMarketplaceClaim({
    instituteId: institute.id,
    claimantName: 'Riya Sharma',
    phone: '9876543210'
  });

  assert.equal(repeatedClaim.id, firstClaim.id);
  assert.equal(await prisma.marketplaceClaim.count({ where: { instituteId: institute.id } }), 1);
});

test('concurrent open-claim submissions return one durable claim', async () => {
  const institute = await createInstitute();
  const suffix = `${Date.now()}_${Math.random().toString(16).slice(2)}`;
  const functionName = `test_delay_claim_insert_${suffix}`;
  const triggerName = `test_delay_claim_insert_${suffix}`;

  await prisma.$executeRawUnsafe(`
    CREATE FUNCTION "${functionName}"() RETURNS trigger AS $$
    BEGIN
      PERFORM pg_sleep(0.15);
      RETURN NEW;
    END;
    $$ LANGUAGE plpgsql
  `);
  await prisma.$executeRawUnsafe(`
    CREATE TRIGGER "${triggerName}"
    BEFORE INSERT ON "MarketplaceClaim"
    FOR EACH ROW EXECUTE FUNCTION "${functionName}"()
  `);

  try {
    const claims = await Promise.all(Array.from({ length: 6 }, () => submitMarketplaceClaim({
      instituteId: institute.id,
      claimantName: 'Riya Sharma',
      phone: '+91 98765-43210'
    })));

    assert.equal(new Set(claims.map((claim) => claim.id)).size, 1);
    assert.equal(await prisma.marketplaceClaim.count({ where: { instituteId: institute.id } }), 1);
  } finally {
    await prisma.$executeRawUnsafe(`DROP TRIGGER IF EXISTS "${triggerName}" ON "MarketplaceClaim"`);
    await prisma.$executeRawUnsafe(`DROP FUNCTION IF EXISTS "${functionName}"()`);
  }
});

test('marks a new claim as contacted and records its contact time', async () => {
  const institute = await createInstitute();
  const claim = await submitMarketplaceClaim({
    instituteId: institute.id,
    claimantName: 'Aditya Mehta',
    phone: '9988776655'
  });

  const contactedClaim = await markMarketplaceClaimContacted({ claimId: claim.id });

  assert.equal(contactedClaim.status, 'CONTACTED');
  assert.ok(contactedClaim.contactedAt instanceof Date);
});

test('allows a fresh submission after an approved claim for the same phone', async () => {
  const institute = await createInstitute();
  const actor = await createAdmin();
  const firstClaim = await submitMarketplaceClaim({
    instituteId: institute.id,
    claimantName: 'Neha Malhotra',
    phone: '9898989898'
  });

  await approveMarketplaceClaim({
    claimId: firstClaim.id,
    actorAdminId: actor.id,
    verificationNote: 'Original claim was verified and approved.'
  });
  const freshClaim = await submitMarketplaceClaim({
    instituteId: institute.id,
    claimantName: 'Neha Malhotra',
    phone: '9898989898'
  });

  assert.notEqual(freshClaim.id, firstClaim.id);
  assert.equal(freshClaim.status, 'NEW');
});

test('requires a verification note before approving a claim', async () => {
  const institute = await createInstitute();
  const actor = await createAdmin();
  const claim = await submitMarketplaceClaim({
    instituteId: institute.id,
    claimantName: 'Kavya Joshi',
    phone: '9123456789'
  });

  await assert.rejects(
    approveMarketplaceClaim({ claimId: claim.id, actorAdminId: actor.id, verificationNote: '   ' }),
    { message: 'VERIFICATION_NOTE_REQUIRED' }
  );
});

test('requires a claimant-facing reason before rejecting a claim', async () => {
  const institute = await createInstitute();
  const actor = await createAdmin();
  const claim = await submitMarketplaceClaim({
    instituteId: institute.id,
    claimantName: 'Nikhil Jain',
    phone: '9012345678'
  });

  await assert.rejects(
    rejectMarketplaceClaim({
      claimId: claim.id,
      actorAdminId: actor.id,
      verificationNote: 'The claimant could not verify the listed address.',
      rejectionReason: '   '
    }),
    { message: 'REJECTION_REASON_REQUIRED' }
  );
});

test('does not allow a completed claim to transition again', async () => {
  const institute = await createInstitute();
  const actor = await createAdmin();
  const claim = await submitMarketplaceClaim({
    instituteId: institute.id,
    claimantName: 'Sana Khan',
    phone: '9090909090'
  });

  await approveMarketplaceClaim({
    claimId: claim.id,
    actorAdminId: actor.id,
    verificationNote: 'Verified against the institute registration document.'
  });

  await assert.rejects(
    markMarketplaceClaimContacted({ claimId: claim.id }),
    { message: 'CLAIM_ALREADY_DECIDED' }
  );
});

test('approves ownership without changing an existing linked account or paid plan', async () => {
  const institute = await createInstitute({ planName: 'PREMIUM', preservedSetting: true });
  const existingAdmin = await createAdmin(institute.id);
  const claim = await submitMarketplaceClaim({
    instituteId: institute.id,
    claimantName: 'Ishaan Kapoor',
    phone: '9876501234'
  });
  const actor = await createAdmin();

  const result = await approveMarketplaceClaim({
    claimId: claim.id,
    actorAdminId: actor.id,
    verificationNote: 'Verified with the institute owner on the registered phone number.'
  });
  const refreshedInstitute = await prisma.institute.findUniqueOrThrow({ where: { id: institute.id } });

  assert.equal(result.adminId, existingAdmin.id);
  assert.equal(result.newlyProvisioned, false);
  assert.deepEqual(refreshedInstitute.config, { planName: 'PREMIUM', preservedSetting: true });
  assert.equal(await prisma.admin.count({ where: { instituteId: institute.id } }), 1);
  assert.equal(refreshedInstitute.ownershipStatus, 'CLAIMED');
  assert.equal(refreshedInstitute.claimedPhone, '9876501234');
  assert.equal(refreshedInstitute.isVerified, true);
  assert.equal(refreshedInstitute.isPubliclyListed, true);
  assert.equal(refreshedInstitute.status, 'ACTIVE');

  const auditActions = await prisma.marketplaceAuditLog.findMany({
    where: { instituteId: institute.id },
    orderBy: { createdAt: 'asc' },
    select: { action: true }
  });
  assert.deepEqual(auditActions.map((audit) => audit.action), ['CLAIM_APPROVED', 'LISTING_VERIFIED']);
});

test('provisions one page-only account and preserves existing config values', async () => {
  const institute = await createInstitute({ preservedSetting: 'keep-me' });
  const actor = await createAdmin();
  const claim = await submitMarketplaceClaim({
    instituteId: institute.id,
    claimantName: 'Manav Sood',
    phone: '9765432109'
  });

  const result = await approveMarketplaceClaim({
    claimId: claim.id,
    actorAdminId: actor.id,
    verificationNote: 'Verified the institute owner and contact number.'
  });
  const refreshedInstitute = await prisma.institute.findUniqueOrThrow({ where: { id: institute.id } });
  const provisionedAdmin = await prisma.admin.findUniqueOrThrow({ where: { id: result.adminId } });

  createdAdminIds.push(provisionedAdmin.id);
  assert.equal(result.newlyProvisioned, true);
  assert.equal(provisionedAdmin.username, '9765432109');
  assert.equal(provisionedAdmin.role, 'INSTITUTE_ADMIN');
  assert.deepEqual(refreshedInstitute.config, { preservedSetting: 'keep-me', planName: 'PAGE_ONLY' });
});
