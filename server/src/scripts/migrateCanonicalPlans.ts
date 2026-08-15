import { PrismaClient } from '@prisma/client';
import type { CanonicalPlan } from '../domain/plans/planCatalog';

export type CanonicalMigrationMode = 'preflight' | 'apply';

const LEGACY_CANONICAL_PLAN: CanonicalPlan = 'ENTERPRISE';

type BusinessCounts = {
  instituteCount: number;
  studentCount: number;
  paymentCount: number;
  quizCount: number;
};

async function collectBusinessCounts(client: PrismaClient): Promise<BusinessCounts> {
  const [instituteCount, studentCount, paymentCount, quizCount] = await Promise.all([
    client.institute.count(),
    client.student.count(),
    client.feePayment.count(),
    client.onlineQuiz.count()
  ]);

  return { instituteCount, studentCount, paymentCount, quizCount };
}

function assertBusinessCountsUnchanged(before: BusinessCounts, after: BusinessCounts): void {
  if (
    before.instituteCount !== after.instituteCount ||
    before.studentCount !== after.studentCount ||
    before.paymentCount !== after.paymentCount ||
    before.quizCount !== after.quizCount
  ) {
    throw new Error('CANONICAL_PLAN_MIGRATION_CHANGED_BUSINESS_COUNTS');
  }
}

export async function migrateCanonicalPlans(client: PrismaClient, mode: CanonicalMigrationMode, now = new Date()) {
  const before = await collectBusinessCounts(client);
  const candidates = await client.institute.findMany({
    where: { canonicalPlanMigratedAt: null },
    select: { id: true, createdAt: true, planExpiryDate: true, quizCredits: true }
  });

  if (mode === 'preflight') return { mode, before, candidates: candidates.length };

  await client.$transaction(async tx => {
    for (const institute of candidates) {
      const active = !institute.planExpiryDate || institute.planExpiryDate.getTime() >= now.getTime();
      await tx.institute.update({
        where: { id: institute.id },
        data: {
          plan: LEGACY_CANONICAL_PLAN,
          marketplaceAccessGrantedAt: institute.createdAt,
          lifetimeQuizCredits: institute.quizCredits,
          includedQuizCredits: active ? 5 : 0,
          canonicalPlanMigratedAt: now
        },
        select: { id: true }
      });
    }
  });

  const after = await collectBusinessCounts(client);
  assertBusinessCountsUnchanged(before, after);
  return { mode, before, after, migrated: candidates.length };
}
