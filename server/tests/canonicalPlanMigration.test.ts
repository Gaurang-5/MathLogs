import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { Client } from 'pg';
import { PrismaClient } from '@prisma/client';
import 'dotenv/config';
import { migrateCanonicalPlans } from '../src/scripts/migrateCanonicalPlans';

type BusinessCounts = {
  instituteCount: number;
  studentCount: number;
  paymentCount: number;
  quizCount: number;
};

function schemaUrl(schema: string): string {
  const url = new URL(process.env.DATABASE_URL!);
  url.searchParams.set('schema', schema);
  return url.toString();
}

async function businessCounts(client: Client): Promise<BusinessCounts> {
  const result = await client.query<BusinessCounts>(`
    SELECT
      (SELECT COUNT(*)::integer FROM "Institute") AS "instituteCount",
      (SELECT COUNT(*)::integer FROM "Student") AS "studentCount",
      (SELECT COUNT(*)::integer FROM "FeePayment") AS "paymentCount",
      (SELECT COUNT(*)::integer FROM "OnlineQuiz") AS "quizCount"
  `);
  return result.rows[0];
}

test('canonical billing migration preserves business rows and applies canonical defaults exactly once', async () => {
  const schema = `canonical_plan_migration_${Date.now()}_${Math.random().toString(16).slice(2)}`;
  const postgres = new Client({ connectionString: process.env.DATABASE_URL });
  await postgres.connect();

  let prisma: PrismaClient | undefined;
  try {
    await postgres.query(`CREATE SCHEMA "${schema}"`);
    await postgres.query(`SET search_path TO "${schema}"`);
    await postgres.query(`
      CREATE TYPE "Tier" AS ENUM ('FREE', 'PRO', 'ENTERPRISE', 'NO_PLAN', 'BASIC');
      CREATE TABLE "Institute" (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        "createdAt" TIMESTAMP(3) NOT NULL,
        "updatedAt" TIMESTAMP(3) NOT NULL,
        plan "Tier" NOT NULL DEFAULT 'FREE',
        "planExpiryDate" TIMESTAMP(3),
        "quizCredits" INTEGER NOT NULL DEFAULT 0,
        "isQuizOnly" BOOLEAN NOT NULL DEFAULT false
      );
      CREATE TABLE "Student" (id TEXT PRIMARY KEY);
      CREATE TABLE "FeePayment" (id TEXT PRIMARY KEY);
      CREATE TABLE "OnlineQuiz" (id TEXT PRIMARY KEY);

      INSERT INTO "Institute" (id, name, "createdAt", "updatedAt", plan, "planExpiryDate", "quizCredits", "isQuizOnly") VALUES
        ('free-no-expiry', 'FREE no expiry', '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z', 'FREE', NULL, 0, false),
        ('basic-active', 'BASIC active', '2026-01-02T00:00:00.000Z', '2026-01-02T00:00:00.000Z', 'BASIC', '2026-09-01T00:00:00.000Z', 9, false),
        ('pro-expired', 'PRO expired', '2026-01-03T00:00:00.000Z', '2026-01-03T00:00:00.000Z', 'PRO', '2026-07-01T00:00:00.000Z', 4, false),
        ('enterprise-active', 'ENTERPRISE active', '2026-01-04T00:00:00.000Z', '2026-01-04T00:00:00.000Z', 'ENTERPRISE', '2026-10-01T00:00:00.000Z', 6, false),
        ('no-plan-expired', 'NO_PLAN expired', '2026-01-05T00:00:00.000Z', '2026-01-05T00:00:00.000Z', 'NO_PLAN', '2026-07-15T00:00:00.000Z', 0, false),
        ('quiz-only', 'Quiz-only legacy', '2026-01-06T00:00:00.000Z', '2026-01-06T00:00:00.000Z', 'FREE', NULL, 12, true),
        ('page-only', 'PAGE_ONLY legacy', '2026-01-07T00:00:00.000Z', '2026-01-07T00:00:00.000Z', 'FREE', NULL, 3, false);
      INSERT INTO "Student" (id) VALUES ('student-1');
      INSERT INTO "FeePayment" (id) VALUES ('payment-1');
      INSERT INTO "OnlineQuiz" (id) VALUES ('quiz-1');
    `);

    const before = await businessCounts(postgres);
    const beforeInstitutes = await postgres.query(`SELECT id, "planExpiryDate", "quizCredits" FROM "Institute" ORDER BY id`);

    const migration = await readFile(path.join(
      process.cwd(),
      'prisma/migrations/20260816140000_canonical_three_plan_billing/migration.sql'
    ), 'utf8');
    await postgres.query(migration);

    const durableTables = await postgres.query<{ table_name: string }>(`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = current_schema()
        AND table_name IN ('BillingPayment', 'PlanTrialClaim', 'BillingWebhookEvent', 'PlanNotification')
      ORDER BY table_name
    `);
    assert.deepEqual(durableTables.rows.map(row => row.table_name), [
      'BillingPayment',
      'BillingWebhookEvent',
      'PlanNotification',
      'PlanTrialClaim'
    ]);

    prisma = new PrismaClient({ datasources: { db: { url: schemaUrl(schema) } } });
    const now = new Date('2026-08-16T12:00:00.000Z');
    const preflight = await migrateCanonicalPlans(prisma, 'preflight', now);
    assert.deepEqual(preflight, { mode: 'preflight', before, candidates: 7 });

    const unchangedAfterPreflight = await postgres.query(`SELECT plan, "canonicalPlanMigratedAt" FROM "Institute" ORDER BY id`);
    assert.ok(unchangedAfterPreflight.rows.every(row => row.plan !== 'ENTERPRISE' || row.canonicalPlanMigratedAt === null));

    const applied = await migrateCanonicalPlans(prisma, 'apply', now);
    assert.equal(applied.migrated, 7);
    assert.deepEqual(applied.before, before);
    assert.deepEqual(applied.after, before);

    const after = await businessCounts(postgres);
    const institutes = await postgres.query(`
      SELECT id, plan, "planExpiryDate", "marketplaceAccessGrantedAt", "includedQuizCredits", "lifetimeQuizCredits", "canonicalPlanMigratedAt"
      FROM "Institute"
      ORDER BY id
    `);
    const rowsById = new Map(institutes.rows.map(row => [row.id, row]));

    assert.equal(after.instituteCount, before.instituteCount);
    assert.equal(after.studentCount, before.studentCount);
    assert.equal(after.paymentCount, before.paymentCount);
    assert.equal(after.quizCount, before.quizCount);
    assert.ok(institutes.rows.every(row => row.plan === 'ENTERPRISE'));
    assert.ok(institutes.rows.every(row => row.marketplaceAccessGrantedAt !== null));
    assert.deepEqual(
      institutes.rows.map(row => row.lifetimeQuizCredits),
      beforeInstitutes.rows.map(row => row.quizCredits)
    );
    assert.equal(rowsById.get('pro-expired')?.includedQuizCredits, 0);
    assert.equal(rowsById.get('basic-active')?.includedQuizCredits, 5);
    assert.deepEqual(
      institutes.rows.map(row => ({ id: row.id, planExpiryDate: row.planExpiryDate?.toISOString() })),
      beforeInstitutes.rows.map(row => ({ id: row.id, planExpiryDate: row.planExpiryDate?.toISOString() }))
    );
    assert.equal(
      rowsById.get('basic-active')?.planExpiryDate?.toISOString(),
      beforeInstitutes.rows.find(row => row.id === 'basic-active')?.planExpiryDate?.toISOString()
    );

    const retry = await migrateCanonicalPlans(prisma, 'apply', new Date('2026-08-17T12:00:00.000Z'));
    assert.equal(retry.migrated, 0);
    assert.deepEqual(retry.before, before);
    assert.deepEqual(retry.after, before);
  } finally {
    await prisma?.$disconnect();
    await postgres.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
    await postgres.end();
  }
});
