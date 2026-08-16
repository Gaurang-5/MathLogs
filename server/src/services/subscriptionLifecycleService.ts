import crypto from 'crypto';
import { Prisma, PrismaClient } from '@prisma/client';
import { effectiveEntitlements, includedCreditPeriod, nextBillingAnniversary, paidPlanExpiry } from '../domain/plans/entitlements';
import { normalizePlanId, type BillingCycle, type CanonicalPlan } from '../domain/plans/planCatalog';
import { prisma } from '../prisma';
import { scheduleLifecycleNotifications } from './planNotificationService';

export type LifecycleResult = {
  plan: CanonicalPlan;
  effectivePlan: CanonicalPlan;
  marketplace: boolean;
  quiz: boolean;
  enterprise: boolean;
  includedQuizCredits: number;
  lifetimeQuizCredits: number;
  trialEndsAt: Date | null;
  planExpiryDate: Date | null;
};

type InstituteState = Prisma.InstituteGetPayload<{ select: typeof instituteSelect }>;
const instituteSelect = {
  id: true, createdAt: true, plan: true, planStartDate: true, planExpiryDate: true, billingCycle: true,
  trialStartedAt: true, trialEndsAt: true, trialUsedAt: true, marketplaceAccessGrantedAt: true,
  includedQuizCredits: true, includedQuizCreditsExpireAt: true, lifetimeQuizCredits: true, quizCreditsRenewAt: true
} satisfies Prisma.InstituteSelect;

export class SubscriptionLifecycleError extends Error {
  constructor(code: string) { super(code); this.name = 'SubscriptionLifecycleError'; }
}

function addTrialDays(now: Date): Date {
  const result = new Date(now);
  result.setUTCDate(result.getUTCDate() + 14);
  return result;
}

function paidExpiry(now: Date, cycle: BillingCycle): Date {
  if (cycle === 'ONE_TIME') throw new SubscriptionLifecycleError('INVALID_PLAN_CYCLE');
  return paidPlanExpiry(now, cycle);
}

export function normalizeTrialOwnerIdentity(value: string): string {
  const trimmed = value.trim().toLowerCase();
  if (trimmed.includes('@')) return trimmed;
  const digits = trimmed.replace(/\D/g, '');
  if (digits.length === 14 && digits.startsWith('0091')) return digits.slice(4);
  if (digits.length === 12 && digits.startsWith('91')) return digits.slice(2);
  if (digits.length === 11 && digits.startsWith('0')) return digits.slice(1);
  if (digits.length >= 10 && digits.length <= 15) return digits;
  throw new SubscriptionLifecycleError('INVALID_OWNER_IDENTITY');
}

function toResult(institute: InstituteState, now: Date): LifecycleResult {
  const access = effectiveEntitlements(institute, now);
  return {
    plan: normalizePlanId(institute.plan),
    effectivePlan: access.enterprise ? 'ENTERPRISE' : access.quiz ? 'QUIZ' : 'MARKETPLACE',
    ...access,
    includedQuizCredits: institute.includedQuizCredits,
    lifetimeQuizCredits: institute.lifetimeQuizCredits,
    trialEndsAt: institute.trialEndsAt,
    planExpiryDate: institute.planExpiryDate
  };
}

async function lock(tx: Prisma.TransactionClient, instituteId: string) {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${instituteId}))`;
}

export function createSubscriptionLifecycleService(client: PrismaClient = prisma, trialSecret = process.env.JWT_SECRET ?? 'local-lifecycle-secret') {
  async function transaction<T>(work: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T> {
    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        return await client.$transaction(work, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, maxWait: 120_000, timeout: 120_000 });
      } catch (error) {
        if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== 'P2034' || attempt === 2) throw error;
      }
    }
    throw new Error('Unreachable lifecycle transaction state');
  }

  async function load(tx: Prisma.TransactionClient, instituteId: string) {
    const institute = await tx.institute.findUnique({ where: { id: instituteId }, select: instituteSelect });
    if (!institute) throw new SubscriptionLifecycleError('INSTITUTE_NOT_FOUND');
    return institute;
  }

  const service = {
    async activateMarketplace(instituteId: string, now = new Date()): Promise<LifecycleResult> {
      const result = await transaction(async tx => {
        await lock(tx, instituteId);
        const current = await load(tx, instituteId);
        const updated = await tx.institute.update({ where: { id: instituteId }, data: {
          plan: 'MARKETPLACE', billingCycle: 'ONE_TIME', planStartDate: now, planExpiryDate: null,
          trialEndsAt: null, marketplaceAccessGrantedAt: current.marketplaceAccessGrantedAt ?? now,
          includedQuizCredits: 0, includedQuizCreditsExpireAt: null, quizCreditsRenewAt: null,
          quizCredits: current.lifetimeQuizCredits
        }, select: instituteSelect });
        return toResult(updated, now);
      });
      if (client === prisma) await scheduleLifecycleNotifications({ instituteId, event: 'PLAN_ACTIVATED', effectiveAt: now, reference: `marketplace:${now.toISOString()}` }).catch(() => undefined);
      return result;
    },

    async startPlanTrial(input: { instituteId: string; plan: CanonicalPlan | string; ownerIdentity: string; now?: Date }): Promise<LifecycleResult> {
      const now = input.now ?? new Date();
      const plan = normalizePlanId(input.plan);
      if (plan === 'MARKETPLACE') throw new SubscriptionLifecycleError('TRIAL_NOT_AVAILABLE');
      const normalizedIdentity = normalizeTrialOwnerIdentity(input.ownerIdentity);
      const ownerIdentityHash = crypto.createHmac('sha256', trialSecret).update(normalizedIdentity).digest('hex');
      const result = await transaction(async tx => {
        await lock(tx, input.instituteId);
        const current = await load(tx, input.instituteId);
        if (current.trialUsedAt) throw new SubscriptionLifecycleError('TRIAL_ALREADY_USED');
        const trialEndsAt = addTrialDays(now);
        try {
          await tx.planTrialClaim.create({ data: { instituteId: input.instituteId, ownerIdentityHash, plan, claimedAt: now, endsAt: trialEndsAt } });
        } catch (error) {
          if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') throw new SubscriptionLifecycleError('TRIAL_ALREADY_USED');
          throw error;
        }
        const period = includedCreditPeriod({ planStartDate: now }, now);
        const updated = await tx.institute.update({ where: { id: input.instituteId }, data: {
          plan, billingCycle: 'MONTHLY', planStartDate: now, planExpiryDate: trialEndsAt,
          trialStartedAt: now, trialEndsAt, trialUsedAt: now,
          marketplaceAccessGrantedAt: current.marketplaceAccessGrantedAt ?? now,
          includedQuizCredits: 5, includedQuizCreditsExpireAt: period.includedQuizCreditsExpireAt,
          quizCreditsRenewAt: period.quizCreditsRenewAt, quizCredits: 5 + current.lifetimeQuizCredits
        }, select: instituteSelect });
        return toResult(updated, now);
      });
      if (client === prisma) await scheduleLifecycleNotifications({ instituteId: input.instituteId, event: 'TRIAL_STARTED', effectiveAt: now, expiryAt: result.trialEndsAt, reference: `trial:${result.trialEndsAt?.toISOString()}` }).catch(() => undefined);
      return result;
    },

    async activatePaidPlan(input: { instituteId: string; plan: CanonicalPlan | string; billingCycle: BillingCycle; now?: Date }): Promise<LifecycleResult> {
      const now = input.now ?? new Date();
      const plan = normalizePlanId(input.plan);
      if (plan === 'MARKETPLACE') return service.activateMarketplace(input.instituteId, now);
      if (input.billingCycle === 'ONE_TIME') throw new SubscriptionLifecycleError('INVALID_PLAN_CYCLE');
      const result = await transaction(async tx => {
        await lock(tx, input.instituteId);
        const current = await load(tx, input.instituteId);
        const planExpiryDate = paidExpiry(now, input.billingCycle);
        const period = includedCreditPeriod({ planStartDate: now }, now);
        const updated = await tx.institute.update({ where: { id: input.instituteId }, data: {
          plan, billingCycle: input.billingCycle, planStartDate: now, planExpiryDate,
          trialStartedAt: null, trialEndsAt: null, marketplaceAccessGrantedAt: current.marketplaceAccessGrantedAt ?? now,
          includedQuizCredits: 5, includedQuizCreditsExpireAt: period.includedQuizCreditsExpireAt,
          quizCreditsRenewAt: period.quizCreditsRenewAt, quizCredits: 5 + current.lifetimeQuizCredits
        }, select: instituteSelect });
        return toResult(updated, now);
      });
      if (client === prisma) await scheduleLifecycleNotifications({ instituteId: input.instituteId, event: 'PLAN_ACTIVATED', effectiveAt: now, expiryAt: result.planExpiryDate, reference: `plan:${result.planExpiryDate?.toISOString()}` }).catch(() => undefined);
      return result;
    },

    async cancelAtPeriodEnd(instituteId: string, now = new Date()): Promise<LifecycleResult> {
      return transaction(async tx => {
        await lock(tx, instituteId);
        return toResult(await load(tx, instituteId), now);
      });
    },

    async reconcileInstituteLifecycle(instituteId: string, now = new Date()): Promise<LifecycleResult> {
      return transaction(async tx => {
        await lock(tx, instituteId);
        const current = await load(tx, instituteId);
        if (effectiveEntitlements(current, now).quiz) {
          const period = includedCreditPeriod(current, now);
          if (!current.quizCreditsRenewAt || current.quizCreditsRenewAt <= now) {
            const updated = await tx.institute.update({ where: { id: instituteId }, data: {
              includedQuizCredits: 5, includedQuizCreditsExpireAt: period.includedQuizCreditsExpireAt,
              quizCreditsRenewAt: period.quizCreditsRenewAt, quizCredits: 5 + current.lifetimeQuizCredits
            }, select: instituteSelect });
            return toResult(updated, now);
          }
        }
        return toResult(current, now);
      });
    },

    async runLifecycleSweep(now = new Date(), take = 100): Promise<number> {
      const candidates = await client.institute.findMany({ where: { OR: [{ quizCreditsRenewAt: { lte: now } }, { trialEndsAt: { lte: now } }, { planExpiryDate: { lte: now } }] }, orderBy: { updatedAt: 'asc' }, take, select: { id: true } });
      await Promise.all(candidates.map(candidate => service.reconcileInstituteLifecycle(candidate.id, now)));
      return candidates.length;
    }
  };
  return service;
}

const defaultLifecycle = createSubscriptionLifecycleService();
export const activateMarketplace = defaultLifecycle.activateMarketplace;
export const startPlanTrial = defaultLifecycle.startPlanTrial;
export const activatePaidPlan = defaultLifecycle.activatePaidPlan;
export const cancelAtPeriodEnd = defaultLifecycle.cancelAtPeriodEnd;
export const reconcileInstituteLifecycle = defaultLifecycle.reconcileInstituteLifecycle;
export const runLifecycleSweep = defaultLifecycle.runLifecycleSweep;
