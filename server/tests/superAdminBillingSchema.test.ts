import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

after(async () => {
  await prisma.$disconnect();
});

test('billing and onboarding operation idempotency keys are unique', async () => {
  const suffix = `${Date.now()}-${Math.random()}`;
  const institute = await prisma.institute.create({ data: { name: `Billing Schema ${suffix}` } });
  const actor = await prisma.admin.create({
    data: { username: `billing-schema-${suffix}`, password: 'test-password', role: 'SUPER_ADMIN' }
  });
  const billingData = {
    instituteId: institute.id,
    actorAdminId: actor.id,
    type: 'QUIZ_CREDIT_ADJUSTMENT',
    idempotencyKey: `billing-op-${suffix}`,
    reason: 'Approved service recovery credit',
    request: { delta: 10 },
    status: 'APPLIED'
  };
  const billing = await prisma.superAdminBillingOperation.create({ data: billingData });
  assert.equal(billing.status, 'APPLIED');
  await assert.rejects(() => prisma.superAdminBillingOperation.create({ data: billingData }));

  const onboardingData = {
    actorAdminId: actor.id,
    kind: 'SINGLE',
    idempotencyKey: `onboard-${suffix}`,
    requestHash: 'sha256:request'
  };
  const onboarding = await prisma.superAdminOnboardingOperation.create({ data: onboardingData });
  const row = await prisma.superAdminOnboardingRow.create({
    data: { operationId: onboarding.id, rowNumber: 1, requestHash: 'sha256:row' }
  });
  assert.equal(row.status, 'PENDING');
  await assert.rejects(() => prisma.superAdminOnboardingOperation.create({ data: onboardingData }));
  await assert.rejects(() => prisma.superAdminOnboardingRow.create({
    data: { operationId: onboarding.id, rowNumber: 1, requestHash: 'sha256:row-duplicate' }
  }));
});
