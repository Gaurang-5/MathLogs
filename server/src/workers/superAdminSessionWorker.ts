import { prisma } from '../prisma';
import { writeSuperAdminAudit } from '../services/superAdminAuditService';

export async function expireSuperAdminSupportSessions(now = new Date()) {
  const candidates = await prisma.superAdminSupportSession.findMany({ where: { endedAt: null, expiresAt: { lte: now } }, select: { id: true, adminId: true, instituteId: true } });
  let expired = 0;
  for (const candidate of candidates) {
    const changed = await prisma.$transaction(async tx => {
      const result = await tx.superAdminSupportSession.updateMany({ where: { id: candidate.id, endedAt: null, expiresAt: { lte: now } }, data: { endedAt: now, endReason: 'EXPIRED' } });
      if (result.count !== 1) return false;
      await writeSuperAdminAudit(tx, { action: 'SUPPORT_SESSION_EXPIRED', entityType: 'SuperAdminSupportSession', entityId: candidate.id, actorAdminId: candidate.adminId, instituteId: candidate.instituteId, correlationId: `support-expiry:${candidate.id}`, supportSessionId: candidate.id });
      return true;
    });
    if (changed) expired += 1;
  }
  return expired;
}

export function startSuperAdminSessionWorker() {
  const timer = setInterval(() => { void expireSuperAdminSupportSessions(); }, 60_000);
  timer.unref();
  return timer;
}
