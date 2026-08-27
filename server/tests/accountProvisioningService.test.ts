import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { prisma } from '../src/prisma';
import {
  provisionInstitute,
  type ProvisioningInput,
  type ProvisioningActivation
} from '../src/services/accountProvisioningService';

test('public provisioning creates one institute and invite token idempotently', async () => {
  const phone = `9${Math.floor(100000000 + Math.random() * 900000000)}`;
  const input: ProvisioningInput = {
    kind: 'PUBLIC',
    instituteName: 'Alpha Academy',
    ownerName: 'Sunita Rao',
    phone,
    email: `sunita_${Date.now()}@example.com`,
    marketplace: {
      listed: true,
      city: 'Muaffarnagar',
      area: 'Gandhi Colony',
      subjects: ['Math', 'Science']
    }
  };

  const activation: ProvisioningActivation = {
    kind: 'PAID',
    plan: 'QUIZ',
    billingCycle: 'MONTHLY',
    startsAt: new Date(),
    endsAt: new Date(Date.now() + 30 * 86_400_000)
  };

  const first = await prisma.$transaction(tx => provisionInstitute(tx, input, activation));
  assert.ok(first.instituteId);
  assert.ok(first.inviteToken);

  const inst = await prisma.institute.findUniqueOrThrow({ where: { id: first.instituteId } });
  assert.equal(inst.phoneNumber, phone);
  assert.equal(inst.plan, 'QUIZ');
  assert.equal(inst.includedQuizCredits, 5);
  assert.equal(inst.isPubliclyListed, false);
  assert.equal(inst.city, 'Muzaffarnagar');

  // Replay returns the existing institute and valid invite token
  const replay = await prisma.$transaction(tx => provisionInstitute(tx, input, activation));
  assert.equal(replay.instituteId, first.instituteId);
  assert.equal(await prisma.institute.count({ where: { phoneNumber: phone } }), 1);

  // Clean up
  await prisma.inviteToken.deleteMany({ where: { instituteId: first.instituteId } });
  await prisma.institute.delete({ where: { id: first.instituteId } });
});

test('invite provisioning atomically consumes only its bound link', async () => {
  const token = `inv_${crypto.randomUUID().replace(/-/g, '').slice(0, 16)}`;
  const link = await prisma.adminOnboardingLink.create({
    data: {
      token,
      plan: 'ENTERPRISE',
      billingCycle: 'MONTHLY',
      isFreeTrial: true,
      trialDays: 14,
      expiresAt: new Date(Date.now() + 7 * 86_400_000)
    }
  });

  const phone = `9${Math.floor(100000000 + Math.random() * 900000000)}`;
  const input: ProvisioningInput = {
    kind: 'INVITE',
    onboardingLinkId: link.id,
    instituteName: 'Beta Tuition',
    ownerName: 'Rajesh Kumar',
    phone,
    email: `rajesh_${Date.now()}@example.com`
  };

  const ownerIdentityHash = crypto.createHmac('sha256', 'secret').update(phone).digest('hex');
  const trialActivation: ProvisioningActivation = {
    kind: 'TRIAL',
    plan: 'ENTERPRISE',
    ownerIdentityHash,
    startsAt: new Date(),
    endsAt: new Date(Date.now() + 14 * 86_400_000)
  };

  const result = await prisma.$transaction(tx => provisionInstitute(tx, input, trialActivation));
  assert.ok(result.instituteId);

  const updatedLink = await prisma.adminOnboardingLink.findUniqueOrThrow({ where: { id: link.id } });
  assert.equal(updatedLink.status, 'USED');
  assert.equal(updatedLink.instituteId, result.instituteId);

  // Attempting to reuse the consumed link throws error
  const duplicatePhone = `9${Math.floor(100000000 + Math.random() * 900000000)}`;
  const duplicateInput: ProvisioningInput = {
    ...input,
    phone: duplicatePhone
  };
  const duplicateTrialActivation: ProvisioningActivation = {
    kind: 'TRIAL',
    plan: 'ENTERPRISE',
    ownerIdentityHash: crypto.createHmac('sha256', 'secret').update(duplicatePhone).digest('hex'),
    startsAt: new Date(),
    endsAt: new Date(Date.now() + 14 * 86_400_000)
  };
  await assert.rejects(
    () => prisma.$transaction(tx => provisionInstitute(tx, duplicateInput, duplicateTrialActivation)),
    /ONBOARDING_LINK_NOT_AVAILABLE/
  );

  // Clean up
  await prisma.planTrialClaim.deleteMany({ where: { instituteId: result.instituteId } });
  await prisma.inviteToken.deleteMany({ where: { instituteId: result.instituteId } });
  await prisma.adminOnboardingLink.delete({ where: { id: link.id } });
  await prisma.institute.delete({ where: { id: result.instituteId } });
});
