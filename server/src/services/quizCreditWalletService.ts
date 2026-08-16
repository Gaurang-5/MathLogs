import { Prisma, PrismaClient } from '@prisma/client';
import { prisma } from '../prisma';
import { effectiveEntitlements, includedCreditPeriod, type IncludedCreditPeriod } from '../domain/plans/entitlements';

export class QuizCreditWalletError extends Error {
  constructor(code: string) {
    super(code);
    this.name = 'QuizCreditWalletError';
  }
}

export type QuizCreditWallet = {
  includedCredits: number;
  lifetimeCredits: number;
  totalUsableCredits: number;
  includedCreditsExpireAt: Date | null;
  quizCreditsRenewAt: Date | null;
};

export type GrantLifetimeQuizCreditsInput = {
  instituteId: string;
  amount: number;
  source?: 'BILLING_PAYMENT' | 'SUPER_ADMIN' | 'MIGRATION' | 'MANUAL';
  billingPaymentId?: string;
  actorAdminId?: string;
  reason?: string;
  correlationId?: string;
};

const instituteWalletSelect = {
  id: true,
  createdAt: true,
  plan: true,
  planStartDate: true,
  planExpiryDate: true,
  trialEndsAt: true,
  marketplaceAccessGrantedAt: true,
  includedQuizCredits: true,
  includedQuizCreditsExpireAt: true,
  lifetimeQuizCredits: true,
  quizCreditsRenewAt: true
} satisfies Prisma.InstituteSelect;

type WalletClient = PrismaClient | Prisma.TransactionClient;
type WalletInstitute = Prisma.InstituteGetPayload<{ select: typeof instituteWalletSelect }>;

function assertPositiveInteger(amount: number): void {
  if (!Number.isInteger(amount) || amount <= 0) throw new QuizCreditWalletError('INVALID_QUIZ_CREDIT_AMOUNT');
}

type WalletProjectionSource = Pick<WalletInstitute, 'includedQuizCredits' | 'lifetimeQuizCredits'>
  & Partial<Pick<WalletInstitute, 'includedQuizCreditsExpireAt' | 'quizCreditsRenewAt'>>;

function projection(institute: WalletProjectionSource, now: Date, activeOverride?: boolean): QuizCreditWallet {
  const active = activeOverride ?? effectiveEntitlements(institute, now).quiz;
  const includedCredits = Math.max(0, institute.includedQuizCredits ?? 0);
  const lifetimeCredits = Math.max(0, institute.lifetimeQuizCredits ?? 0);
  return {
    includedCredits,
    lifetimeCredits,
    totalUsableCredits: active ? includedCredits + lifetimeCredits : 0,
    includedCreditsExpireAt: institute.includedQuizCreditsExpireAt ?? null,
    quizCreditsRenewAt: institute.quizCreditsRenewAt ?? null
  };
}

async function lockInstitute(tx: WalletClient, instituteId: string): Promise<void> {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${instituteId}))`;
}

async function loadWalletInstitute(tx: WalletClient, instituteId: string): Promise<WalletInstitute> {
  const institute = await tx.institute.findUnique({ where: { id: instituteId }, select: instituteWalletSelect });
  if (!institute) throw new QuizCreditWalletError('INSTITUTE_NOT_FOUND');
  return institute;
}

function shouldRefreshIncludedCredits(institute: WalletInstitute, now: Date): boolean {
  if (!effectiveEntitlements(institute, now).quiz) return false;
  return !institute.quizCreditsRenewAt || institute.quizCreditsRenewAt.getTime() <= now.getTime();
}

async function persistWallet(tx: WalletClient, instituteId: string, includedCredits: number, lifetimeCredits: number, extra: Partial<Pick<WalletInstitute, 'includedQuizCreditsExpireAt' | 'quizCreditsRenewAt'>> = {}) {
  const updated = await tx.institute.update({
    where: { id: instituteId },
    data: {
      includedQuizCredits: includedCredits,
      lifetimeQuizCredits: lifetimeCredits,
      quizCredits: includedCredits + lifetimeCredits,
      ...extra
    },
    select: instituteWalletSelect
  });
  return updated;
}

async function refreshIfDue(tx: WalletClient, institute: WalletInstitute, now: Date, period?: IncludedCreditPeriod): Promise<WalletInstitute> {
  if (!shouldRefreshIncludedCredits(institute, now)) return institute;
  const nextPeriod = period ?? includedCreditPeriod(institute, now);
  return persistWallet(tx, institute.id, 5, Math.max(0, institute.lifetimeQuizCredits ?? 0), nextPeriod);
}

/** Use this from an existing Prisma transaction when publishing a quiz. */
export async function consumeQuizCreditsInTransaction(tx: Prisma.TransactionClient, instituteId: string, amount: number, now = new Date()): Promise<QuizCreditWallet> {
  assertPositiveInteger(amount);
  await lockInstitute(tx, instituteId);
  const institute = await refreshIfDue(tx, await loadWalletInstitute(tx, instituteId), now);
  const entitlements = effectiveEntitlements(institute, now);
  if (!entitlements.quiz) throw new QuizCreditWalletError('QUIZ_PLAN_INACTIVE');

  const includedUsed = Math.min(Math.max(0, institute.includedQuizCredits ?? 0), amount);
  const lifetimeUsed = amount - includedUsed;
  const lifetimeCredits = Math.max(0, institute.lifetimeQuizCredits ?? 0);
  if (lifetimeCredits < lifetimeUsed) throw new QuizCreditWalletError('INSUFFICIENT_QUIZ_CREDITS');

  const updated = await persistWallet(
    tx,
    instituteId,
    Math.max(0, institute.includedQuizCredits ?? 0) - includedUsed,
    lifetimeCredits - lifetimeUsed
  );
  return projection(updated, now, true);
}

export function createQuizCreditWalletService(client: PrismaClient = prisma) {
  async function inWalletTransaction<T>(fn: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T> {
    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        return await client.$transaction(fn, {
          isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
          maxWait: 120_000,
          timeout: 120_000
        });
      } catch (error) {
        const isSerializationConflict = error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2034';
        if (!isSerializationConflict || attempt === 2) throw error;
      }
    }
    throw new Error('Unreachable wallet transaction state');
  }

  return {
    async getQuizCreditWallet(instituteId: string, now = new Date()): Promise<QuizCreditWallet> {
      return inWalletTransaction(async tx => {
        await lockInstitute(tx, instituteId);
        const institute = await refreshIfDue(tx, await loadWalletInstitute(tx, instituteId), now);
        return projection(institute, now);
      });
    },

    async consumeQuizCredits(instituteId: string, amount: number, now = new Date()): Promise<QuizCreditWallet> {
      return inWalletTransaction(tx => consumeQuizCreditsInTransaction(tx, instituteId, amount, now));
    },

    async grantLifetimeQuizCredits(input: GrantLifetimeQuizCreditsInput, now = new Date()): Promise<QuizCreditWallet> {
      assertPositiveInteger(input.amount);
      return inWalletTransaction(async tx => {
        await lockInstitute(tx, input.instituteId);
        const institute = await loadWalletInstitute(tx, input.instituteId);
        if (input.billingPaymentId) {
          await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${input.billingPaymentId}))`;
          const payment = await tx.billingPayment.findFirst({
            where: { id: input.billingPaymentId, instituteId: input.instituteId },
            select: { status: true }
          });
          if (!payment) throw new QuizCreditWalletError('BILLING_PAYMENT_NOT_FOUND');
          // The wallet increment and CREDITED transition share this transaction.
          // A stale recovery worker that arrives second observes CREDITED and no-ops.
          if (payment.status === 'CREDITED') return projection(institute, now);
          if (payment.status !== 'FULFILLING') throw new QuizCreditWalletError('BILLING_PAYMENT_NOT_CLAIMED');
        }
        const nextLifetimeCredits = Math.max(0, institute.lifetimeQuizCredits ?? 0) + input.amount;
        const updated = await persistWallet(tx, input.instituteId, Math.max(0, institute.includedQuizCredits ?? 0), nextLifetimeCredits);

        if (input.billingPaymentId) {
          const credited = await tx.billingPayment.updateMany({
            where: { id: input.billingPaymentId, instituteId: input.instituteId, status: 'FULFILLING' },
            data: { status: 'CREDITED', capturedAt: now }
          });
          if (credited.count !== 1) throw new QuizCreditWalletError('BILLING_PAYMENT_ALREADY_CREDITED');
        }

        if (input.actorAdminId) {
          await tx.superAdminAuditLog.create({
            data: {
              action: 'QUIZ_CREDITS_GRANTED',
              entityType: 'Institute',
              entityId: input.instituteId,
              actorAdminId: input.actorAdminId,
              instituteId: input.instituteId,
              reason: input.reason,
              correlationId: input.correlationId ?? `quiz-credit-grant:${input.instituteId}:${now.toISOString()}`,
              after: { lifetimeQuizCredits: nextLifetimeCredits, addedCredits: input.amount, source: input.source ?? 'MANUAL' }
            }
          });
        }

        return projection(updated, now);
      });
    },

    async refreshIncludedQuizCredits(instituteId: string, period: IncludedCreditPeriod, now = new Date()): Promise<QuizCreditWallet> {
      if (!(period.includedQuizCreditsExpireAt instanceof Date) || Number.isNaN(period.includedQuizCreditsExpireAt.getTime()) || !(period.quizCreditsRenewAt instanceof Date) || Number.isNaN(period.quizCreditsRenewAt.getTime())) {
        throw new QuizCreditWalletError('INVALID_INCLUDED_CREDIT_PERIOD');
      }
      return inWalletTransaction(async tx => {
        await lockInstitute(tx, instituteId);
        const institute = await loadWalletInstitute(tx, instituteId);
        const entitlements = effectiveEntitlements(institute, now);
        if (!entitlements.quiz) throw new QuizCreditWalletError('QUIZ_PLAN_INACTIVE');
        if (institute.quizCreditsRenewAt && institute.quizCreditsRenewAt.getTime() >= period.quizCreditsRenewAt.getTime()) {
          return projection(institute, now, true);
        }
        const updated = await persistWallet(tx, instituteId, 5, Math.max(0, institute.lifetimeQuizCredits ?? 0), period);
        return projection(updated, now, true);
      });
    }
  };
}

const defaultWallet = createQuizCreditWalletService();

export const getQuizCreditWallet = defaultWallet.getQuizCreditWallet;
export const consumeQuizCredits = defaultWallet.consumeQuizCredits;
export const grantLifetimeQuizCredits = defaultWallet.grantLifetimeQuizCredits;
export const refreshIncludedQuizCredits = defaultWallet.refreshIncludedQuizCredits;
