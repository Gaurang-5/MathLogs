import { Prisma } from '@prisma/client';
import { prisma } from '../prisma';
import { writeSuperAdminAudit } from './superAdminAuditService';
import { claimSuperAdminIdempotency, completeSuperAdminIdempotency } from './superAdminIdempotencyService';
import { isSupportFeatureEnabled } from '../config/featureFlags';

export class SystemServiceError extends Error { constructor(code: string) { super(code); } }

function mask(value: string) {
  if (value.includes('@')) { const [name, domain] = value.split('@'); return `${name.slice(0, 2)}***@${domain}`; }
  return `${value.slice(0, 2)}******${value.slice(-2)}`;
}

export async function getSystemOverview() {
  const startedAt = Date.now();
  const supportEnabled = isSupportFeatureEnabled();
  await prisma.$queryRaw`SELECT 1`;
  const databaseLatencyMs = Date.now() - startedAt;
  const [emailCounts, whatsappCounts, authFailures24h, activeAdminSessions, activeSupportSessions, pendingBillingOperations] = await Promise.all([
    prisma.emailJob.groupBy({ by: ['status'], _count: { _all: true } }),
    prisma.whatsappJob.groupBy({ by: ['status'], _count: { _all: true } }),
    prisma.authenticationEvent.count({ where: { success: false, createdAt: { gte: new Date(Date.now() - 86_400_000) } } }),
    prisma.adminSession.count({ where: { revokedAt: null, expiresAt: { gt: new Date() }, admin: { role: 'SUPER_ADMIN' } } }),
    supportEnabled ? prisma.superAdminSupportSession.count({ where: { endedAt: null, expiresAt: { gt: new Date() } } }) : Promise.resolve(0),
    prisma.superAdminBillingOperation.count({ where: { status: { in: ['PENDING', 'PROCESSING', 'RETRYING'] } } })
  ]);
  const counts = (items: Array<{ status: string; _count: { _all: number } }>) => Object.fromEntries(items.map(item => [item.status.toLowerCase(), item._count._all]));
  const email = counts(emailCounts); const whatsapp = counts(whatsappCounts);
  const failedJobs = (email.failed || 0) + (whatsapp.failed || 0);
  return {
    status: failedJobs > 0 || databaseLatencyMs > 500 ? 'DEGRADED' : 'HEALTHY', database: { status: 'HEALTHY', latencyMs: databaseLatencyMs },
    jobs: { email, whatsapp, failedTotal: failedJobs }, security: { authFailures24h, activeAdminSessions, activeSupportSessions },
    operations: { pendingBillingOperations }, configuration: {
      jwt: Boolean(process.env.JWT_SECRET), email: Boolean(process.env.EMAIL_USER || process.env.NOREPLY_EMAIL_USER),
      whatsapp: Boolean(process.env.WHATSAPP_PHONE_NUMBER_ID && process.env.WHATSAPP_ACCESS_TOKEN),
      razorpay: Boolean(process.env.RAZORPAY_KEY_ID && process.env.RAZORPAY_KEY_SECRET), gemini: Boolean(process.env.GEMINI_API_KEY)
    }
  };
}

export async function listSystemJobs(input: { kind?: string; status?: string; q?: string }) {
  const kind = input.kind?.toUpperCase(); const status = input.status?.toUpperCase() as any;
  const [emailJobs, whatsappJobs] = await Promise.all([
    kind === 'WHATSAPP' ? [] : prisma.emailJob.findMany({ where: { ...(status ? { status } : {}), ...(input.q ? { OR: [{ subject: { contains: input.q, mode: 'insensitive' } }, { superAdminEntityId: { contains: input.q } }] } : {}) }, orderBy: { createdAt: 'desc' }, take: 150 }),
    kind === 'EMAIL' ? [] : prisma.whatsappJob.findMany({ where: { ...(status ? { status } : {}), ...(input.q ? { OR: [{ templateId: { contains: input.q, mode: 'insensitive' } }, { superAdminEntityId: { contains: input.q } }] } : {}) }, orderBy: { createdAt: 'desc' }, take: 150 })
  ]);
  return [
    ...emailJobs.map(job => ({ id: job.id, kind: 'EMAIL' as const, status: job.status, destinationMasked: mask(job.recipient), label: job.subject, attempts: job.attempts, maxAttempts: job.maxAttempts, error: job.error, entityType: job.superAdminEntityType, entityId: job.superAdminEntityId, instituteId: job.instituteId, createdAt: job.createdAt, updatedAt: job.updatedAt })),
    ...whatsappJobs.map(job => ({ id: job.id, kind: 'WHATSAPP' as const, status: job.status, destinationMasked: mask(job.recipient), label: job.templateId, attempts: job.attempts, maxAttempts: job.maxAttempts, error: job.error, entityType: job.superAdminEntityType || job.marketplaceEntityType, entityId: job.superAdminEntityId || job.marketplaceEntityId, instituteId: job.instituteId, createdAt: job.createdAt, updatedAt: job.updatedAt }))
  ].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime()).slice(0, 200);
}

export async function retrySystemJob(input: { kind: string; id: string; actorAdminId: string; correlationId: string; idempotencyKey: string; reason: string }) {
  if (!['EMAIL', 'WHATSAPP'].includes(input.kind)) throw new SystemServiceError('INVALID_JOB_KIND');
  if (input.reason.trim().length < 10) throw new SystemServiceError('REASON_REQUIRED');
  if (!input.idempotencyKey) throw new SystemServiceError('IDEMPOTENCY_KEY_REQUIRED');
  const claim = await claimSuperAdminIdempotency({ actorAdminId: input.actorAdminId, scope: 'SYSTEM_JOB_RETRY', key: input.idempotencyKey, request: { kind: input.kind, id: input.id } });
  if (claim.kind === 'REPLAY') return claim.response;
  const result = await prisma.$transaction(async tx => {
    const model = input.kind === 'EMAIL' ? tx.emailJob : tx.whatsappJob;
    const current = await (model as any).findUnique({ where: { id: input.id } });
    if (!current) throw new SystemServiceError('JOB_NOT_FOUND');
    if (current.status !== 'FAILED') throw new SystemServiceError('JOB_NOT_RETRYABLE');
    const updated = await (model as any).update({ where: { id: input.id }, data: { status: 'PENDING', attempts: 0, error: null } });
    await writeSuperAdminAudit(tx, { action: 'SYSTEM_JOB_RETRIED', entityType: `${input.kind}Job`, entityId: input.id, instituteId: current.instituteId || undefined, actorAdminId: input.actorAdminId, correlationId: input.correlationId, reason: input.reason, before: { status: current.status, attempts: current.attempts, error: current.error }, after: { status: updated.status, attempts: updated.attempts } });
    return { id: updated.id, kind: input.kind, status: updated.status, attempts: updated.attempts };
  });
  await completeSuperAdminIdempotency(claim.recordId, result as unknown as Prisma.InputJsonValue);
  return result;
}

export async function listSystemAudit(input: { q?: string; instituteId?: string; actorAdminId?: string }) {
  const [superAdmin, marketplace] = await Promise.all([
    prisma.superAdminAuditLog.findMany({ where: { ...(input.instituteId ? { instituteId: input.instituteId } : {}), ...(input.actorAdminId ? { actorAdminId: input.actorAdminId } : {}), ...(input.q ? { OR: [{ action: { contains: input.q, mode: 'insensitive' } }, { entityType: { contains: input.q, mode: 'insensitive' } }, { correlationId: { contains: input.q, mode: 'insensitive' } }] } : {}) }, select: { id: true, action: true, entityType: true, entityId: true, instituteId: true, reason: true, correlationId: true, createdAt: true, actorAdmin: { select: { id: true, username: true } } }, orderBy: { createdAt: 'desc' }, take: 250 }),
    prisma.marketplaceAuditLog.findMany({ where: { ...(input.instituteId ? { instituteId: input.instituteId } : {}), ...(input.actorAdminId ? { actorAdminId: input.actorAdminId } : {}), ...(input.q ? { OR: [{ action: { contains: input.q, mode: 'insensitive' } }, { entityType: { contains: input.q, mode: 'insensitive' } }] } : {}) }, select: { id: true, action: true, entityType: true, entityId: true, instituteId: true, createdAt: true, actorAdmin: { select: { id: true, username: true } } }, orderBy: { createdAt: 'desc' }, take: 250 })
  ]);
  return [...superAdmin.map(item => ({ ...item, source: 'SUPER_ADMIN' as const })), ...marketplace.map(item => ({ ...item, reason: null, correlationId: null, source: 'MARKETPLACE' as const }))].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime()).slice(0, 300);
}

export async function listSystemSecurity() {
  const [sessions, events] = await Promise.all([
    prisma.adminSession.findMany({ where: { admin: { role: 'SUPER_ADMIN' } }, select: { id: true, deviceLabel: true, lastSeenAt: true, expiresAt: true, revokedAt: true, createdAt: true, admin: { select: { id: true, username: true } } }, orderBy: { lastSeenAt: 'desc' }, take: 100 }),
    prisma.authenticationEvent.findMany({ where: { OR: [{ admin: { role: 'SUPER_ADMIN' } }, { adminId: null }] }, select: { id: true, eventType: true, success: true, deviceLabel: true, metadata: true, createdAt: true, admin: { select: { id: true, username: true } } }, orderBy: { createdAt: 'desc' }, take: 200 })
  ]);
  return { sessions, events };
}

export async function revokeSystemSession(input: { sessionId: string; actorAdminId: string; correlationId: string; reason: string }) {
  if (input.reason.trim().length < 10) throw new SystemServiceError('REASON_REQUIRED');
  return prisma.$transaction(async tx => {
    const current = await tx.adminSession.findFirst({ where: { id: input.sessionId, admin: { role: 'SUPER_ADMIN' } }, include: { admin: { select: { id: true, username: true } } } });
    if (!current) throw new SystemServiceError('SESSION_NOT_FOUND');
    if (current.revokedAt) throw new SystemServiceError('SESSION_ALREADY_REVOKED');
    const revokedAt = new Date();
    const session = await tx.adminSession.update({ where: { id: current.id }, data: { revokedAt } });
    await tx.refreshToken.deleteMany({ where: { sessionId: current.id } });
    await writeSuperAdminAudit(tx, { action: 'SYSTEM_SESSION_REVOKED', entityType: 'AdminSession', entityId: current.id, actorAdminId: input.actorAdminId, correlationId: input.correlationId, reason: input.reason, before: { adminId: current.adminId, revokedAt: null }, after: { revokedAt } });
    return { id: session.id, revokedAt: session.revokedAt, admin: current.admin };
  });
}
