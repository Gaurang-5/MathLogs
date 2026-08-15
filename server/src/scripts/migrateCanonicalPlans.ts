import { Prisma, PrismaClient } from '@prisma/client';
import type { CanonicalPlan } from '../domain/plans/planCatalog';
import { includedCreditPeriod } from '../domain/plans/entitlements';

export type CanonicalMigrationMode = 'preflight' | 'apply';
export type CreditPeriodResolver = (institute: { id: string; createdAt: Date; planStartDate: Date | null; planExpiryDate: Date | null; quizCredits: number }, now: Date) => {
  includedQuizCreditsExpireAt: Date;
  quizCreditsRenewAt: Date;
};

const LEGACY_CANONICAL_PLAN: CanonicalPlan = 'ENTERPRISE';
type CountClient = Pick<PrismaClient, '$queryRawUnsafe'>;
type BusinessCounts = { instituteCount: number; adminCount: number; studentCount: number; batchCount: number; paymentCount: number; quizCount: number; marketplaceClaimCount: number; leadInquiryCount: number; reviewCount: number };

async function collectBusinessCounts(client: CountClient): Promise<BusinessCounts> {
  const rows = await client.$queryRawUnsafe<BusinessCounts[]>(`SELECT
    (SELECT COUNT(*)::integer FROM "Institute") AS "instituteCount",
    (SELECT COUNT(*)::integer FROM "Admin") AS "adminCount",
    (SELECT COUNT(*)::integer FROM "Student") AS "studentCount",
    (SELECT COUNT(*)::integer FROM "Batch") AS "batchCount",
    (SELECT COUNT(*)::integer FROM "FeePayment") AS "paymentCount",
    (SELECT COUNT(*)::integer FROM "OnlineQuiz") AS "quizCount",
    (SELECT COUNT(*)::integer FROM "MarketplaceClaim") AS "marketplaceClaimCount",
    (SELECT COUNT(*)::integer FROM "LeadInquiry") AS "leadInquiryCount",
    (SELECT COUNT(*)::integer FROM "Review") AS "reviewCount"`);
  return rows[0];
}

function assertBusinessCountsUnchanged(before: BusinessCounts, after: BusinessCounts): void {
  if (Object.keys(before).some(key => before[key as keyof BusinessCounts] !== after[key as keyof BusinessCounts])) throw new Error('CANONICAL_PLAN_MIGRATION_CHANGED_BUSINESS_COUNTS');
}

function requireCreditPeriod(resolver: CreditPeriodResolver, institute: { id: string; createdAt: Date; planStartDate: Date | null; planExpiryDate: Date | null; quizCredits: number }, now: Date) {
  const period = resolver(institute, now);
  if (!(period.includedQuizCreditsExpireAt instanceof Date) || Number.isNaN(period.includedQuizCreditsExpireAt.getTime()) || !(period.quizCreditsRenewAt instanceof Date) || Number.isNaN(period.quizCreditsRenewAt.getTime())) {
    throw new Error('INVALID_CREDIT_PERIOD');
  }
  return period;
}

export const resolveMigratedIncludedCreditPeriod: CreditPeriodResolver = (institute, now) =>
  includedCreditPeriod({ planStartDate: institute.planStartDate, createdAt: institute.createdAt }, now);

export async function migrateCanonicalPlans(client: PrismaClient, mode: CanonicalMigrationMode, now = new Date(), creditPeriodResolver?: CreditPeriodResolver) {
  if (mode !== 'preflight' && mode !== 'apply') throw new Error('INVALID_CANONICAL_MIGRATION_MODE');
  const resolver = creditPeriodResolver ?? resolveMigratedIncludedCreditPeriod;

  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      return await client.$transaction(async tx => {
    await tx.$executeRawUnsafe('SELECT pg_advisory_xact_lock(64271, 2)');
    const before = await collectBusinessCounts(tx);
    const candidates = await tx.institute.findMany({ where: { canonicalPlanMigratedAt: null }, select: { id: true, createdAt: true, planStartDate: true, planExpiryDate: true, quizCredits: true } });
    if (mode === 'preflight') return { mode, before, candidates: candidates.length };

    const prepared = candidates.map(institute => {
      const active = !institute.planExpiryDate || institute.planExpiryDate.getTime() >= now.getTime();
      return { institute, active, period: active ? requireCreditPeriod(resolver, institute, now) : null };
    });
    for (const { institute, active, period } of prepared) {
      const updated = await tx.institute.updateMany({
        where: { id: institute.id, canonicalPlanMigratedAt: null },
        data: { plan: LEGACY_CANONICAL_PLAN, marketplaceAccessGrantedAt: institute.createdAt, lifetimeQuizCredits: institute.quizCredits, includedQuizCredits: active ? 5 : 0, includedQuizCreditsExpireAt: period?.includedQuizCreditsExpireAt ?? null, quizCreditsRenewAt: period?.quizCreditsRenewAt ?? null, canonicalPlanMigratedAt: now }
      });
      if (updated.count !== 1) throw new Error('CANONICAL_PLAN_MIGRATION_STALE_CANDIDATE');
    }
    const after = await collectBusinessCounts(tx);
    assertBusinessCountsUnchanged(before, after);
    return { mode, before, after, migrated: candidates.length };
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, maxWait: 120_000, timeout: 120_000 });
    } catch (error) {
      if ((error as { code?: string }).code !== 'P2034' || attempt === 2) throw error;
    }
  }
  throw new Error('CANONICAL_PLAN_MIGRATION_RETRY_EXHAUSTED');
}
