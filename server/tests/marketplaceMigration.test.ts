import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { Client } from 'pg';
import 'dotenv/config';

test('marketplace operations migration converts legacy claim leads before delivery backfill', async () => {
  const schema = `marketplace_migration_${Date.now()}_${Math.random().toString(16).slice(2)}`;
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();

  try {
    await client.query(`CREATE SCHEMA "${schema}"`);
    await client.query(`SET search_path TO "${schema}"`);
    await client.query(`
      CREATE TABLE "Institute" (id TEXT PRIMARY KEY, "phoneNumber" TEXT);
      CREATE TABLE "Admin" (id TEXT PRIMARY KEY, "instituteId" TEXT);
      CREATE TABLE "LeadInquiry" (
        id TEXT PRIMARY KEY,
        "instituteId" TEXT NOT NULL,
        "studentName" TEXT NOT NULL,
        phone TEXT NOT NULL,
        message TEXT,
        status TEXT NOT NULL DEFAULT 'NEW',
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
      INSERT INTO "Institute" (id, "phoneNumber") VALUES ('inst-1', '9000000000');
      INSERT INTO "Admin" (id, "instituteId") VALUES ('admin-1', 'inst-1');
      INSERT INTO "LeadInquiry" (id, "instituteId", "studentName", phone, message)
      VALUES
        ('legacy-claim-1', 'inst-1', '[CLAIM REQUEST] Riya Sharma', '+91 98765-43210', 'legacy proof and email payload'),
        ('legacy-claim-2', 'inst-1', '[CLAIM REQUEST] Riya Duplicate', '9876543210', 'duplicate legacy request'),
        ('real-lead-1', 'inst-1', 'Aman Gupta', '9988776655', 'Class 10 inquiry');
    `);

    const migration = await readFile(path.join(
      process.cwd(),
      'prisma/migrations/20260815090000_marketplace_operations/migration.sql'
    ), 'utf8');
    await client.query(migration);

    const claims = await client.query(`
      SELECT id, "claimantName", phone, "normalizedPhone", notes
      FROM "MarketplaceClaim"
    `);
    assert.deepEqual(claims.rows, [{
      id: 'legacy-claim-1',
      claimantName: 'Riya Sharma',
      phone: '+91 98765-43210',
      normalizedPhone: '9876543210',
      notes: 'legacy proof and email payload'
    }]);
    const remainingMarkers = await client.query(`
      SELECT COUNT(*)::integer AS count
      FROM "LeadInquiry"
      WHERE "studentName" LIKE '[CLAIM REQUEST]%'
    `);
    assert.equal(remainingMarkers.rows[0].count, 0);
    const leads = await client.query(`SELECT id, "deliveryStatus" FROM "LeadInquiry" ORDER BY id`);
    assert.deepEqual(leads.rows, [{ id: 'real-lead-1', deliveryStatus: 'DELIVERED' }]);
  } finally {
    await client.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
    await client.end();
  }
});
