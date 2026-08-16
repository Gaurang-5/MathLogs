import test from 'node:test';
import assert from 'node:assert/strict';
import { Client } from 'pg';
import { PrismaClient } from '@prisma/client';
import 'dotenv/config';
import { createQuizCreditWalletService } from '../src/services/quizCreditWalletService';

function schemaUrl(schema: string): string {
  const url = new URL(process.env.DATABASE_URL!);
  url.searchParams.set('schema', schema);
  return url.toString();
}

async function createWalletSchema(postgres: Client, schema: string): Promise<void> {
  await postgres.query(`CREATE SCHEMA "${schema}"`);
  await postgres.query(`SET search_path TO "${schema}"`);
  await postgres.query(`
    CREATE TYPE "Tier" AS ENUM ('FREE', 'PRO', 'ENTERPRISE', 'NO_PLAN', 'BASIC', 'MARKETPLACE', 'QUIZ');
    CREATE TYPE "BillingCycle" AS ENUM ('MONTHLY', 'YEARLY', 'ONE_TIME');
    CREATE TABLE "Institute" (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      plan "Tier" NOT NULL DEFAULT 'FREE',
      "planStartDate" TIMESTAMP(3),
      "planExpiryDate" TIMESTAMP(3),
      "trialEndsAt" TIMESTAMP(3),
      "marketplaceAccessGrantedAt" TIMESTAMP(3),
      "includedQuizCredits" INTEGER NOT NULL DEFAULT 0,
      "includedQuizCreditsExpireAt" TIMESTAMP(3),
      "lifetimeQuizCredits" INTEGER NOT NULL DEFAULT 0,
      "quizCreditsRenewAt" TIMESTAMP(3),
      "quizCredits" INTEGER NOT NULL DEFAULT 0
    );
    CREATE TABLE "BillingPayment" (
      id TEXT PRIMARY KEY,
      "instituteId" TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'PENDING',
      "capturedAt" TIMESTAMP(3),
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "BillingPayment_instituteId_fkey" FOREIGN KEY ("instituteId") REFERENCES "Institute"(id)
    );
  `);
}

test('quiz credit wallet consumes included credits first, protects inactive plans, and serializes refresh/consume', async () => {
  const schema = `quiz_credit_wallet_${Date.now()}_${Math.random().toString(16).slice(2)}`;
  const postgres = new Client({ connectionString: process.env.DATABASE_URL });
  await postgres.connect();
  let prisma: PrismaClient | undefined;

  try {
    await createWalletSchema(postgres, schema);
    const now = new Date('2026-08-16T12:00:00.000Z');
    await postgres.query(`
      INSERT INTO "Institute" (id, name, plan, "planStartDate", "planExpiryDate", "marketplaceAccessGrantedAt", "includedQuizCredits", "includedQuizCreditsExpireAt", "lifetimeQuizCredits", "quizCreditsRenewAt", "quizCredits") VALUES
      ('wallet-active', 'Active wallet', 'QUIZ', '2026-08-01T00:00:00.000Z', '2026-09-01T00:00:00.000Z', '2026-08-01T00:00:00.000Z', 5, '2026-09-01T00:00:00.000Z', 10, '2026-09-01T00:00:00.000Z', 15),
      ('wallet-expired', 'Expired wallet', 'QUIZ', '2026-07-01T00:00:00.000Z', '2026-08-01T00:00:00.000Z', '2026-07-01T00:00:00.000Z', 5, '2026-08-01T00:00:00.000Z', 10, '2026-08-01T00:00:00.000Z', 15),
      ('wallet-low', 'Low wallet', 'ENTERPRISE', '2026-08-01T00:00:00.000Z', '2026-09-01T00:00:00.000Z', '2026-08-01T00:00:00.000Z', 1, '2026-09-01T00:00:00.000Z', 0, '2026-09-01T00:00:00.000Z', 1),
      ('wallet-race', 'Race wallet', 'QUIZ', '2026-08-01T00:00:00.000Z', '2026-09-01T00:00:00.000Z', '2026-08-01T00:00:00.000Z', 1, '2026-09-01T00:00:00.000Z', 0, '2026-09-01T00:00:00.000Z', 1),
      ('wallet-pack', 'Pack wallet', 'QUIZ', '2026-08-01T00:00:00.000Z', '2026-09-01T00:00:00.000Z', '2026-08-01T00:00:00.000Z', 5, '2026-09-01T00:00:00.000Z', 10, '2026-09-01T00:00:00.000Z', 15),
      ('wallet-refresh', 'Refresh wallet', 'QUIZ', '2026-07-01T00:00:00.000Z', '2026-10-01T00:00:00.000Z', '2026-07-01T00:00:00.000Z', 0, '2026-08-01T00:00:00.000Z', 7, '2026-08-01T00:00:00.000Z', 7);
      INSERT INTO "BillingPayment" (id, "instituteId", status) VALUES ('pack-payment', 'wallet-pack', 'FULFILLING');
    `);

    prisma = new PrismaClient({ datasources: { db: { url: schemaUrl(schema) } } });
    const wallet = createQuizCreditWalletService(prisma);

    assert.deepEqual(await wallet.consumeQuizCredits('wallet-active', 3, now), {
      includedCredits: 2,
      lifetimeCredits: 10,
      totalUsableCredits: 12,
      includedCreditsExpireAt: new Date('2026-09-01T00:00:00.000Z'),
      quizCreditsRenewAt: new Date('2026-09-01T00:00:00.000Z')
    });
    assert.deepEqual(await wallet.consumeQuizCredits('wallet-active', 4, now), {
      includedCredits: 0,
      lifetimeCredits: 8,
      totalUsableCredits: 8,
      includedCreditsExpireAt: new Date('2026-09-01T00:00:00.000Z'),
      quizCreditsRenewAt: new Date('2026-09-01T00:00:00.000Z')
    });
    await assert.rejects(() => wallet.consumeQuizCredits('wallet-expired', 1, now), /QUIZ_PLAN_INACTIVE/);
    await assert.rejects(() => wallet.consumeQuizCredits('wallet-low', 2, now), /INSUFFICIENT_QUIZ_CREDITS/);

    const race = await Promise.allSettled([
      wallet.consumeQuizCredits('wallet-race', 1, now),
      wallet.consumeQuizCredits('wallet-race', 1, now)
    ]);
    assert.equal(race.filter(result => result.status === 'fulfilled').length, 1);
    assert.equal(race.filter(result => result.status === 'rejected').length, 1);

    const nextPeriod = {
      includedQuizCreditsExpireAt: new Date('2026-09-01T00:00:00.000Z'),
      quizCreditsRenewAt: new Date('2026-09-01T00:00:00.000Z')
    };
    await Promise.all([
      wallet.refreshIncludedQuizCredits('wallet-refresh', nextPeriod, now),
      wallet.refreshIncludedQuizCredits('wallet-refresh', nextPeriod, now)
    ]);
    const refreshed = await wallet.getQuizCreditWallet('wallet-refresh', now);
    assert.equal(refreshed.includedCredits, 5);
    assert.equal(refreshed.lifetimeCredits, 7);
    assert.equal(refreshed.totalUsableCredits, 12);

    await Promise.all([
      wallet.grantLifetimeQuizCredits({ instituteId: 'wallet-pack', amount: 5, source: 'BILLING_PAYMENT', billingPaymentId: 'pack-payment' }, now),
      wallet.grantLifetimeQuizCredits({ instituteId: 'wallet-pack', amount: 5, source: 'BILLING_PAYMENT', billingPaymentId: 'pack-payment' }, now)
    ]);
    const creditedPack = await postgres.query<{ lifetimeQuizCredits: number; status: string }>(`
      SELECT i."lifetimeQuizCredits", p.status::text
      FROM "Institute" i JOIN "BillingPayment" p ON p."instituteId" = i.id
      WHERE p.id = 'pack-payment'
    `);
    assert.deepEqual(creditedPack.rows[0], { lifetimeQuizCredits: 15, status: 'CREDITED' });

    const legacyProjection = await postgres.query<{ quizCredits: number }>(`SELECT "quizCredits" FROM "Institute" WHERE id = 'wallet-active'`);
    assert.equal(legacyProjection.rows[0].quizCredits, 8);
  } finally {
    await prisma?.$disconnect();
    await postgres.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
    await postgres.end();
  }
});
