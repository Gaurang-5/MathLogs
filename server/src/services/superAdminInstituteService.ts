import crypto from 'node:crypto';
import { Prisma } from '@prisma/client';
import { prisma } from '../prisma';
import { invalidateAuthCache } from '../middleware/auth';
import { writeSuperAdminAudit } from './superAdminAuditService';
import type { BillingCycle, CanonicalPlan } from '../domain/plans/planCatalog';
import { includedCreditPeriod } from '../domain/plans/entitlements';

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
  const openTickets = instituteIds.length === 0 ? [] : await prisma.supportTicket.groupBy({
    by: ['instituteId'],
    where: { instituteId: { in: instituteIds }, status: { not: 'CLOSED' } },
    _count: { _all: true }
  });
  const supportCounts = new Map(openTickets.map(item => [item.instituteId, item._count._all]));
  return { items: records.map(record => directoryItem(record, supportCounts.get(record.id) || 0)), page: input.page, pageSize: input.pageSize, total };
}

export async function getSuperAdminInstitute(instituteId: string) {
  const institute = await prisma.institute.findUnique({
    where: { id: instituteId },
    select: instituteOverviewSelect
  });
  if (!institute) throw new InstituteServiceError('INSTITUTE_NOT_FOUND');

  const [admins, students, batches, tests, openClaims, pendingReviews, leadCounts, supportTickets, internalCases, supportSessions, billingOperations, superAdminActivity, marketplaceActivity] = await Promise.all([
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
    prisma.supportTicket.findMany({
      where: { instituteId },
      select: { id: true, reference: true, category: true, subject: true, priority: true, status: true, resolvedAt: true, closedAt: true, createdAt: true, updatedAt: true },
      orderBy: { updatedAt: 'desc' }, take: 25
    }),
    prisma.internalCase.findMany({
      where: { instituteId },
      select: { id: true, title: true, category: true, priority: true, status: true, followUpAt: true, linkedType: true, linkedId: true, createdAt: true, updatedAt: true },
      orderBy: { updatedAt: 'desc' }, take: 25
    }),
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
    support: { tickets: supportTickets, cases: internalCases, sessions: supportSessions },
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
    allowedClasses?: string[];
    subjects?: string[];
    requiresGrades?: boolean;
  };
}) {
  assertMutationBase(input);
  if (Object.keys(input.changes).length === 0) throw new InstituteServiceError('NO_CHANGES');
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
  if (input.changes.allowedClasses !== undefined) nextConfig.allowedClasses = input.changes.allowedClasses.map(value => value.trim());
  if (input.changes.subjects !== undefined) nextConfig.subjects = input.changes.subjects.map(value => value.trim());
  if (input.changes.requiresGrades !== undefined) nextConfig.requiresGrades = input.changes.requiresGrades;

  const result = await prisma.$transaction(async tx => {
    const updated = await tx.institute.updateMany({
      where: { id: input.instituteId, updatedAt: new Date(input.expectedUpdatedAt) },
      data: { config: nextConfig }
    });
    if (updated.count !== 1) return null;
    const after = await tx.institute.findUniqueOrThrow({ where: { id: input.instituteId }, select: instituteOverviewSelect });
    await writeSuperAdminAudit(tx, {
      action: 'INSTITUTE_CONFIGURATION_UPDATED', entityType: 'Institute', entityId: input.instituteId,
      instituteId: input.instituteId, actorAdminId: input.actorAdminId, correlationId: input.correlationId,
      reason: input.reason.trim(),
      before: { config: beforeConfig },
      after: { config: objectConfig(after.config) }
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
    unlimitedStudents: true,
    allowedClasses: Array.isArray(config.allowedClasses) ? config.allowedClasses : [],
    subjects: Array.isArray(config.subjects) ? config.subjects : [],
    requiresGrades: config.requiresGrades !== false,
    updatedAt: result.updatedAt
  };
}

export type InstituteOnboardingInput = {
  owner: { name: string; phone: string; email?: string };
  institute: { name: string; city?: string; area?: string; address?: string };
  subscription: { plan: CanonicalPlan; billingCycle: BillingCycle; startTrial: boolean };
  marketplace: { isPubliclyListed: boolean; isVerified: boolean };
};

type NormalizedOnboarding = InstituteOnboardingInput & {
  owner: InstituteOnboardingInput['owner'] & { phone: string };
};

export type OnboardingValidationError = { field: string; code: string; message: string };

function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => [key, canonical(item)]));
  }
  return value;
}

function requestHash(value: unknown): string {
  return crypto.createHash('sha256').update(JSON.stringify(canonical(value))).digest('hex');
}

function normalizeIndianPhone(value: unknown): string {
  let phone = String(value || '').replace(/\D/g, '');
  if (phone.length === 12 && phone.startsWith('91')) phone = phone.slice(2);
  if (phone.length === 11 && phone.startsWith('0')) phone = phone.slice(1);
  return phone;
}

export function previewInstituteOnboarding(value: unknown): {
  valid: boolean;
  errors: OnboardingValidationError[];
  normalized?: NormalizedOnboarding;
  summary?: unknown;
} {
  const input = value && typeof value === 'object' && !Array.isArray(value) ? value as any : {};
  const errors: OnboardingValidationError[] = [];
  const phone = normalizeIndianPhone(input.owner?.phone);
  const ownerName = String(input.owner?.name || '').trim();
  const email = String(input.owner?.email || '').trim().toLowerCase();
  const instituteName = String(input.institute?.name || '').trim();
  const plan = String(input.subscription?.plan || '').toUpperCase();
  const billingCycle = String(input.subscription?.billingCycle || '').toUpperCase();
  const startTrial = input.subscription?.startTrial;
  if (!ownerName || ownerName.length > 120) errors.push({ field: 'owner.name', code: 'INVALID_NAME', message: 'Owner name is required and must be at most 120 characters.' });
  if (!/^[6-9]\d{9}$/.test(phone)) errors.push({ field: 'owner.phone', code: 'INVALID_PHONE', message: 'Enter a valid 10-digit Indian mobile number.' });
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) errors.push({ field: 'owner.email', code: 'INVALID_EMAIL', message: 'Enter a valid email address.' });
  if (instituteName.length < 2 || instituteName.length > 160) errors.push({ field: 'institute.name', code: 'INVALID_NAME', message: 'Institute name must be between 2 and 160 characters.' });
  if (!['MARKETPLACE', 'QUIZ', 'ENTERPRISE'].includes(plan)) errors.push({ field: 'subscription.plan', code: 'INVALID_PLAN', message: 'Select Marketplace, Quiz, or Enterprise.' });
  if (!['MONTHLY', 'YEARLY', 'ONE_TIME'].includes(billingCycle)) errors.push({ field: 'subscription.billingCycle', code: 'INVALID_BILLING_CYCLE', message: 'Select a supported billing cycle.' });
  if (typeof startTrial !== 'boolean') errors.push({ field: 'subscription.startTrial', code: 'INVALID_BOOLEAN', message: 'Trial choice is required.' });
  if (plan === 'MARKETPLACE' && (billingCycle !== 'ONE_TIME' || startTrial === true)) errors.push({ field: 'subscription', code: 'INVALID_PLAN_CYCLE', message: 'Marketplace uses one-time access and has no trial.' });
  if ((plan === 'QUIZ' || plan === 'ENTERPRISE') && billingCycle === 'ONE_TIME') errors.push({ field: 'subscription.billingCycle', code: 'INVALID_PLAN_CYCLE', message: 'Quiz and Enterprise use monthly or yearly billing.' });
  if (typeof input.marketplace?.isPubliclyListed !== 'boolean') errors.push({ field: 'marketplace.isPubliclyListed', code: 'INVALID_BOOLEAN', message: 'Marketplace visibility is required.' });
  if (typeof input.marketplace?.isVerified !== 'boolean') errors.push({ field: 'marketplace.isVerified', code: 'INVALID_BOOLEAN', message: 'Verification state is required.' });
  if (errors.length) return { valid: false, errors };

  const normalized: NormalizedOnboarding = {
    owner: { name: ownerName, phone, ...(email ? { email } : {}) },
    institute: {
      name: instituteName,
      ...(String(input.institute?.city || '').trim() ? { city: String(input.institute.city).trim() } : {}),
      ...(String(input.institute?.area || '').trim() ? { area: String(input.institute.area).trim() } : {}),
      ...(String(input.institute?.address || '').trim() ? { address: String(input.institute.address).trim() } : {})
    },
    subscription: { plan: plan as CanonicalPlan, billingCycle: billingCycle as BillingCycle, startTrial },
    marketplace: { isPubliclyListed: input.marketplace.isPubliclyListed, isVerified: input.marketplace.isVerified }
  };
  return {
    valid: true,
    errors: [],
    normalized,
    summary: {
      owner: { name: normalized.owner.name, loginPhone: normalized.owner.phone, email: normalized.owner.email || null },
      institute: normalized.institute,
      subscription: normalized.subscription,
      unlimitedStudents: true,
      marketplace: normalized.marketplace
    }
  };
}

function onboardingPlanConfig(input: NormalizedOnboarding) {
  return {
    requiresGrades: true,
    allowedClasses: ['9', '10'],
    subjects: ['Math']
  };
}

async function createOnboardedInstitute(tx: Prisma.TransactionClient, input: NormalizedOnboarding, actorAdminId: string, correlationId: string) {
  const existing = await tx.institute.findFirst({
    where: { OR: [
      { phoneNumber: input.owner.phone },
      ...(input.owner.email ? [{ email: { equals: input.owner.email, mode: 'insensitive' as const } }] : [])
    ] },
    select: { id: true, name: true }
  });
  if (existing) return { kind: 'EXISTING' as const, instituteId: existing.id, name: existing.name };
  const now = new Date();
  const isMarketplace = input.subscription.plan === 'MARKETPLACE';
  const planExpiryDate = isMarketplace ? null : new Date(now);
  if (planExpiryDate) {
    if (input.subscription.startTrial) planExpiryDate.setUTCDate(planExpiryDate.getUTCDate() + 14);
    else if (input.subscription.billingCycle === 'YEARLY') planExpiryDate.setUTCFullYear(planExpiryDate.getUTCFullYear() + 1);
    else planExpiryDate.setUTCMonth(planExpiryDate.getUTCMonth() + 1);
  }
  const period = !isMarketplace ? includedCreditPeriod({ planStartDate: now }, now) : null;
  const institute = await tx.institute.create({
    data: {
      name: input.institute.name,
      teacherName: input.owner.name,
      phoneNumber: input.owner.phone,
      email: input.owner.email || null,
      city: input.institute.city || null,
      area: input.institute.area || null,
      address: input.institute.address || null,
      plan: input.subscription.plan,
      billingCycle: input.subscription.billingCycle,
      planStartDate: now,
      planExpiryDate,
      marketplaceAccessGrantedAt: now,
      trialStartedAt: input.subscription.startTrial ? now : null,
      trialEndsAt: input.subscription.startTrial ? planExpiryDate : null,
      trialUsedAt: input.subscription.startTrial ? now : null,
      includedQuizCredits: isMarketplace ? 0 : 5,
      includedQuizCreditsExpireAt: period?.includedQuizCreditsExpireAt ?? null,
      quizCreditsRenewAt: period?.quizCreditsRenewAt ?? null,
      quizCredits: isMarketplace ? 0 : 5,
      isQuizOnly: false,
      isPubliclyListed: input.marketplace.isPubliclyListed,
      isVerified: input.marketplace.isVerified,
      config: onboardingPlanConfig(input)
    }
  });
  const inviteToken = crypto.randomBytes(32).toString('hex');
  await tx.inviteToken.create({
    data: { token: inviteToken, instituteId: institute.id, expiresAt: new Date(now.getTime() + 7 * 86_400_000) }
  });
  const clientUrl = (process.env.CLIENT_URL || 'http://localhost:5173').replace(/\/$/, '');
  const setupLink = `${clientUrl}/setup?token=${inviteToken}`;
  const emailJob = input.owner.email ? await tx.emailJob.create({
    data: {
      recipient: input.owner.email,
      subject: `Complete your MathLogs setup for ${input.institute.name}`,
      body: `Hi ${input.owner.name}, complete your MathLogs setup: ${setupLink}`,
      instituteId: institute.id,
      options: { senderType: 'WELCOME', purpose: 'SUPERADMIN_ONBOARDING' }
    }
  }) : null;
  const whatsappJob = await tx.whatsappJob.create({
    data: {
      recipient: `91${input.owner.phone}`,
      templateId: process.env.WHATSAPP_TEMPLATE_SETUP || 'onboarding_setup_link',
      data: [input.owner.name, input.institute.name, setupLink],
      instituteId: institute.id
    }
  });
  await writeSuperAdminAudit(tx, {
    action: 'INSTITUTE_ONBOARDED', entityType: 'Institute', entityId: institute.id,
    instituteId: institute.id, actorAdminId, correlationId,
    reason: 'Superadmin guided onboarding',
    after: { name: institute.name, plan: institute.plan, billingCycle: input.subscription.billingCycle, loginPhone: input.owner.phone },
    metadata: { emailJobId: emailJob?.id || null, whatsappJobId: whatsappJob.id }
  });
  return { kind: 'CREATED' as const, instituteId: institute.id, name: institute.name, communication: { emailQueued: Boolean(emailJob), whatsappQueued: true } };
}

function safeOnboardingResult(result: Awaited<ReturnType<typeof createOnboardedInstitute>>) {
  return result.kind === 'EXISTING'
    ? { instituteId: result.instituteId, name: result.name, status: 'EXISTING' }
    : { instituteId: result.instituteId, name: result.name, status: 'CREATED', communication: result.communication };
}

export async function commitInstituteOnboarding(input: {
  value: unknown;
  idempotencyKey: string;
  actorAdminId: string;
  correlationId: string;
}) {
  const preview = previewInstituteOnboarding(input.value);
  if (!preview.valid || !preview.normalized) throw new InstituteServiceError('ONBOARDING_INVALID', preview.errors);
  if (input.idempotencyKey.trim().length < 8 || input.idempotencyKey.length > 200) throw new InstituteServiceError('IDEMPOTENCY_KEY_REQUIRED');
  const hash = requestHash(preview.normalized);
  const evaluate = (operation: { requestHash: string; status: string; result: unknown }) => {
    if (operation.requestHash !== hash) throw new InstituteServiceError('IDEMPOTENCY_KEY_REUSED');
    if (operation.status !== 'COMPLETED' || !operation.result) throw new InstituteServiceError('IDEMPOTENCY_IN_PROGRESS');
    return { replay: true, result: operation.result };
  };
  const existing = await prisma.superAdminOnboardingOperation.findUnique({ where: { idempotencyKey: input.idempotencyKey } });
  if (existing) return evaluate(existing);
  let operation;
  try {
    operation = await prisma.superAdminOnboardingOperation.create({
      data: { actorAdminId: input.actorAdminId, kind: 'SINGLE', idempotencyKey: input.idempotencyKey, requestHash: hash }
    });
  } catch (error) {
    if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== 'P2002') throw error;
    return evaluate(await prisma.superAdminOnboardingOperation.findUniqueOrThrow({ where: { idempotencyKey: input.idempotencyKey } }));
  }
  try {
    const result = await prisma.$transaction(async tx => {
      const created = await createOnboardedInstitute(tx, preview.normalized!, input.actorAdminId, input.correlationId);
      const safe = safeOnboardingResult(created);
      await tx.superAdminOnboardingOperation.update({ where: { id: operation.id }, data: { status: 'COMPLETED', result: safe } });
      return safe;
    });
    return { replay: false, result };
  } catch (error) {
    await prisma.superAdminOnboardingOperation.update({ where: { id: operation.id }, data: { status: 'FAILED', result: { error: 'ONBOARDING_FAILED' } } });
    throw error;
  }
}

export function previewInstituteImport(rows: unknown) {
  if (!Array.isArray(rows) || rows.length === 0 || rows.length > 500) throw new InstituteServiceError('IMPORT_ROWS_REQUIRED');
  const normalized: { row: number; value: NormalizedOnboarding }[] = [];
  const errors: Array<OnboardingValidationError & { row: number }> = [];
  const phones = new Set<string>();
  rows.forEach((value, index) => {
    const preview = previewInstituteOnboarding(value);
    if (!preview.valid || !preview.normalized) {
      errors.push(...preview.errors.map(error => ({ row: index + 1, ...error })));
      return;
    }
    if (phones.has(preview.normalized.owner.phone)) {
      errors.push({ row: index + 1, field: 'owner.phone', code: 'DUPLICATE_IN_FILE', message: 'Owner phone is duplicated in this import.' });
      return;
    }
    phones.add(preview.normalized.owner.phone);
    normalized.push({ row: index + 1, value: preview.normalized });
  });
  return { totalRows: rows.length, validRows: normalized.length, invalidRows: rows.length - normalized.length, errors, normalized };
}

export async function commitInstituteImport(input: {
  rows: unknown;
  idempotencyKey: string;
  actorAdminId: string;
  correlationId: string;
}) {
  const preview = previewInstituteImport(input.rows);
  if (input.idempotencyKey.trim().length < 8 || input.idempotencyKey.length > 200) throw new InstituteServiceError('IDEMPOTENCY_KEY_REQUIRED');
  const normalizedRequest = preview.normalized.map(item => ({ row: item.row, value: item.value }));
  const hash = requestHash({ rows: input.rows });
  const existing = await prisma.superAdminOnboardingOperation.findUnique({ where: { idempotencyKey: input.idempotencyKey } });
  if (existing) {
    if (existing.requestHash !== hash) throw new InstituteServiceError('IDEMPOTENCY_KEY_REUSED');
    if (existing.status !== 'COMPLETED' || !existing.result) throw new InstituteServiceError('IDEMPOTENCY_IN_PROGRESS');
    return { replay: true, result: existing.result };
  }
  const operation = await prisma.superAdminOnboardingOperation.create({
    data: {
      actorAdminId: input.actorAdminId, kind: 'IMPORT', idempotencyKey: input.idempotencyKey, requestHash: hash,
      rows: { create: normalizedRequest.map(item => ({ rowNumber: item.row, requestHash: requestHash(item.value) })) }
    }
  });
  const created: unknown[] = [];
  const existingRows: unknown[] = [];
  const failed: unknown[] = preview.errors.map(error => error);
  for (const item of normalizedRequest) {
    try {
      const result = await prisma.$transaction(async tx => {
        const onboarded = await createOnboardedInstitute(tx, item.value, input.actorAdminId, input.correlationId);
        const safe = { row: item.row, ...safeOnboardingResult(onboarded) };
        await tx.superAdminOnboardingRow.update({
          where: { operationId_rowNumber: { operationId: operation.id, rowNumber: item.row } },
          data: { status: 'COMPLETED', instituteId: onboarded.instituteId, result: safe }
        });
        return { onboarded, safe };
      });
      (result.onboarded.kind === 'EXISTING' ? existingRows : created).push(result.safe);
    } catch {
      const safeFailure = { row: item.row, field: 'row', code: 'ROW_FAILED', message: 'The row could not be created.' };
      failed.push(safeFailure);
      await prisma.superAdminOnboardingRow.update({
        where: { operationId_rowNumber: { operationId: operation.id, rowNumber: item.row } },
        data: { status: 'FAILED', result: safeFailure }
      });
    }
  }
  const result = { created, existing: existingRows, failed };
  await prisma.superAdminOnboardingOperation.update({
    where: { id: operation.id },
    data: { status: 'COMPLETED', result: JSON.parse(JSON.stringify(result)) as Prisma.InputJsonValue }
  });
  return { replay: false, result };
}
