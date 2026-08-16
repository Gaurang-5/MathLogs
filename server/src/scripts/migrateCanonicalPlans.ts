import { Prisma, PrismaClient } from '@prisma/client';
import type { CanonicalPlan } from '../domain/plans/planCatalog';
import { includedCreditPeriod } from '../domain/plans/entitlements';
import 'dotenv/config';

export type CanonicalMigrationMode = 'preflight' | 'apply';
export type CreditPeriodResolver = (institute: { id: string; createdAt: Date; planStartDate: Date | null; planExpiryDate: Date | null; quizCredits: number }, now: Date) => {
  includedQuizCreditsExpireAt: Date;
  quizCreditsRenewAt: Date;
};

const LEGACY_CANONICAL_PLAN: CanonicalPlan = 'ENTERPRISE';
export const CANONICAL_PLAN_CUTOVER_AT = new Date('2026-08-16T00:00:00.000Z');
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
    const candidateWhere = { OR: [
      { canonicalPlanMigratedAt: null, createdAt: { lt: CANONICAL_PLAN_CUTOVER_AT } },
      { plan: { in: ['FREE', 'PRO', 'BASIC', 'NO_PLAN'] as const } },
      { isQuizOnly: true, canonicalPlanMigratedAt: null }
    ] } satisfies Prisma.InstituteWhereInput;
    const candidates = await tx.institute.findMany({ where: candidateWhere, select: { id: true, createdAt: true, planStartDate: true, planExpiryDate: true, quizCredits: true } });
    if (mode === 'preflight') return { mode, before, candidates: candidates.length };

    const prepared = candidates.map(institute => {
      const active = !institute.planExpiryDate || institute.planExpiryDate.getTime() >= now.getTime();
      return { institute, active, period: active ? requireCreditPeriod(resolver, institute, now) : null };
    });
    for (const { institute, active, period } of prepared) {
      const updated = await tx.institute.updateMany({
        where: { id: institute.id, ...candidateWhere },
        data: { plan: LEGACY_CANONICAL_PLAN, isQuizOnly: false, marketplaceAccessGrantedAt: institute.createdAt, lifetimeQuizCredits: institute.quizCredits, includedQuizCredits: active ? 5 : 0, quizCredits: institute.quizCredits + (active ? 5 : 0), includedQuizCreditsExpireAt: period?.includedQuizCreditsExpireAt ?? null, quizCreditsRenewAt: period?.quizCreditsRenewAt ?? null, canonicalPlanMigratedAt: now }
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

type PreflightReport = {
  mode: 'preflight';
  target: { host: string; port: string; database: string; schema: string };
  canonicalSchemaInstalled: boolean;
  candidates: number;
  planDistribution: Array<{ plan: string; institutes: number }>;
  aggregateQuizCredits: number;
  protectedCounts: BusinessCounts;
};

function databaseFingerprint(): PreflightReport['target'] {
  const configured = process.env.DATABASE_URL;
  if (!configured) throw new Error('DATABASE_URL_REQUIRED');
  const url = new URL(configured);
  return {
    host: url.hostname,
    port: url.port || '5432',
    database: decodeURIComponent(url.pathname.replace(/^\//, '')),
    schema: url.searchParams.get('schema') || 'public'
  };
}

export async function canonicalMigrationPreflight(client: PrismaClient): Promise<PreflightReport> {
  const target = databaseFingerprint();
  const columns = await client.$queryRaw<Array<{ installed: boolean }>>`
    SELECT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = current_schema() AND table_name = 'Institute' AND column_name = 'canonicalPlanMigratedAt'
    ) AS installed`;
  const canonicalSchemaInstalled = Boolean(columns[0]?.installed);
  const candidateRows = canonicalSchemaInstalled
    ? await client.$queryRaw<Array<{ count: number }>>`SELECT COUNT(*)::integer AS count FROM "Institute" WHERE ("canonicalPlanMigratedAt" IS NULL AND "createdAt" < ${CANONICAL_PLAN_CUTOVER_AT}) OR "plan"::text IN ('FREE', 'PRO', 'BASIC', 'NO_PLAN') OR ("isQuizOnly" = true AND "canonicalPlanMigratedAt" IS NULL)`
    : await client.$queryRaw<Array<{ count: number }>>`SELECT COUNT(*)::integer AS count FROM "Institute" WHERE "createdAt" < ${CANONICAL_PLAN_CUTOVER_AT}`;
  const planDistribution = await client.$queryRaw<Array<{ plan: string; institutes: number }>>`
    SELECT "plan"::text AS plan, COUNT(*)::integer AS institutes FROM "Institute" GROUP BY "plan" ORDER BY "plan"::text`;
  const credits = await client.$queryRaw<Array<{ total: number }>>`SELECT COALESCE(SUM("quizCredits"), 0)::integer AS total FROM "Institute"`;
  return {
    mode: 'preflight', target, canonicalSchemaInstalled, candidates: candidateRows[0]?.count ?? 0,
    planDistribution, aggregateQuizCredits: credits[0]?.total ?? 0, protectedCounts: await collectBusinessCounts(client)
  };
}

async function runCli() {
  const argument = process.argv[2];
  if (argument !== '--preflight' && argument !== '--apply') throw new Error('Usage: migrateCanonicalPlans.ts --preflight|--apply');
  const client = new PrismaClient();
  try {
    const before = await canonicalMigrationPreflight(client);
    if (argument === '--preflight') return console.log(JSON.stringify(before, null, 2));
    if (!before.canonicalSchemaInstalled) throw new Error('CANONICAL_SCHEMA_NOT_INSTALLED');
    const applied = await migrateCanonicalPlans(client, 'apply');
    const after = await canonicalMigrationPreflight(client);
    console.log(JSON.stringify({ before, applied, after }, null, 2));
  } finally {
    await client.$disconnect();
  }
}

if (require.main === module) {
  void runCli().catch(error => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
