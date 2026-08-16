import test from 'node:test';
import assert from 'node:assert/strict';
import { Client } from 'pg';
import { PrismaClient } from '@prisma/client';
import 'dotenv/config';
import { createSubscriptionLifecycleService } from '../src/services/subscriptionLifecycleService';

function schemaUrl(schema: string): string {
  const url = new URL(process.env.DATABASE_URL!);
  url.searchParams.set('schema', schema);
  return url.toString();
}

test('trials are single-use, grant five credits, and expire to Marketplace access', async () => {
  const schema = `subscription_lifecycle_${Date.now()}_${Math.random().toString(16).slice(2)}`;
  const postgres = new Client({ connectionString: process.env.DATABASE_URL });
  await postgres.connect();
  let prisma: PrismaClient | undefined;

  try {
    await postgres.query(`CREATE SCHEMA "${schema}"`);
    await postgres.query(`SET search_path TO "${schema}"`);
    await postgres.query(`
      CREATE TYPE "Tier" AS ENUM ('FREE', 'PRO', 'ENTERPRISE', 'NO_PLAN', 'BASIC', 'MARKETPLACE', 'QUIZ');
      CREATE TYPE "BillingCycle" AS ENUM ('MONTHLY', 'YEARLY', 'ONE_TIME');
      CREATE TABLE "Institute" (
        id TEXT PRIMARY KEY, name TEXT NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, plan "Tier" NOT NULL DEFAULT 'FREE',
        "planStartDate" TIMESTAMP(3), "planExpiryDate" TIMESTAMP(3), "billingCycle" "BillingCycle",
        "trialStartedAt" TIMESTAMP(3), "trialEndsAt" TIMESTAMP(3), "trialUsedAt" TIMESTAMP(3),
        "marketplaceAccessGrantedAt" TIMESTAMP(3), "includedQuizCredits" INTEGER NOT NULL DEFAULT 0,
        "includedQuizCreditsExpireAt" TIMESTAMP(3), "lifetimeQuizCredits" INTEGER NOT NULL DEFAULT 0,
        "quizCreditsRenewAt" TIMESTAMP(3), "quizCredits" INTEGER NOT NULL DEFAULT 0
      );
      CREATE TABLE "PlanTrialClaim" (
        id TEXT PRIMARY KEY DEFAULT gen_random_uuid(), "instituteId" TEXT NOT NULL UNIQUE,
        "ownerIdentityHash" VARCHAR(128) NOT NULL UNIQUE, plan "Tier" NOT NULL, "claimedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "endsAt" TIMESTAMP(3), "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
    `);
    await postgres.query(`INSERT INTO "Institute" (id, name) VALUES ('trial-institute', 'Trial institute'), ('paid-institute', 'Paid institute')`);
    prisma = new PrismaClient({ datasources: { db: { url: schemaUrl(schema) } } });
    const lifecycle = createSubscriptionLifecycleService(prisma, 'test-lifecycle-secret');
    const now = new Date('2026-08-15T00:00:00.000Z');

    const trial = await lifecycle.startPlanTrial({ instituteId: 'trial-institute', plan: 'QUIZ', ownerIdentity: ' 9999999999 ', now });
    assert.equal(trial.trialEndsAt?.toISOString(), '2026-08-29T00:00:00.000Z');
    assert.equal(trial.includedQuizCredits, 5);
    assert.equal(trial.quiz, true);
    await assert.rejects(() => lifecycle.startPlanTrial({ instituteId: 'trial-institute', plan: 'ENTERPRISE', ownerIdentity: '9999999999', now }), /TRIAL_ALREADY_USED/);

    const expired = await lifecycle.reconcileInstituteLifecycle('trial-institute', new Date('2026-08-30T00:00:00.000Z'));
    assert.equal(expired.effectivePlan, 'MARKETPLACE');
    assert.equal(expired.marketplace, true);
    assert.equal(expired.quiz, false);

    const paid = await lifecycle.activatePaidPlan({ instituteId: 'paid-institute', plan: 'ENTERPRISE', billingCycle: 'YEARLY', now });
    assert.equal(paid.enterprise, true);
    assert.equal(paid.includedQuizCredits, 5);
    assert.equal(paid.planExpiryDate?.toISOString(), '2027-08-15T00:00:00.000Z');
  } finally {
    await prisma?.$disconnect();
    await postgres.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
    await postgres.end();
  }
});
