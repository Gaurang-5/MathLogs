import crypto from 'node:crypto';
import { Prisma, Tier } from '@prisma/client';
import { prisma } from '../prisma';
import { invalidateAuthCache } from '../middleware/auth';
import { writeSuperAdminAudit } from './superAdminAuditService';
import { readBillingProviderHistory } from './superAdminBillingProvider';
import { normalizePlanId, type BillingCycle, type CanonicalPlan } from '../domain/plans/planCatalog';
import { effectiveEntitlements, includedCreditPeriod, paidPlanExpiry } from '../domain/plans/entitlements';

export type BillingOperationType =
  | 'PLAN_CHANGE'
  | 'TRIAL_EXTENSION'
  | 'LIFETIME_CREDIT_ADJUSTMENT'
  | 'PLAN_REVOKE'
  | 'MANUAL_PAYMENT_REFERENCE';

export type BillingActionClass = 'PLAN_REVOKE' | 'BILLING_ADJUSTMENT' | null;

export class RevenueServiceError extends Error {
  constructor(code: string, public current?: unknown) {
    super(code);
  }
}

type NormalizedBillingRequest = {
  type: BillingOperationType;
  reason: string;
  effectiveAt: string | null;
  payload: Record<string, unknown>;
};

type InstituteBillingState = {
  id: string;
  name: string;
  plan: Tier;
  planStartDate: Date | null;
  planExpiryDate: Date | null;
  quizCredits: number;
  billingCycle: BillingCycle | null;
  trialStartedAt: Date | null;
  trialEndsAt: Date | null;
  marketplaceAccessGrantedAt: Date | null;
  includedQuizCredits: number;
  includedQuizCreditsExpireAt: Date | null;
  lifetimeQuizCredits: number;
  quizCreditsRenewAt: Date | null;
  config: Prisma.JsonValue | null;
  updatedAt: Date;
};

const billingStateSelect = {
  id: true,
  name: true,
  plan: true,
  planStartDate: true,
  planExpiryDate: true,
  quizCredits: true,
  billingCycle: true,
  trialStartedAt: true,
  trialEndsAt: true,
  marketplaceAccessGrantedAt: true,
  includedQuizCredits: true,
  includedQuizCreditsExpireAt: true,
  lifetimeQuizCredits: true,
  quizCreditsRenewAt: true,
  config: true,
  updatedAt: true
} satisfies Prisma.InstituteSelect;

function jsonObject(value: Prisma.JsonValue | null): Prisma.JsonObject {
  if (!value || Array.isArray(value) || typeof value !== 'object') return {};
  return Object.fromEntries(Object.entries(value as Prisma.JsonObject).filter((entry): entry is [string, Prisma.JsonValue] => entry[1] !== undefined));
}

function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value as Record<string, unknown>)
    .sort(([left], [right]) => left.localeCompare(right)).map(([key, item]) => [key, canonical(item)]));
  return value;
}

function hash(value: unknown): string {
  return crypto.createHash('sha256').update(JSON.stringify(canonical(value))).digest('hex');
}

export function billingActionClass(type: string): BillingActionClass {
  if (type === 'PLAN_REVOKE') return 'PLAN_REVOKE';
  if (type === 'LIFETIME_CREDIT_ADJUSTMENT' || type === 'MANUAL_PAYMENT_REFERENCE') return 'BILLING_ADJUSTMENT';
  return null;
}

function normalizeBillingRequest(value: unknown): NormalizedBillingRequest {
  const input = value && typeof value === 'object' && !Array.isArray(value) ? value as any : {};
  const type = String(input.type || '').toUpperCase() as BillingOperationType;
  const allowed: BillingOperationType[] = ['PLAN_CHANGE', 'TRIAL_EXTENSION', 'LIFETIME_CREDIT_ADJUSTMENT', 'PLAN_REVOKE', 'MANUAL_PAYMENT_REFERENCE'];
  if (!allowed.includes(type)) throw new RevenueServiceError('INVALID_BILLING_OPERATION');
  const reason = String(input.reason || '').trim();
  if (reason.length < 10 || reason.length > 500) throw new RevenueServiceError('REASON_REQUIRED');
  const payload = input.payload && typeof input.payload === 'object' && !Array.isArray(input.payload) ? input.payload as Record<string, unknown> : {};
  let effectiveAt: string | null = null;
  if (input.effectiveAt !== undefined && input.effectiveAt !== null && input.effectiveAt !== '') {
    const parsed = new Date(input.effectiveAt);
    if (Number.isNaN(parsed.getTime()) || parsed.getTime() > Date.now() + 2 * 365 * 86_400_000) throw new RevenueServiceError('INVALID_EFFECTIVE_AT');
    effectiveAt = parsed.toISOString();
  }
  return { type, reason, effectiveAt, payload };
}

function derivePreview(institute: InstituteBillingState, request: NormalizedBillingRequest) {
  const before: Record<string, unknown> = {};
  const after: Record<string, unknown> = {};
  if (request.type === 'PLAN_CHANGE') {
    const plan = String(request.payload.plan || '').toUpperCase() as CanonicalPlan;
    const billingCycle = String(request.payload.billingCycle || '').toUpperCase() as BillingCycle;
    if (!['MARKETPLACE', 'QUIZ', 'ENTERPRISE'].includes(plan)) throw new RevenueServiceError('INVALID_PLAN_CHANGE');
    if ((plan === 'MARKETPLACE' && billingCycle !== 'ONE_TIME') || (plan !== 'MARKETPLACE' && !['MONTHLY', 'YEARLY'].includes(billingCycle))) {
      throw new RevenueServiceError('INVALID_PLAN_CYCLE');
    }
    const startsAt = request.effectiveAt ? new Date(request.effectiveAt) : new Date();
    const expiryDate = plan === 'MARKETPLACE' ? null : paidPlanExpiry(startsAt, billingCycle as 'MONTHLY' | 'YEARLY');
    before.plan = institute.plan;
    before.billingCycle = institute.billingCycle;
    before.planExpiryDate = institute.planExpiryDate;
    after.plan = plan;
    after.billingCycle = billingCycle;
    after.planStartDate = startsAt.toISOString();
    after.planExpiryDate = expiryDate?.toISOString() ?? null;
  } else if (request.type === 'TRIAL_EXTENSION') {
    const days = Number(request.payload.days);
    if (!Number.isInteger(days) || days < 1 || days > 30 || !institute.trialStartedAt || !institute.trialEndsAt) throw new RevenueServiceError('INVALID_TRIAL_EXTENSION');
    const base = institute.trialEndsAt.getTime() > Date.now() ? institute.trialEndsAt : new Date();
    const trialEndsAt = new Date(base.getTime() + days * 86_400_000);
    before.trialEndsAt = institute.trialEndsAt;
    after.trialEndsAt = trialEndsAt.toISOString();
    after.planExpiryDate = trialEndsAt.toISOString();
    after.includedQuizCreditsExpireAt = trialEndsAt.toISOString();
  } else if (request.type === 'LIFETIME_CREDIT_ADJUSTMENT') {
    const delta = Number(request.payload.delta);
    if (!Number.isInteger(delta) || delta === 0 || Math.abs(delta) > 1_000_000 || institute.lifetimeQuizCredits + delta < 0) throw new RevenueServiceError('INVALID_LIFETIME_CREDIT_ADJUSTMENT');
    before.lifetimeQuizCredits = institute.lifetimeQuizCredits;
    after.lifetimeQuizCredits = institute.lifetimeQuizCredits + delta;
    after.totalUsableQuizCredits = institute.includedQuizCredits + institute.lifetimeQuizCredits + delta;
  } else if (request.type === 'PLAN_REVOKE') {
    if (Object.keys(request.payload).length) throw new RevenueServiceError('INVALID_PLAN_REVOKE');
    before.plan = institute.plan;
    before.planExpiryDate = institute.planExpiryDate;
    after.plan = 'MARKETPLACE';
    after.billingCycle = 'ONE_TIME';
    after.planExpiryDate = new Date().toISOString();
  } else {
    const amountPaise = Number(request.payload.amountPaise);
    const reference = String(request.payload.reference || '').trim();
    const paidAt = new Date(String(request.payload.paidAt || ''));
    if (!Number.isInteger(amountPaise) || amountPaise <= 0 || amountPaise > 100_000_000_00 || reference.length < 3 || reference.length > 120 || Number.isNaN(paidAt.getTime())) {
      throw new RevenueServiceError('INVALID_MANUAL_PAYMENT_REFERENCE');
    }
    before.manualPaymentReference = null;
    after.manualPaymentReference = { amountPaise, reference, paidAt: paidAt.toISOString() };
  }
  const effectiveAt = request.effectiveAt ? new Date(request.effectiveAt) : new Date();
  return {
    request,
    before,
    after,
    effectiveAt,
    scheduled: effectiveAt.getTime() > Date.now(),
    protected: billingActionClass(request.type) !== null,
    actionClass: billingActionClass(request.type)
  };
}

export async function previewBillingOperation(instituteId: string, value: unknown) {
  const institute = await prisma.institute.findUnique({ where: { id: instituteId }, select: billingStateSelect });
  if (!institute) throw new RevenueServiceError('INSTITUTE_NOT_FOUND');
  const preview = derivePreview(institute, normalizeBillingRequest(value));
  return { ...preview, effectiveAt: preview.effectiveAt.toISOString() };
}

function publicOperation(operation: any) {
  return {
    id: operation.id,
    instituteId: operation.instituteId,
    type: operation.type,
    reason: operation.reason,
    request: operation.request,
    result: operation.result,
    status: operation.status,
    effectiveAt: operation.effectiveAt,
    appliedAt: operation.appliedAt,
    error: operation.error,
    attempts: operation.attempts,
    maxAttempts: operation.maxAttempts,
    retryable: operation.status === 'FAILED' && operation.attempts < operation.maxAttempts,
    createdAt: operation.createdAt,
    updatedAt: operation.updatedAt
  };
}

function sameOperation(operation: { type: string; reason: string; request: unknown }, request: NormalizedBillingRequest) {
  return operation.type === request.type && operation.reason === request.reason && hash(operation.request) === hash({
    type: request.type, payload: request.payload, effectiveAt: request.effectiveAt
  });
}

export async function findBillingOperationReplay(input: { actorAdminId: string; idempotencyKey: string; value: unknown }) {
  if (!input.idempotencyKey) return null;
  const existing = await prisma.superAdminBillingOperation.findUnique({ where: { idempotencyKey: input.idempotencyKey } });
  if (!existing) return null;
  const request = normalizeBillingRequest(input.value);
  if (existing.actorAdminId !== input.actorAdminId || !sameOperation(existing, request)) throw new RevenueServiceError('IDEMPOTENCY_KEY_REUSED');
  return publicOperation(existing);
}

export async function applyBillingOperationById(operationId: string): Promise<'APPLIED' | 'SKIPPED'> {
  try {
    const result = await prisma.$transaction(async tx => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${operationId}))`;
      const operation = await tx.superAdminBillingOperation.findUnique({ where: { id: operationId } });
      if (!operation || operation.status !== 'PENDING') return 'SKIPPED' as const;
      const now = new Date();
      if (operation.effectiveAt && operation.effectiveAt > now) return 'SKIPPED' as const;
      if (operation.nextAttemptAt && operation.nextAttemptAt > now) return 'SKIPPED' as const;
      const claimed = await tx.superAdminBillingOperation.updateMany({
        where: { id: operation.id, status: 'PENDING' },
        data: { attempts: { increment: 1 }, lastAttemptAt: now }
      });
      if (claimed.count !== 1 || !operation.instituteId) return 'SKIPPED' as const;
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${operation.instituteId}))`;
      const institute = await tx.institute.findUnique({ where: { id: operation.instituteId }, select: billingStateSelect });
      if (!institute) throw new RevenueServiceError('INSTITUTE_NOT_FOUND');
      const storedRequest = operation.request as Record<string, unknown>;
      const request: NormalizedBillingRequest = {
        type: operation.type as BillingOperationType,
        reason: operation.reason,
        effectiveAt: storedRequest.effectiveAt ? String(storedRequest.effectiveAt) : null,
        payload: storedRequest.payload && typeof storedRequest.payload === 'object' && !Array.isArray(storedRequest.payload) ? storedRequest.payload as Record<string, unknown> : {}
      };
      const preview = derivePreview(institute, request);
      if (request.type === 'PLAN_CHANGE') {
        const plan = preview.after.plan as CanonicalPlan;
        const planStartDate = new Date(String(preview.after.planStartDate));
        const period = plan === 'MARKETPLACE' ? null : includedCreditPeriod({ planStartDate }, planStartDate);
        await tx.institute.update({ where: { id: institute.id }, data: {
          plan, billingCycle: preview.after.billingCycle as BillingCycle, planStartDate,
          planExpiryDate: preview.after.planExpiryDate ? new Date(String(preview.after.planExpiryDate)) : null,
          trialStartedAt: null, trialEndsAt: null, marketplaceAccessGrantedAt: institute.marketplaceAccessGrantedAt ?? now,
          includedQuizCredits: plan === 'MARKETPLACE' ? 0 : 5,
          includedQuizCreditsExpireAt: period?.includedQuizCreditsExpireAt ?? null,
          quizCreditsRenewAt: period?.quizCreditsRenewAt ?? null,
          quizCredits: (plan === 'MARKETPLACE' ? 0 : 5) + institute.lifetimeQuizCredits,
          isQuizOnly: plan === 'QUIZ'
        } });
      } else if (request.type === 'TRIAL_EXTENSION') {
        const extended = new Date(String(preview.after.trialEndsAt));
        await tx.institute.update({ where: { id: institute.id }, data: { trialEndsAt: extended, planExpiryDate: extended, includedQuizCreditsExpireAt: extended } });
      } else if (request.type === 'LIFETIME_CREDIT_ADJUSTMENT') {
        const lifetimeQuizCredits = Number(preview.after.lifetimeQuizCredits);
        await tx.institute.update({ where: { id: institute.id }, data: { lifetimeQuizCredits, quizCredits: institute.includedQuizCredits + lifetimeQuizCredits } });
      } else if (request.type === 'PLAN_REVOKE') {
        await tx.institute.update({ where: { id: institute.id }, data: {
          plan: 'MARKETPLACE', billingCycle: 'ONE_TIME', planExpiryDate: now, trialStartedAt: null, trialEndsAt: null,
          marketplaceAccessGrantedAt: institute.marketplaceAccessGrantedAt ?? now, includedQuizCredits: 0,
          includedQuizCreditsExpireAt: null, quizCreditsRenewAt: null, quizCredits: institute.lifetimeQuizCredits, isQuizOnly: false
        } });
      }
      await writeSuperAdminAudit(tx, {
        action: `BILLING_${request.type}_APPLIED`, entityType: 'SuperAdminBillingOperation', entityId: operation.id,
        instituteId: institute.id, actorAdminId: operation.actorAdminId, correlationId: `billing:${operation.id}`,
        reason: operation.reason, before: preview.before as Prisma.InputJsonObject, after: preview.after as Prisma.InputJsonObject
      });
      await tx.superAdminBillingOperation.update({
        where: { id: operation.id },
        data: { status: 'APPLIED', appliedAt: now, error: null, result: { before: preview.before, after: preview.after } as Prisma.InputJsonObject }
      });
      return 'APPLIED' as const;
    });
    if (result === 'APPLIED') {
      const operation = await prisma.superAdminBillingOperation.findUnique({ where: { id: operationId }, select: { instituteId: true } });
      if (operation?.instituteId) {
        const admins = await prisma.admin.findMany({ where: { instituteId: operation.instituteId }, select: { id: true } });
        admins.forEach(admin => invalidateAuthCache(admin.id));
      }
    }
    return result;
  } catch (error) {
    const message = error instanceof Error ? error.message.slice(0, 500) : 'BILLING_OPERATION_FAILED';
    await prisma.superAdminBillingOperation.updateMany({
      where: { id: operationId, status: 'PENDING' },
      data: { status: 'FAILED', error: message, attempts: { increment: 1 }, lastAttemptAt: new Date() }
    });
    throw error;
  }
}

export async function submitBillingOperation(input: {
  instituteId: string;
  actorAdminId: string;
  idempotencyKey: string;
  value: unknown;
}) {
  if (input.idempotencyKey.trim().length < 8 || input.idempotencyKey.length > 200) throw new RevenueServiceError('IDEMPOTENCY_KEY_REQUIRED');
  const replay = await findBillingOperationReplay(input);
  if (replay) return { replay: true, operation: replay };
  const request = normalizeBillingRequest(input.value);
  const preview = await previewBillingOperation(input.instituteId, request);
  let operation;
  try {
    operation = await prisma.superAdminBillingOperation.create({
      data: {
        instituteId: input.instituteId,
        actorAdminId: input.actorAdminId,
        type: request.type,
        idempotencyKey: input.idempotencyKey,
        reason: request.reason,
        request: { type: request.type, payload: request.payload, effectiveAt: request.effectiveAt } as Prisma.InputJsonObject,
        effectiveAt: new Date(preview.effectiveAt),
        nextAttemptAt: new Date(preview.effectiveAt)
      }
    });
  } catch (error) {
    if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== 'P2002') throw error;
    const raced = await findBillingOperationReplay(input);
    if (!raced) throw error;
    return { replay: true, operation: raced };
  }
  if (preview.scheduled) return { replay: false, operation: publicOperation(operation) };
  await applyBillingOperationById(operation.id);
  return { replay: false, operation: publicOperation(await prisma.superAdminBillingOperation.findUniqueOrThrow({ where: { id: operation.id } })) };
}

export async function retryBillingOperation(input: { operationId: string; actorAdminId: string; idempotencyKey: string }) {
  if (input.idempotencyKey.trim().length < 8) throw new RevenueServiceError('IDEMPOTENCY_KEY_REQUIRED');
  const source = await prisma.superAdminBillingOperation.findUnique({ where: { id: input.operationId } });
  if (!source) throw new RevenueServiceError('BILLING_OPERATION_NOT_FOUND');
  if (source.actorAdminId !== input.actorAdminId && !source.instituteId) throw new RevenueServiceError('BILLING_OPERATION_NOT_FOUND');
  if (source.status !== 'FAILED' || source.attempts >= source.maxAttempts) throw new RevenueServiceError('BILLING_OPERATION_NOT_RETRYABLE');
  const claimed = await prisma.superAdminBillingOperation.updateMany({
    where: { id: source.id, status: 'FAILED', attempts: { lt: source.maxAttempts } },
    data: { status: 'PENDING', error: null, nextAttemptAt: new Date() }
  });
  if (claimed.count !== 1) throw new RevenueServiceError('BILLING_OPERATION_NOT_RETRYABLE');
  await applyBillingOperationById(source.id);
  return publicOperation(await prisma.superAdminBillingOperation.findUniqueOrThrow({ where: { id: source.id } }));
}

export async function getRevenueOverview() {
  const now = new Date();
  const [totalInstitutes, activeSubscriptions, expiringSoon, byPlan, pendingOperations, failedOperations] = await Promise.all([
    prisma.institute.count(),
    prisma.institute.count({ where: { plan: { in: ['QUIZ', 'ENTERPRISE', 'BASIC', 'PRO'] }, OR: [{ planExpiryDate: null }, { planExpiryDate: { gt: now } }] } }),
    prisma.institute.count({ where: { plan: { in: ['QUIZ', 'ENTERPRISE', 'BASIC', 'PRO'] }, planExpiryDate: { gt: now, lte: new Date(now.getTime() + 30 * 86_400_000) } } }),
    prisma.institute.groupBy({ by: ['plan'], _count: { _all: true }, orderBy: { plan: 'asc' } }),
    prisma.superAdminBillingOperation.count({ where: { status: 'PENDING' } }),
    prisma.superAdminBillingOperation.count({ where: { status: 'FAILED' } })
  ]);
  return {
    metrics: { totalInstitutes, activeSubscriptions, expiringSoon, pendingOperations, failedOperations },
    byPlan: Object.entries(byPlan.reduce<Record<CanonicalPlan, number>>((totals, item) => {
      let plan: CanonicalPlan;
      try { plan = normalizePlanId(item.plan); } catch { plan = 'MARKETPLACE'; }
      totals[plan] += item._count._all;
      return totals;
    }, { MARKETPLACE: 0, QUIZ: 0, ENTERPRISE: 0 })).map(([plan, institutes]) => ({ plan, institutes })),
    revenueDefinition: 'MathLogs subscription operations only; institute-collected coaching fees are excluded.'
  };
}

export async function listRevenueSubscriptions(input: { q?: string; plan?: string; page: number; pageSize: number }) {
  let requestedPlan: CanonicalPlan | undefined;
  if (input.plan) {
    if (!['MARKETPLACE', 'QUIZ', 'ENTERPRISE'].includes(input.plan)) throw new RevenueServiceError('INVALID_PLAN');
    requestedPlan = input.plan as CanonicalPlan;
  }
  const where: Prisma.InstituteWhereInput = {
    ...(input.q ? { OR: [{ name: { contains: input.q, mode: 'insensitive' } }, { teacherName: { contains: input.q, mode: 'insensitive' } }, { phoneNumber: { contains: input.q } }] } : {}),
    ...(requestedPlan ? { plan: requestedPlan } : {})
  };
  const [items, total] = await Promise.all([
    prisma.institute.findMany({
      where,
      select: { id: true, name: true, teacherName: true, status: true, plan: true, billingCycle: true, planStartDate: true, planExpiryDate: true, trialStartedAt: true, trialEndsAt: true, marketplaceAccessGrantedAt: true, includedQuizCredits: true, includedQuizCreditsExpireAt: true, lifetimeQuizCredits: true, quizCreditsRenewAt: true, updatedAt: true },
      orderBy: [{ planExpiryDate: 'asc' }, { id: 'asc' }], skip: (input.page - 1) * input.pageSize, take: input.pageSize
    }),
    prisma.institute.count({ where })
  ]);
  return { items: items.map(({ id, plan: storedPlan, ...item }) => {
    let plan: CanonicalPlan;
    try { plan = normalizePlanId(storedPlan); } catch { plan = 'MARKETPLACE'; }
    const access = effectiveEntitlements({ ...item, plan });
    return { instituteId: id, ...item, plan, effectivePlan: access.enterprise ? 'ENTERPRISE' : access.quiz ? 'QUIZ' : 'MARKETPLACE', totalUsableQuizCredits: access.usableQuizCredits, unlimitedStudents: true };
  }), page: input.page, pageSize: input.pageSize, total };
}

export async function getInstituteBillingHistory(instituteId: string) {
  const institute = await prisma.institute.findUnique({ where: { id: instituteId }, select: { razorpaySubscriptionId: true, plan: true, billingCycle: true, planStartDate: true, planExpiryDate: true, trialStartedAt: true, trialEndsAt: true, marketplaceAccessGrantedAt: true, includedQuizCredits: true, includedQuizCreditsExpireAt: true, lifetimeQuizCredits: true, quizCreditsRenewAt: true } });
  if (!institute) throw new RevenueServiceError('INSTITUTE_NOT_FOUND');
  const [operations, notifications, payments, provider] = await Promise.all([
    prisma.superAdminBillingOperation.findMany({ where: { instituteId }, orderBy: { createdAt: 'desc' }, take: 100 }),
    prisma.planNotification.findMany({ where: { instituteId }, orderBy: { scheduledAt: 'desc' }, take: 100 }),
    prisma.billingPayment.findMany({ where: { instituteId }, orderBy: { createdAt: 'desc' }, take: 100 }),
    readBillingProviderHistory(institute.razorpaySubscriptionId)
  ]);
  let plan: CanonicalPlan;
  try { plan = normalizePlanId(institute.plan); } catch { plan = 'MARKETPLACE'; }
  const access = effectiveEntitlements({ ...institute, plan });
  return { plan, effectivePlan: access.enterprise ? 'ENTERPRISE' : access.quiz ? 'QUIZ' : 'MARKETPLACE', billingCycle: institute.billingCycle, planStartDate: institute.planStartDate, planExpiryDate: institute.planExpiryDate,
    trialStartedAt: institute.trialStartedAt, trialEndsAt: institute.trialEndsAt, marketplaceAccessGrantedAt: institute.marketplaceAccessGrantedAt,
    includedQuizCredits: institute.includedQuizCredits, lifetimeQuizCredits: institute.lifetimeQuizCredits,
    totalUsableQuizCredits: access.usableQuizCredits,
    includedQuizCreditsExpireAt: institute.includedQuizCreditsExpireAt, quizCreditsRenewAt: institute.quizCreditsRenewAt,
    operations: operations.map(publicOperation), payments, notifications, ...provider };
}
