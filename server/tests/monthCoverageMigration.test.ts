import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const schema = fs.readFileSync(path.join(root, 'prisma/schema.prisma'), 'utf8');
const migration = fs.readFileSync(
  path.join(root, 'prisma/migrations/20260822120000_month_coverage_fee_system/migration.sql'),
  'utf8',
);

test('month coverage schema is additive and isolated from legacy fee models', () => {
  assert.match(schema, /enum CoachingFeeMode[\s\S]*CURRENT_DUE_BASED[\s\S]*MONTH_COVERAGE/);
  assert.match(schema, /model MonthCoveragePayment/);
  assert.match(schema, /model MonthCoverageAllocation/);
  assert.match(schema, /@@unique\(\[studentId, coverageMonth\]\)/);
  assert.doesNotMatch(migration, /DROP TABLE\s+"(?:FeeRecord|FeePayment|FeeInstallment|StudentBalance)"/i);
  assert.match(migration, /UPDATE "Institute"[\s\S]*"coachingFeeModeSelectedAt"/);
});
