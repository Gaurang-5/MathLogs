import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

after(async () => {
  await prisma.$disconnect();
});

test('persists immutable Superadmin security and session state', async () => {
  const suffix = `${Date.now()}-${Math.random()}`;
  const institute = await prisma.institute.create({
    data: { name: `Security Test ${suffix}` }
  });
  const actor = await prisma.admin.create({
    data: {
      username: `security-test-${suffix}`,
      password: 'test-password',
      role: 'SUPER_ADMIN'
    }
  });

  const challenge = await prisma.superAdminReauthChallenge.create({
    data: {
      adminId: actor.id,
      actionClass: 'SUPPORT_SESSION',
      otpHash: 'bcrypt-hash',
      expiresAt: new Date(Date.now() + 300_000)
    }
  });
  const supportSession = await prisma.superAdminSupportSession.create({
    data: {
      adminId: actor.id,
      instituteId: institute.id,
      reason: 'Investigate support ticket SUP-1',
      expiresAt: new Date(Date.now() + 900_000)
    }
  });
  const adminSession = await prisma.adminSession.create({
    data: {
      adminId: actor.id,
      deviceLabel: 'Safari on macOS',
      ipHash: 'sha256:abc',
      expiresAt: new Date(Date.now() + 86_400_000)
    }
  });
  const refreshToken = await prisma.refreshToken.create({
    data: {
      token: `refresh-${suffix}`,
      adminId: actor.id,
      sessionId: adminSession.id,
      expiresAt: new Date(Date.now() + 86_400_000)
    }
  });
  const authEvent = await prisma.authenticationEvent.create({
    data: {
      adminId: actor.id,
      eventType: 'LOGIN',
      success: true,
      ipHash: 'sha256:abc',
      deviceLabel: 'Safari on macOS'
    }
  });
  const idempotency = await prisma.superAdminIdempotencyRecord.create({
    data: {
      actorAdminId: actor.id,
      scope: 'SYSTEM_JOB_RETRY',
      key: `retry-${suffix}`,
      requestHash: 'sha256:retry',
      expiresAt: new Date(Date.now() + 86_400_000)
    }
  });
  const audit = await prisma.superAdminAuditLog.create({
    data: {
      action: 'SUPPORT_SESSION_STARTED',
      entityType: 'Institute',
      entityId: institute.id,
      actorAdminId: actor.id,
      instituteId: institute.id,
      reason: 'Investigate support ticket SUP-1',
      correlationId: `corr-${suffix}`,
      supportSessionId: supportSession.id
    }
  });

  assert.equal(challenge.attempts, 0);
  assert.equal(challenge.lockedAt, null);
  assert.equal(supportSession.endReason, null);
  assert.equal(adminSession.revokedAt, null);
  assert.equal(refreshToken.sessionId, adminSession.id);
  assert.equal(authEvent.success, true);
  assert.equal(idempotency.status, 'PENDING');
  assert.equal(audit.supportSessionId, supportSession.id);

  await assert.rejects(
    prisma.superAdminAuditLog.update({
      where: { id: audit.id },
      data: { reason: 'rewritten' }
    })
  );
  await assert.rejects(
    prisma.superAdminAuditLog.delete({ where: { id: audit.id } })
  );
});
