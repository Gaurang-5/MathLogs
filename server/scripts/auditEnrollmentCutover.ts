import { prisma } from '../src/prisma';

export const CUTOVER_QUERIES = {
  approvedStudents: `SELECT COUNT(*)::int AS count FROM "Student" WHERE status = 'APPROVED'`,
  legacyPendingStudents: `SELECT COUNT(*)::int AS count FROM "Student" WHERE status = 'PENDING'`,
  activeEnrollments: `SELECT COUNT(*)::int AS count FROM "Enrollment" WHERE status = 'ACTIVE'`,
  duplicateActiveMemberships: `
    SELECT COUNT(*)::int AS count
    FROM (
      SELECT "studentId", "batchId"
      FROM "Enrollment"
      WHERE status = 'ACTIVE'
      GROUP BY "studentId", "batchId"
      HAVING COUNT(*) > 1
    ) duplicates`,
  crossTenantEnrollments: `
    SELECT COUNT(*)::int AS count
    FROM "Enrollment" enrollment
    JOIN "Student" student ON student.id = enrollment."studentId"
    JOIN "Batch" batch ON batch.id = enrollment."batchId"
    WHERE enrollment."instituteId" IS DISTINCT FROM student."instituteId"
       OR enrollment."instituteId" IS DISTINCT FROM batch."instituteId"`,
  unlinkedMonthCoverageRows: `
    SELECT COALESCE(SUM(rows.count), 0)::int AS count
    FROM (
      SELECT COUNT(*)::int AS count FROM "StudentMonthCoverageProfile" WHERE "enrollmentId" IS NULL
      UNION ALL
      SELECT COUNT(*)::int AS count FROM "MonthCoveragePayment" WHERE "enrollmentId" IS NULL
      UNION ALL
      SELECT COUNT(*)::int AS count FROM "MonthCoverageAllocation" WHERE "enrollmentId" IS NULL
    ) rows`,
  pendingReconciliationEntries: `
    SELECT COUNT(*)::int AS count
    FROM "Student" student
    WHERE NOT EXISTS (
        SELECT 1 FROM "Enrollment" enrollment WHERE enrollment."studentId" = student.id
      )
      AND (
        student."batchId" IS NOT NULL
        OR EXISTS (SELECT 1 FROM "StudentMonthCoverageProfile" profile WHERE profile."studentId" = student.id)
        OR EXISTS (SELECT 1 FROM "FeeInstallment" installment WHERE installment."studentId" = student.id)
        OR EXISTS (SELECT 1 FROM "FeePayment" payment WHERE payment."studentId" = student.id)
        OR EXISTS (SELECT 1 FROM "Mark" mark WHERE mark."studentId" = student.id)
      )`,
  unresolvedIdentityReviews: `SELECT COUNT(*)::int AS count FROM "StudentIdentityReview" WHERE status = 'PENDING'`,
  lifecycleNotificationFailures: `SELECT COUNT(*)::int AS count FROM "WhatsappJob" WHERE status = 'FAILED' AND "eventKey" LIKE 'enrollment:%'`,
} as const;

export type EnrollmentCutoverCountKey = keyof typeof CUTOVER_QUERIES;

export type EnrollmentCutoverDb = {
  count(sql: string): Promise<number>;
};

type AuditItem = { code: string; count: number };

const blockerCodes: Array<[EnrollmentCutoverCountKey, string]> = [
  ['unresolvedIdentityReviews', 'UNRESOLVED_IDENTITY_REVIEW'],
  ['unlinkedMonthCoverageRows', 'UNLINKED_MONTH_COVERAGE_ROW'],
  ['legacyPendingStudents', 'LEGACY_PENDING_STUDENT'],
  ['duplicateActiveMemberships', 'DUPLICATE_ACTIVE_MEMBERSHIP'],
  ['crossTenantEnrollments', 'CROSS_TENANT_ENROLLMENT'],
  ['pendingReconciliationEntries', 'PENDING_RECONCILIATION_ENTRY'],
];

export async function auditEnrollmentCutover(db: EnrollmentCutoverDb) {
  const entries = await Promise.all(
    Object.entries(CUTOVER_QUERIES).map(async ([key, sql]) => [key, await db.count(sql)] as const),
  );
  const counts = Object.fromEntries(entries) as Record<EnrollmentCutoverCountKey, number>;
  const blockers: AuditItem[] = blockerCodes
    .map(([key, code]) => ({ code, count: counts[key] }))
    .filter(item => item.count > 0);
  const warnings: AuditItem[] = counts.lifecycleNotificationFailures > 0
    ? [{ code: 'LIFECYCLE_NOTIFICATION_FAILURE', count: counts.lifecycleNotificationFailures }]
    : [];

  return {
    generatedAt: new Date().toISOString(),
    ready: blockers.length === 0,
    counts,
    blockers,
    warnings,
  };
}

async function main() {
  const report = await auditEnrollmentCutover({
    async count(sql) {
      const rows = await prisma.$queryRawUnsafe<Array<{ count: number | bigint }>>(sql);
      return Number(rows[0]?.count || 0);
    },
  });
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  if (!report.ready) process.exitCode = 2;
}

if (require.main === module) {
  void main()
    .catch(error => {
      console.error(error);
      process.exitCode = 1;
    })
    .finally(() => prisma.$disconnect());
}
