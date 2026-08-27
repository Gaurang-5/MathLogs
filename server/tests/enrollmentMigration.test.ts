import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const schema = readFileSync(path.join(root, 'prisma/schema.prisma'), 'utf8');
const migrationPath = path.join(
  root,
  'prisma/migrations/20260827100000_expand_student_enrollments/migration.sql',
);

test('enrollment expansion is additive and enforces one active student-batch membership', () => {
  const migration = readFileSync(migrationPath, 'utf8');

  assert.match(schema, /model Enrollment[\s\S]*status\s+EnrollmentStatus/);
  assert.match(schema, /model StudentIdentityReview/);
  assert.match(schema, /model EnrollmentAction/);
  assert.match(schema, /model StudentDeletionAudit/);
  assert.match(
    migration,
    /CREATE UNIQUE INDEX "Enrollment_one_active_student_batch"[\s\S]*WHERE "status" = 'ACTIVE'/,
  );
  assert.match(migration, /ADD COLUMN\s+"enrollmentId"/);
  assert.doesNotMatch(migration, /DROP COLUMN\s+"batchId"|DROP COLUMN\s+"status"/i);
});
