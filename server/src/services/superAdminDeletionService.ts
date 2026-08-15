import { Prisma } from '@prisma/client';
import { prisma } from '../prisma';
import { writeSuperAdminAudit } from './superAdminAuditService';
import { claimSuperAdminIdempotency, completeSuperAdminIdempotency } from './superAdminIdempotencyService';

export class DeletionServiceError extends Error { constructor(code: string, public current?: unknown) { super(code); } }
const DELAY_MS = 7 * 86_400_000;

function validate(value: unknown) { const input = value && typeof value === 'object' ? value as Record<string, unknown> : {}; const typedName = String(input.typedName || '').trim(); const reason = String(input.reason || '').trim(); if (reason.length < 10) throw new DeletionServiceError('REASON_REQUIRED'); return { typedName, reason }; }

export async function scheduleInstituteDeletion(input: { instituteId: string; value: unknown; actorAdminId: string; correlationId: string; idempotencyKey: string }) {
  if (!input.idempotencyKey) throw new DeletionServiceError('IDEMPOTENCY_KEY_REQUIRED');
  const request = validate(input.value);
  const claim = await claimSuperAdminIdempotency({ actorAdminId: input.actorAdminId, scope: 'INSTITUTE_DELETE_SCHEDULE', key: input.idempotencyKey, request: { instituteId: input.instituteId, ...request } });
  if (claim.kind === 'REPLAY') return claim.response;
  const result = await prisma.$transaction(async tx => {
    const institute = await tx.institute.findUnique({ where: { id: input.instituteId }, select: { id: true, name: true, status: true, areRegistrationsPaused: true } });
    if (!institute) throw new DeletionServiceError('INSTITUTE_NOT_FOUND');
    if (request.typedName !== institute.name) throw new DeletionServiceError('INSTITUTE_NAME_CONFIRMATION_MISMATCH');
    const existing = await tx.superAdminDeletionRequest.findFirst({ where: { instituteId: institute.id, status: 'SCHEDULED' }, orderBy: { createdAt: 'desc' } });
    if (existing) throw new DeletionServiceError('DELETION_ALREADY_SCHEDULED', existing);
    const deletion = await tx.superAdminDeletionRequest.create({ data: { instituteId: institute.id, requestedById: input.actorAdminId, reason: request.reason, instituteName: institute.name, previousInstituteStatus: institute.status, previousRegistrationsPaused: institute.areRegistrationsPaused, eligibleAt: new Date(Date.now() + DELAY_MS) } });
    await tx.institute.update({ where: { id: institute.id }, data: { status: 'INACTIVE', areRegistrationsPaused: true } });
    await tx.batch.updateMany({ where: { instituteId: institute.id }, data: { isRegistrationOpen: false } });
    await writeSuperAdminAudit(tx, { action: 'INSTITUTE_DELETION_SCHEDULED', entityType: 'SuperAdminDeletionRequest', entityId: deletion.id, instituteId: institute.id, actorAdminId: input.actorAdminId, correlationId: input.correlationId, reason: request.reason, before: institute, after: { status: 'INACTIVE', eligibleAt: deletion.eligibleAt } });
    return deletion;
  });
  await completeSuperAdminIdempotency(claim.recordId, result as unknown as Prisma.InputJsonValue);
  return result;
}

export async function cancelInstituteDeletion(input: { instituteId: string; actorAdminId: string; correlationId: string; reason: string }) {
  if (input.reason.trim().length < 10) throw new DeletionServiceError('REASON_REQUIRED');
  return prisma.$transaction(async tx => {
    const current = await tx.superAdminDeletionRequest.findFirst({ where: { instituteId: input.instituteId, status: 'SCHEDULED' }, orderBy: { createdAt: 'desc' } });
    if (!current) throw new DeletionServiceError('DELETION_NOT_FOUND');
    const cancelledAt = new Date();
    const deletion = await tx.superAdminDeletionRequest.update({ where: { id: current.id }, data: { status: 'CANCELLED', cancelledAt } });
    await tx.institute.update({ where: { id: input.instituteId }, data: { status: current.previousInstituteStatus, areRegistrationsPaused: current.previousRegistrationsPaused } });
    await writeSuperAdminAudit(tx, { action: 'INSTITUTE_DELETION_CANCELLED', entityType: 'SuperAdminDeletionRequest', entityId: current.id, instituteId: input.instituteId, actorAdminId: input.actorAdminId, correlationId: input.correlationId, reason: input.reason, before: { status: 'SCHEDULED' }, after: { status: 'CANCELLED', restoredInstituteStatus: current.previousInstituteStatus } });
    return deletion;
  });
}

export async function finalizeInstituteDeletion(input: { instituteId: string; value: unknown; actorAdminId: string; correlationId: string }) {
  const request = validate(input.value);
  return prisma.$transaction(async tx => {
    const deletion = await tx.superAdminDeletionRequest.findFirst({ where: { instituteId: input.instituteId, status: 'SCHEDULED' }, orderBy: { createdAt: 'desc' } });
    if (!deletion) throw new DeletionServiceError('DELETION_NOT_FOUND');
    if (request.typedName !== deletion.instituteName) throw new DeletionServiceError('INSTITUTE_NAME_CONFIRMATION_MISMATCH');
    if (deletion.eligibleAt > new Date()) throw new DeletionServiceError('DELETION_DELAY_NOT_ELAPSED', deletion);
    const claimed = await tx.superAdminDeletionRequest.updateMany({ where: { id: deletion.id, status: 'SCHEDULED', eligibleAt: { lte: new Date() } }, data: { status: 'PROCESSING' } });
    if (claimed.count !== 1) throw new DeletionServiceError('DELETION_NOT_AVAILABLE');
    const institute = await tx.institute.findUnique({ where: { id: input.instituteId }, select: { id: true, name: true, status: true, createdAt: true, _count: { select: { admins: true, students: true, batches: true, tests: true, supportTickets: true, leadInquiries: true } } } });
    if (!institute) throw new DeletionServiceError('INSTITUTE_NOT_FOUND');
    await writeSuperAdminAudit(tx, { action: 'INSTITUTE_DELETION_FINALIZED', entityType: 'Institute', entityId: institute.id, instituteId: institute.id, actorAdminId: input.actorAdminId, correlationId: input.correlationId, reason: request.reason, before: institute, after: { deletionRequestId: deletion.id, status: 'COMPLETED' } });
    const adminIds = (await tx.admin.findMany({ where: { instituteId: institute.id }, select: { id: true } })).map(item => item.id);
    await tx.supportTicket.deleteMany({ where: { instituteId: institute.id } });
    await tx.internalCase.deleteMany({ where: { instituteId: institute.id } });
    await tx.feePayment.deleteMany({ where: { student: { instituteId: institute.id } } });
    await tx.feeRecord.deleteMany({ where: { student: { instituteId: institute.id } } });
    await tx.mark.deleteMany({ where: { student: { instituteId: institute.id } } });
    await tx.student.deleteMany({ where: { instituteId: institute.id } });
    await tx.feeInstallment.deleteMany({ where: { batch: { instituteId: institute.id } } });
    await tx.onlineQuiz.deleteMany({ where: { instituteId: institute.id } });
    await tx.test.deleteMany({ where: { instituteId: institute.id } });
    await tx.batch.deleteMany({ where: { instituteId: institute.id } });
    if (adminIds.length) await tx.marketplaceAuditLog.updateMany({ where: { actorAdminId: { in: adminIds } }, data: { actorAdminId: null } });
    await tx.admin.deleteMany({ where: { instituteId: institute.id } });
    await tx.inviteToken.deleteMany({ where: { instituteId: institute.id } });
    await tx.institute.delete({ where: { id: institute.id } });
    const completedAt = new Date();
    return tx.superAdminDeletionRequest.update({ where: { id: deletion.id }, data: { status: 'COMPLETED', completedAt, instituteId: null } });
  });
}

export async function getInstituteDeletion(instituteId: string) { return prisma.superAdminDeletionRequest.findFirst({ where: { instituteId }, orderBy: { createdAt: 'desc' } }); }
