import { Prisma } from '@prisma/client';
import { prisma } from '../prisma';
import { invalidateAuthCache } from '../middleware/auth';
import { writeSuperAdminAudit } from './superAdminAuditService';

const instituteDirectorySelect = {
  id: true,
  name: true,
  teacherName: true,
  phoneNumber: true,
  email: true,
  status: true,
  plan: true,
  planExpiryDate: true,
  isQuizOnly: true,
  ownershipStatus: true,
  isPubliclyListed: true,
  updatedAt: true,
  config: true,
  _count: { select: { students: true, batches: true } }
} satisfies Prisma.InstituteSelect;

const instituteOverviewSelect = {
  id: true,
  name: true,
  teacherName: true,
  phoneNumber: true,
  email: true,
  city: true,
  area: true,
  address: true,
  status: true,
  suspensionReason: true,
  plan: true,
  planStartDate: true,
  planExpiryDate: true,
  quizCredits: true,
  isQuizOnly: true,
  config: true,
  ownershipStatus: true,
  isPubliclyListed: true,
  isVerified: true,
  createdAt: true,
  updatedAt: true
} satisfies Prisma.InstituteSelect;

type MutationContext = {
  instituteId: string;
  actorAdminId: string;
  correlationId: string;
  reason: string;
  expectedUpdatedAt: string;
};

export class InstituteServiceError extends Error {
  constructor(code: string, public current?: unknown) {
    super(code);
  }
}

function objectConfig(value: Prisma.JsonValue | null): Record<string, Prisma.JsonValue> {
  if (!value || Array.isArray(value) || typeof value !== 'object') return {};
  return Object.fromEntries(
    Object.entries(value as Prisma.JsonObject).filter((entry): entry is [string, Prisma.JsonValue] => entry[1] !== undefined)
  );
}

function accessKind(institute: { isQuizOnly: boolean; config: Prisma.JsonValue | null }): string {
  const config = objectConfig(institute.config);
  if (institute.isQuizOnly || config.planName === 'QUIZ_ONLY') return 'QUIZ_ONLY';
  if (config.planName === 'PAGE_ONLY' || config.planName === 'listing') return 'PAGE_ONLY';
  return 'FULL';
}

function directoryItem(record: Prisma.InstituteGetPayload<{ select: typeof instituteDirectorySelect }>, openSupportCount = 0) {
  const attention: string[] = [];
  if (record.status !== 'ACTIVE') attention.push('INACTIVE');
  if (record.planExpiryDate && record.planExpiryDate.getTime() < Date.now() + 7 * 86_400_000) attention.push('PLAN_EXPIRY');
  if (record.ownershipStatus === 'UNCLAIMED' && record.isPubliclyListed) attention.push('UNCLAIMED_LISTING');
  if (openSupportCount > 0) attention.push('OPEN_SUPPORT');
  return {
    id: record.id,
    name: record.name,
    teacherName: record.teacherName,
    phoneNumber: record.phoneNumber,
    email: record.email,
    status: record.status,
    plan: record.plan,
    planExpiryDate: record.planExpiryDate,
    accessKind: accessKind(record),
    isQuizOnly: record.isQuizOnly,
    ownershipStatus: record.ownershipStatus,
    isPubliclyListed: record.isPubliclyListed,
    students: record._count.students,
    batches: record._count.batches,
    openSupportCount,
    attention,
    updatedAt: record.updatedAt
  };
}

export async function listSuperAdminInstitutes(input: {
  q?: string;
  status?: string;
  plan?: string;
  ownershipStatus?: string;
  page: number;
  pageSize: number;
}) {
  const where: Prisma.InstituteWhereInput = {
    ...(input.q ? { OR: [
      { name: { contains: input.q, mode: 'insensitive' } },
      { teacherName: { contains: input.q, mode: 'insensitive' } },
      { phoneNumber: { contains: input.q } },
      { email: { contains: input.q, mode: 'insensitive' } },
      { city: { contains: input.q, mode: 'insensitive' } }
    ] } : {}),
    ...(input.status ? { status: input.status } : {}),
    ...(input.plan ? { plan: input.plan as any } : {}),
    ...(input.ownershipStatus ? { ownershipStatus: input.ownershipStatus } : {})
  };
  const [records, total] = await Promise.all([
    prisma.institute.findMany({
      where,
      select: instituteDirectorySelect,
      orderBy: [{ updatedAt: 'desc' }, { id: 'asc' }],
      skip: (input.page - 1) * input.pageSize,
      take: input.pageSize
    }),
    prisma.institute.count({ where })
  ]);
  const instituteIds = records.map(record => record.id);
  const openSessions = instituteIds.length === 0 ? [] : await prisma.superAdminSupportSession.groupBy({
    by: ['instituteId'],
    where: { instituteId: { in: instituteIds }, endedAt: null, expiresAt: { gt: new Date() } },
    _count: { _all: true }
  });
  const supportCounts = new Map(openSessions.map(item => [item.instituteId, item._count._all]));
  return { items: records.map(record => directoryItem(record, supportCounts.get(record.id) || 0)), page: input.page, pageSize: input.pageSize, total };
}

export async function getSuperAdminInstitute(instituteId: string) {
  const institute = await prisma.institute.findUnique({
    where: { id: instituteId },
    select: instituteOverviewSelect
  });
  if (!institute) throw new InstituteServiceError('INSTITUTE_NOT_FOUND');

  const [admins, students, batches, tests, openClaims, pendingReviews, leadCounts, supportSessions, billingOperations, superAdminActivity, marketplaceActivity] = await Promise.all([
    prisma.admin.findMany({
      where: { instituteId },
      select: { id: true, username: true, role: true },
      orderBy: { username: 'asc' }
    }),
    prisma.student.count({ where: { instituteId } }),
    prisma.batch.count({ where: { instituteId } }),
    prisma.test.count({ where: { instituteId } }),
    prisma.marketplaceClaim.count({ where: { instituteId, status: { in: ['NEW', 'CONTACTED'] } } }),
    prisma.review.count({ where: { instituteId, status: 'PENDING', source: 'MATHLOGS' } }),
    prisma.leadInquiry.groupBy({ by: ['deliveryStatus'], where: { instituteId }, _count: { _all: true } }),
    prisma.superAdminSupportSession.findMany({
      where: { instituteId },
      select: { id: true, reason: true, ticketId: true, caseId: true, expiresAt: true, endedAt: true, endReason: true, createdAt: true },
      orderBy: { createdAt: 'desc' }, take: 20
    }),
    prisma.superAdminBillingOperation.findMany({
      where: { instituteId },
      select: { id: true, type: true, reason: true, status: true, effectiveAt: true, appliedAt: true, error: true, createdAt: true },
      orderBy: { createdAt: 'desc' }, take: 20
    }),
    prisma.superAdminAuditLog.findMany({
      where: { instituteId },
      select: { id: true, action: true, entityType: true, entityId: true, reason: true, correlationId: true, createdAt: true, actorAdmin: { select: { id: true, username: true } } },
      orderBy: { createdAt: 'desc' }, take: 25
    }),
    prisma.marketplaceAuditLog.findMany({
      where: { instituteId },
      select: { id: true, action: true, entityType: true, entityId: true, createdAt: true, actorAdmin: { select: { id: true, username: true } } },
      orderBy: { createdAt: 'desc' }, take: 25
    })
  ]);
  const config = objectConfig(institute.config);
  const leads = Object.fromEntries(leadCounts.map(item => [item.deliveryStatus.toLowerCase(), item._count._all]));
  const activity = [
    ...superAdminActivity.map(item => ({ ...item, source: 'SUPER_ADMIN' })),
    ...marketplaceActivity.map(item => ({ ...item, source: 'MARKETPLACE' }))
  ].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime()).slice(0, 25);

  return {
    overview: {
      id: institute.id, name: institute.name, teacherName: institute.teacherName, phoneNumber: institute.phoneNumber,
      email: institute.email, city: institute.city, area: institute.area, address: institute.address,
      status: institute.status, suspensionReason: institute.suspensionReason, accessKind: accessKind(institute),
      createdAt: institute.createdAt, updatedAt: institute.updatedAt
    },
    account: { admins },
    usage: {
      students, batches, tests, maxStudents: typeof config.maxStudents === 'number' ? config.maxStudents : 100,
      quizCredits: institute.quizCredits, isQuizOnly: institute.isQuizOnly,
      allowedClasses: Array.isArray(config.allowedClasses) ? config.allowedClasses : [],
      subjects: Array.isArray(config.subjects) ? config.subjects : [],
      requiresGrades: config.requiresGrades !== false
    },
    billing: {
      plan: institute.plan, planStartDate: institute.planStartDate, planExpiryDate: institute.planExpiryDate,
      operations: billingOperations
    },
    marketplace: {
      ownershipStatus: institute.ownershipStatus, isPubliclyListed: institute.isPubliclyListed,
      isVerified: institute.isVerified, openClaims, pendingReviews
    },
    leads,
    support: { sessions: supportSessions },
    activity
  };
}

function assertMutationBase(input: MutationContext) {
  if (!input.instituteId) throw new InstituteServiceError('INSTITUTE_NOT_FOUND');
  if (!input.expectedUpdatedAt || Number.isNaN(new Date(input.expectedUpdatedAt).getTime())) throw new InstituteServiceError('EXPECTED_UPDATED_AT_REQUIRED');
  if (input.reason.trim().length < 10) throw new InstituteServiceError('REASON_REQUIRED');
}

async function invalidateInstituteAdmins(instituteId: string) {
  const admins = await prisma.admin.findMany({ where: { instituteId }, select: { id: true } });
  admins.forEach(admin => invalidateAuthCache(admin.id));
}

export async function updateSuperAdminInstituteDetails(input: MutationContext & {
  changes: { name?: string; teacherName?: string | null; phoneNumber?: string | null; email?: string | null };
}) {
  assertMutationBase(input);
  if (Object.keys(input.changes).length === 0) throw new InstituteServiceError('NO_CHANGES');
  const current = await prisma.institute.findUnique({ where: { id: input.instituteId }, select: instituteOverviewSelect });
  if (!current) throw new InstituteServiceError('INSTITUTE_NOT_FOUND');
  const result = await prisma.$transaction(async tx => {
    const updated = await tx.institute.updateMany({
      where: { id: input.instituteId, updatedAt: new Date(input.expectedUpdatedAt) },
      data: input.changes
    });
    if (updated.count !== 1) return null;
    const after = await tx.institute.findUniqueOrThrow({ where: { id: input.instituteId }, select: instituteOverviewSelect });
    await writeSuperAdminAudit(tx, {
      action: 'INSTITUTE_DETAILS_UPDATED', entityType: 'Institute', entityId: input.instituteId,
      instituteId: input.instituteId, actorAdminId: input.actorAdminId, correlationId: input.correlationId,
      reason: input.reason.trim(), before: input.changes && Object.fromEntries(Object.keys(input.changes).map(key => [key, (current as any)[key]])),
      after: input.changes && Object.fromEntries(Object.keys(input.changes).map(key => [key, (after as any)[key]]))
    });
    return after;
  });
  if (!result) {
    const latest = await prisma.institute.findUnique({ where: { id: input.instituteId }, select: instituteOverviewSelect });
    throw new InstituteServiceError(latest ? 'STALE_INSTITUTE' : 'INSTITUTE_NOT_FOUND', latest);
  }
  await invalidateInstituteAdmins(input.instituteId);
  return result;
}

export async function updateSuperAdminInstituteConfiguration(input: MutationContext & {
  changes: {
    maxStudents?: number;
    isQuizOnly?: boolean;
    quizCredits?: number;
    allowedClasses?: string[];
    subjects?: string[];
    requiresGrades?: boolean;
  };
}) {
  assertMutationBase(input);
  if (Object.keys(input.changes).length === 0) throw new InstituteServiceError('NO_CHANGES');
  if (input.changes.maxStudents !== undefined && (!Number.isInteger(input.changes.maxStudents) || input.changes.maxStudents < 0 || input.changes.maxStudents > 100_000)) {
    throw new InstituteServiceError('INVALID_MAX_STUDENTS');
  }
  if (input.changes.quizCredits !== undefined && (!Number.isInteger(input.changes.quizCredits) || input.changes.quizCredits < 0 || input.changes.quizCredits > 1_000_000)) {
    throw new InstituteServiceError('INVALID_QUIZ_CREDITS');
  }
  for (const key of ['allowedClasses', 'subjects'] as const) {
    const values = input.changes[key];
    if (values && (values.length > 50 || values.some(value => typeof value !== 'string' || !value.trim() || value.length > 100))) {
      throw new InstituteServiceError('INVALID_CONFIGURATION_LIST');
    }
  }
  const current = await prisma.institute.findUnique({ where: { id: input.instituteId }, select: instituteOverviewSelect });
  if (!current) throw new InstituteServiceError('INSTITUTE_NOT_FOUND');
  const beforeConfig = objectConfig(current.config);
  const nextConfig: Prisma.JsonObject = { ...beforeConfig };
  if (input.changes.maxStudents !== undefined) nextConfig.maxStudents = input.changes.maxStudents;
  if (input.changes.allowedClasses !== undefined) nextConfig.allowedClasses = input.changes.allowedClasses.map(value => value.trim());
  if (input.changes.subjects !== undefined) nextConfig.subjects = input.changes.subjects.map(value => value.trim());
  if (input.changes.requiresGrades !== undefined) nextConfig.requiresGrades = input.changes.requiresGrades;

  const result = await prisma.$transaction(async tx => {
    const updated = await tx.institute.updateMany({
      where: { id: input.instituteId, updatedAt: new Date(input.expectedUpdatedAt) },
      data: {
        config: nextConfig,
        ...(input.changes.isQuizOnly !== undefined ? { isQuizOnly: input.changes.isQuizOnly } : {}),
        ...(input.changes.quizCredits !== undefined ? { quizCredits: input.changes.quizCredits } : {})
      }
    });
    if (updated.count !== 1) return null;
    const after = await tx.institute.findUniqueOrThrow({ where: { id: input.instituteId }, select: instituteOverviewSelect });
    await writeSuperAdminAudit(tx, {
      action: 'INSTITUTE_CONFIGURATION_UPDATED', entityType: 'Institute', entityId: input.instituteId,
      instituteId: input.instituteId, actorAdminId: input.actorAdminId, correlationId: input.correlationId,
      reason: input.reason.trim(),
      before: { config: beforeConfig, isQuizOnly: current.isQuizOnly, quizCredits: current.quizCredits },
      after: { config: objectConfig(after.config), isQuizOnly: after.isQuizOnly, quizCredits: after.quizCredits }
    });
    return after;
  });
  if (!result) {
    const latest = await prisma.institute.findUnique({ where: { id: input.instituteId }, select: instituteOverviewSelect });
    throw new InstituteServiceError(latest ? 'STALE_INSTITUTE' : 'INSTITUTE_NOT_FOUND', latest);
  }
  await invalidateInstituteAdmins(input.instituteId);
  const config = objectConfig(result.config);
  return {
    maxStudents: typeof config.maxStudents === 'number' ? config.maxStudents : 100,
    allowedClasses: Array.isArray(config.allowedClasses) ? config.allowedClasses : [],
    subjects: Array.isArray(config.subjects) ? config.subjects : [],
    requiresGrades: config.requiresGrades !== false,
    isQuizOnly: result.isQuizOnly,
    quizCredits: result.quizCredits,
    updatedAt: result.updatedAt
  };
}
