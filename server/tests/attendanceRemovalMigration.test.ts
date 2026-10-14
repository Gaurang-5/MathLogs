import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { Client } from 'pg';

const migrationPath = path.join(
  process.cwd(),
  'prisma/migrations/20260827090000_remove_attendance_subsystem/migration.sql',
);

const databaseUrl = process.env.TEST_DATABASE_URL || process.env.DATABASE_URL;

async function readMigration(): Promise<string> {
  return readFile(migrationPath, 'utf8');
}

async function withSchema(run: (client: Client) => Promise<void>) {
  assert.ok(databaseUrl, 'TEST_DATABASE_URL or DATABASE_URL is required');
  const name = `attendance_removal_${Date.now()}_${Math.random().toString(16).slice(2)}`;
  const client = new Client({ connectionString: databaseUrl });
  await client.connect();
  try {
    await client.query(`CREATE SCHEMA "${name}"`);
    await client.query(`SET search_path TO "${name}"`);
    await client.query(`
      CREATE TYPE "AttendanceSource" AS ENUM ('KIOSK', 'MANUAL');
      CREATE TABLE "AttendanceRecord" (id TEXT PRIMARY KEY, source "AttendanceSource" NOT NULL);
      CREATE TABLE "AttendanceSweepRun" (id TEXT PRIMARY KEY);
    `);
    await run(client);
  } finally {
    await client.query(`DROP SCHEMA IF EXISTS "${name}" CASCADE`);
    await client.end();
  }
}

test('migration contains an empty-table guard before destructive statements', async () => {
  const migration = await readMigration();
  const guard = migration.indexOf('ATTENDANCE_DATA_PRESENT');
  const firstDrop = migration.indexOf('DROP TABLE');

  assert.ok(guard >= 0, 'expected ATTENDANCE_DATA_PRESENT guard');
  assert.ok(firstDrop > guard, 'guard must execute before the first DROP TABLE');
  assert.match(migration, /EXISTS\s*\(SELECT 1 FROM "AttendanceRecord" LIMIT 1\)/);
  assert.match(migration, /EXISTS\s*\(SELECT 1 FROM "AttendanceSweepRun" LIMIT 1\)/);
});

test('drops attendance schema only when both tables are empty', { skip: !databaseUrl }, async () => {
  await withSchema(async client => {
    await client.query(await readMigration());
    const objects = await client.query(`
      SELECT to_regclass('"AttendanceRecord"') AS record,
             to_regclass('"AttendanceSweepRun"') AS sweep
    `);
    assert.deepEqual(objects.rows[0], { record: null, sweep: null });
  });
});

test('aborts without dropping either table when attendance data exists', { skip: !databaseUrl }, async () => {
  await withSchema(async client => {
    await client.query(`INSERT INTO "AttendanceRecord" (id, source) VALUES ('a-1', 'KIOSK')`);
    await assert.rejects(client.query(await readMigration()), /ATTENDANCE_DATA_PRESENT/);
    const count = await client.query(`SELECT COUNT(*)::integer AS count FROM "AttendanceRecord"`);
    assert.equal(count.rows[0].count, 1);
    const sweep = await client.query(`SELECT to_regclass('"AttendanceSweepRun"') AS name`);
    assert.notEqual(sweep.rows[0].name, null);
  });
});
