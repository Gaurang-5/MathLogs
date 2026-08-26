import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { Client } from 'pg';
import 'dotenv/config';

async function hasIndex(client: Client, name: string): Promise<boolean> {
  const res = await client.query(
    'SELECT 1 FROM pg_indexes WHERE schemaname = current_schema() AND indexname = $1',
    [name]
  );
  return (res.rowCount ?? 0) === 1;
}

test('recurring migration preserves institutes and creates guarded subscription tables', async () => {
  const schema = `plan_sub_migration_${Date.now()}_${Math.random().toString(16).slice(2)}`;
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();

  try {
    await client.query(`CREATE SCHEMA "${schema}"`);
    await client.query(`SET search_path TO "${schema}"`);

    // Baseline tables mimicking existing schema before migration
    await client.query(`
      CREATE TYPE "Tier" AS ENUM ('FREE', 'PRO', 'ENTERPRISE', 'NO_PLAN', 'BASIC', 'MARKETPLACE', 'QUIZ');
      CREATE TYPE "BillingCycle" AS ENUM ('MONTHLY', 'YEARLY', 'ONE_TIME');

      CREATE TABLE "Institute" (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        plan "Tier" NOT NULL DEFAULT 'MARKETPLACE',
        "billingCycle" "BillingCycle",
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE "BillingWebhookEvent" (
        id TEXT PRIMARY KEY,
        "providerEventId" TEXT UNIQUE NOT NULL,
        "eventType" TEXT NOT NULL,
        payload JSONB NOT NULL,
        status TEXT NOT NULL DEFAULT 'RECEIVED',
        "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
      );

      INSERT INTO "Institute" (id, name, plan) VALUES ('inst-1', 'Test Institute', 'QUIZ');
    `);

    const before = await client.query('SELECT id FROM "Institute" ORDER BY id');

    const migrationSql = await readFile(
      path.join(process.cwd(), 'prisma/migrations/20260817150000_razorpay_recurring_autopay/migration.sql'),
      'utf8'
    );

    // Apply twice to prove rerunnability
    await client.query(migrationSql);
    await client.query(migrationSql);

    const after = await client.query('SELECT id FROM "Institute" ORDER BY id');
    assert.deepEqual(after.rows, before.rows);

    assert.equal(await hasIndex(client, 'PlanSubscription_providerSubscriptionId_key'), true);
    assert.equal(await hasIndex(client, 'PlanSubscription_one_open_institute'), true);
    assert.equal(await hasIndex(client, 'PlanSubscription_one_open_owner'), true);
    assert.equal(await hasIndex(client, 'PlanSubscriptionCharge_one_period'), true);
  } finally {
    await client.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
    await client.end();
  }
});
