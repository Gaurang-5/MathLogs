import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { Client } from 'pg';
import { PrismaClient } from '@prisma/client';
import 'dotenv/config';
import { migrateCanonicalPlans } from '../src/scripts/migrateCanonicalPlans';
import { includedCreditPeriod } from '../src/domain/plans/entitlements';

type BusinessCounts = {
  instituteCount: number;
  adminCount: number;
  studentCount: number;
  batchCount: number;
  paymentCount: number;
  quizCount: number;
  marketplaceClaimCount: number;
  leadInquiryCount: number;
  reviewCount: number;
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
      (SELECT COUNT(*)::integer FROM "Admin") AS "adminCount",
      (SELECT COUNT(*)::integer FROM "Student") AS "studentCount",
      (SELECT COUNT(*)::integer FROM "Batch") AS "batchCount",
      (SELECT COUNT(*)::integer FROM "FeePayment") AS "paymentCount",
      (SELECT COUNT(*)::integer FROM "OnlineQuiz") AS "quizCount",
      (SELECT COUNT(*)::integer FROM "MarketplaceClaim") AS "marketplaceClaimCount",
      (SELECT COUNT(*)::integer FROM "LeadInquiry") AS "leadInquiryCount",
      (SELECT COUNT(*)::integer FROM "Review") AS "reviewCount"
  `);
  return result.rows[0];
}

async function instituteMigrationState(client: Client) {
  return (await client.query(`
    SELECT id, plan, config, "createdAt", "isPubliclyListed", "planStartDate", "planExpiryDate", "quizCredits",
      "billingCycle", "trialStartedAt", "trialEndsAt", "trialUsedAt", "marketplaceAccessGrantedAt",
      "includedQuizCredits", "includedQuizCreditsExpireAt", "lifetimeQuizCredits", "quizCreditsRenewAt",
      "canonicalPlanMigratedAt"
    FROM "Institute" ORDER BY id
  `)).rows;
}

async function rejectsWithCode(operation: Promise<unknown>, code: string): Promise<void> {
  await assert.rejects(operation, (error: { code?: string }) => error.code === code);
}

test('canonical billing migration is rerunnable, preserves protected rows, and applies complete canonical state exactly once', async () => {
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
        id TEXT PRIMARY KEY, name TEXT NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL, "updatedAt" TIMESTAMP(3) NOT NULL,
        plan "Tier" NOT NULL DEFAULT 'FREE', config JSONB, "isPubliclyListed" BOOLEAN NOT NULL DEFAULT false,
        "planStartDate" TIMESTAMP(3), "planExpiryDate" TIMESTAMP(3), "quizCredits" INTEGER NOT NULL DEFAULT 0,
        "isQuizOnly" BOOLEAN NOT NULL DEFAULT false
      );
      CREATE TABLE "Admin" (id TEXT PRIMARY KEY); CREATE TABLE "Student" (id TEXT PRIMARY KEY);
      CREATE TABLE "Batch" (id TEXT PRIMARY KEY); CREATE TABLE "FeePayment" (id TEXT PRIMARY KEY);
      CREATE TABLE "OnlineQuiz" (id TEXT PRIMARY KEY); CREATE TABLE "MarketplaceClaim" (id TEXT PRIMARY KEY);
      CREATE TABLE "LeadInquiry" (id TEXT PRIMARY KEY); CREATE TABLE "Review" (id TEXT PRIMARY KEY);
      INSERT INTO "Institute" (id, name, "createdAt", "updatedAt", plan, config, "isPubliclyListed", "planStartDate", "planExpiryDate", "quizCredits", "isQuizOnly") VALUES
        ('free-no-expiry', 'FREE no expiry', '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z', 'FREE', '{"kind":"FULL"}', false, '2026-01-01T00:00:00.000Z', NULL, 0, false),
        ('basic-active', 'BASIC active', '2026-01-02T00:00:00.000Z', '2026-01-02T00:00:00.000Z', 'BASIC', '{"kind":"FULL"}', false, '2026-01-02T00:00:00.000Z', '2026-09-01T00:00:00.000Z', 9, false),
        ('pro-expired', 'PRO expired', '2026-01-03T00:00:00.000Z', '2026-01-03T00:00:00.000Z', 'PRO', '{"kind":"FULL"}', false, '2026-01-03T00:00:00.000Z', '2026-07-01T00:00:00.000Z', 4, false),
        ('enterprise-active', 'ENTERPRISE active', '2026-01-04T00:00:00.000Z', '2026-01-04T00:00:00.000Z', 'ENTERPRISE', '{"kind":"FULL"}', false, '2026-01-04T00:00:00.000Z', '2026-10-01T00:00:00.000Z', 6, false),
        ('no-plan-expired', 'NO_PLAN expired', '2026-01-05T00:00:00.000Z', '2026-01-05T00:00:00.000Z', 'NO_PLAN', '{"kind":"FULL"}', false, '2026-01-05T00:00:00.000Z', '2026-07-15T00:00:00.000Z', 0, false),
        ('quiz-only', 'Quiz-only legacy', '2026-01-06T00:00:00.000Z', '2026-01-06T00:00:00.000Z', 'FREE', '{"kind":"QUIZ_ONLY"}', false, '2026-01-06T00:00:00.000Z', NULL, 12, true),
        ('page-only', 'PAGE_ONLY legacy', '2026-01-07T00:00:00.000Z', '2026-01-07T00:00:00.000Z', 'FREE', '{"kind":"PAGE_ONLY","listing":"public"}', true, '2026-01-07T00:00:00.000Z', NULL, 3, false);
      INSERT INTO "Admin" (id) VALUES ('admin-1'); INSERT INTO "Student" (id) VALUES ('student-1');
      INSERT INTO "Batch" (id) VALUES ('batch-1'); INSERT INTO "FeePayment" (id) VALUES ('payment-1');
      INSERT INTO "OnlineQuiz" (id) VALUES ('quiz-1'); INSERT INTO "MarketplaceClaim" (id) VALUES ('claim-1');
      INSERT INTO "LeadInquiry" (id) VALUES ('lead-1'); INSERT INTO "Review" (id) VALUES ('review-1');
    `);

    const before = await businessCounts(postgres);
    const migration = await readFile(path.join(process.cwd(), 'prisma/migrations/20260816140000_canonical_three_plan_billing/migration.sql'), 'utf8');
    await postgres.query(migration);
    await postgres.query(migration);
    await postgres.query(`
      INSERT INTO "Institute" (id, name, "createdAt", "updatedAt", plan, "quizCredits", "includedQuizCredits", "lifetimeQuizCredits", "canonicalPlanMigratedAt")
      VALUES
        ('post-cutover', 'Post-cutover canonical account', '2026-08-17T00:00:00.000Z', '2026-08-17T00:00:00.000Z', 'QUIZ', 5, 5, 0, NULL),
        ('post-cutover-legacy', 'Post-cutover legacy account', '2026-08-17T00:00:00.000Z', '2026-08-17T00:00:00.000Z', 'FREE', 2, 0, 0, CURRENT_TIMESTAMP)
    `);
    const expectedCounts = { ...before, instituteCount: before.instituteCount + 2 };

    const durableTables = await postgres.query<{ table_name: string }>(`
      SELECT table_name FROM information_schema.tables WHERE table_schema = current_schema()
      AND table_name IN ('BillingPayment', 'PlanTrialClaim', 'BillingWebhookEvent', 'PlanNotification') ORDER BY table_name
    `);
    assert.deepEqual(durableTables.rows.map(row => row.table_name), ['BillingPayment', 'BillingWebhookEvent', 'PlanNotification', 'PlanTrialClaim']);

    await postgres.query(`
      INSERT INTO "BillingPayment" (id, "instituteId", plan, "amountPaise", "providerOrderId", "providerPaymentId", "updatedAt") VALUES ('canonical-payment', 'free-no-expiry', 'QUIZ', 24900, 'order-canonical', 'payment-canonical', CURRENT_TIMESTAMP);
      INSERT INTO "BillingPayment" (id, "instituteId", "creditPackId", "amountPaise", "providerOrderId", "updatedAt") VALUES ('pack-payment', 'free-no-expiry', 'pack-10', 9900, 'order-pack', CURRENT_TIMESTAMP);
      INSERT INTO "PlanTrialClaim" (id, "instituteId", "ownerIdentityHash", plan, "updatedAt") VALUES ('trial-1', 'basic-active', 'owner-hash-1', 'QUIZ', CURRENT_TIMESTAMP);
      INSERT INTO "BillingWebhookEvent" (id, "instituteId", "providerEventId", "eventType", payload, "updatedAt") VALUES ('webhook-1', 'free-no-expiry', 'event-1', 'payment.captured', '{"safe":true}', CURRENT_TIMESTAMP);
      INSERT INTO "PlanNotification" (id, "instituteId", event, "eventKey", channel, "scheduledAt", "updatedAt") VALUES ('notification-1', 'free-no-expiry', 'TRIAL_ENDING', 'trial-ending-1', 'EMAIL', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);
    `);
    await rejectsWithCode(postgres.query(`INSERT INTO "BillingPayment" (id, "instituteId", "amountPaise", "providerOrderId", "updatedAt") VALUES ('payment-neither', 'free-no-expiry', 1, 'order-neither', CURRENT_TIMESTAMP)`), '23514');
    await rejectsWithCode(postgres.query(`INSERT INTO "BillingPayment" (id, "instituteId", plan, "creditPackId", "amountPaise", "providerOrderId", "updatedAt") VALUES ('payment-both', 'free-no-expiry', 'QUIZ', 'pack-10', 1, 'order-both', CURRENT_TIMESTAMP)`), '23514');
    await rejectsWithCode(postgres.query(`INSERT INTO "BillingPayment" (id, "instituteId", plan, "amountPaise", "providerOrderId", "updatedAt") VALUES ('payment-legacy', 'free-no-expiry', 'FREE', 1, 'order-legacy', CURRENT_TIMESTAMP)`), '23514');
    await rejectsWithCode(postgres.query(`INSERT INTO "BillingPayment" (id, "instituteId", plan, "amountPaise", "providerOrderId", "updatedAt") VALUES ('payment-order-duplicate', 'free-no-expiry', 'QUIZ', 1, 'order-canonical', CURRENT_TIMESTAMP)`), '23505');
    await rejectsWithCode(postgres.query(`INSERT INTO "BillingPayment" (id, "instituteId", plan, "amountPaise", "providerOrderId", "providerPaymentId", "updatedAt") VALUES ('payment-provider-duplicate', 'free-no-expiry', 'QUIZ', 1, 'order-other', 'payment-canonical', CURRENT_TIMESTAMP)`), '23505');
    await rejectsWithCode(postgres.query(`INSERT INTO "BillingPayment" (id, "instituteId", plan, "amountPaise", "providerOrderId", "updatedAt") VALUES ('payment-fk', 'missing-institute', 'QUIZ', 1, 'order-fk', CURRENT_TIMESTAMP)`), '23503');
    await rejectsWithCode(postgres.query(`INSERT INTO "PlanTrialClaim" (id, "instituteId", "ownerIdentityHash", plan, "updatedAt") VALUES ('trial-institute-duplicate', 'basic-active', 'owner-hash-2', 'QUIZ', CURRENT_TIMESTAMP)`), '23505');
    await rejectsWithCode(postgres.query(`INSERT INTO "PlanTrialClaim" (id, "instituteId", "ownerIdentityHash", plan, "updatedAt") VALUES ('trial-owner-duplicate', 'enterprise-active', 'owner-hash-1', 'QUIZ', CURRENT_TIMESTAMP)`), '23505');
    await rejectsWithCode(postgres.query(`INSERT INTO "BillingWebhookEvent" (id, "providerEventId", "eventType", payload, "updatedAt") VALUES ('webhook-duplicate', 'event-1', 'payment.captured', '{"safe":true}', CURRENT_TIMESTAMP)`), '23505');
    await rejectsWithCode(postgres.query({ text: 'INSERT INTO "BillingWebhookEvent" (id, "providerEventId", "eventType", payload, "updatedAt") VALUES ($1, $2, $3, $4::jsonb, CURRENT_TIMESTAMP)', values: ['webhook-oversize', 'event-oversize', 'payment.captured', JSON.stringify({ payload: 'x'.repeat(33_000) })] }), '23514');
    await rejectsWithCode(postgres.query(`INSERT INTO "PlanNotification" (id, "instituteId", event, "eventKey", channel, "scheduledAt", "updatedAt") VALUES ('notification-duplicate', 'free-no-expiry', 'TRIAL_ENDING', 'trial-ending-1', 'EMAIL', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`), '23505');
    await rejectsWithCode(postgres.query(`INSERT INTO "PlanNotification" (id, "instituteId", event, "eventKey", channel, "scheduledAt", "updatedAt") VALUES ('notification-fk', 'missing-institute', 'TRIAL_ENDING', 'fk', 'EMAIL', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`), '23503');

    prisma = new PrismaClient({ datasources: { db: { url: schemaUrl(schema) } } });
    const now = new Date('2026-08-16T12:00:00.000Z');
    const beforePreflightState = await instituteMigrationState(postgres);
    await assert.rejects(() => migrateCanonicalPlans(prisma!, 'preview' as never, now), { message: 'INVALID_CANONICAL_MIGRATION_MODE' });
    assert.deepEqual(await instituteMigrationState(postgres), beforePreflightState);
    const preflight = await migrateCanonicalPlans(prisma, 'preflight', now);
    assert.deepEqual(preflight, { mode: 'preflight', before: expectedCounts, candidates: 8 });
    assert.deepEqual(await businessCounts(postgres), expectedCounts);
    assert.deepEqual(await instituteMigrationState(postgres), beforePreflightState);

    const competingNow = new Date('2026-08-17T12:00:00.000Z');
    const [first, second] = await Promise.all([
      migrateCanonicalPlans(prisma, 'apply', now),
      migrateCanonicalPlans(prisma, 'apply', competingNow)
    ]);
    assert.deepEqual([first.migrated, second.migrated].sort(), [0, 8]);
    assert.deepEqual(first.before, expectedCounts); assert.deepEqual(first.after, expectedCounts);
    assert.deepEqual(second.before, expectedCounts); assert.deepEqual(second.after, expectedCounts);

    const after = await businessCounts(postgres);
    const institutes = await instituteMigrationState(postgres);
    const rowsById = new Map(institutes.map(row => [row.id, row]));
    const expectedIncludedCredits = new Map([['free-no-expiry', 5], ['basic-active', 5], ['pro-expired', 0], ['enterprise-active', 5], ['no-plan-expired', 0], ['quiz-only', 5], ['page-only', 5], ['post-cutover-legacy', 5]]);
    assert.deepEqual(after, expectedCounts);
    const migratedInstitutes = institutes.filter(row => row.id !== 'post-cutover');
    assert.ok(migratedInstitutes.every(row => row.plan === 'ENTERPRISE'));
    assert.ok(migratedInstitutes.every(row => row.marketplaceAccessGrantedAt !== null));
    assert.equal(rowsById.get('post-cutover')?.plan, 'QUIZ');
    assert.equal(rowsById.get('post-cutover')?.canonicalPlanMigratedAt, null);
    const migratedAt = migratedInstitutes[0]?.canonicalPlanMigratedAt?.toISOString();
    assert.ok(migratedAt);
    assert.ok(migratedInstitutes.every(row => row.canonicalPlanMigratedAt?.toISOString() === migratedAt));
    const appliedNow = first.migrated === 8 ? now : competingNow;
    const beforeById = new Map(beforePreflightState.map(row => [row.id, row]));
    for (const row of migratedInstitutes) {
      const beforeRow = beforeById.get(row.id)!;
      const active = !beforeRow.planExpiryDate || beforeRow.planExpiryDate.getTime() >= appliedNow.getTime();
      const expected = active ? includedCreditPeriod({ planStartDate: beforeRow.planStartDate, createdAt: beforeRow.createdAt }, appliedNow).includedQuizCreditsExpireAt.toISOString() : undefined;
      assert.equal(row.includedQuizCreditsExpireAt?.toISOString(), expected, `${row.id} receives the correct UTC-anniversary expiry`);
    }
    assert.deepEqual(institutes.map(row => row.includedQuizCreditsExpireAt?.toISOString()), institutes.map(row => row.quizCreditsRenewAt?.toISOString()));
    assert.deepEqual(migratedInstitutes.map(row => row.lifetimeQuizCredits), migratedInstitutes.map(row => beforeById.get(row.id)?.quizCredits));
    assert.deepEqual(migratedInstitutes.map(row => row.includedQuizCredits), migratedInstitutes.map(row => expectedIncludedCredits.get(row.id)));
    assert.deepEqual(institutes.map(row => row.quizCredits), institutes.map(row => row.lifetimeQuizCredits + row.includedQuizCredits));
    assert.deepEqual(institutes.map(row => ({ id: row.id, planStartDate: row.planStartDate?.toISOString(), planExpiryDate: row.planExpiryDate?.toISOString(), config: row.config, isPubliclyListed: row.isPubliclyListed })), beforePreflightState.map(row => ({ id: row.id, planStartDate: row.planStartDate?.toISOString(), planExpiryDate: row.planExpiryDate?.toISOString(), config: row.config, isPubliclyListed: row.isPubliclyListed })));
    assert.deepEqual(rowsById.get('page-only')?.config, { kind: 'PAGE_ONLY', listing: 'public' });
    assert.equal(rowsById.get('page-only')?.isPubliclyListed, true);
    const retry = await migrateCanonicalPlans(prisma, 'apply', new Date('2026-08-18T12:00:00.000Z'));
    assert.equal(retry.migrated, 0); assert.deepEqual(retry.before, expectedCounts); assert.deepEqual(retry.after, expectedCounts);
  } finally {
    await prisma?.$disconnect();
    await postgres.query('ROLLBACK');
    await postgres.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
    await postgres.end();
  }
});
