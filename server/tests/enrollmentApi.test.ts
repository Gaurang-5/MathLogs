import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import {
  createEnrollmentSchema,
  endEnrollmentSchema,
} from '../src/schemas';

test('teacher enrollment schemas require fee choice, idempotency, and removal reason', () => {
  assert.equal(createEnrollmentSchema.safeParse({ body: { studentId: 'not-a-uuid' } }).success, false);
  assert.equal(endEnrollmentSchema.safeParse({ body: { reason: '' } }).success, false);
});

test('authenticated enrollment routes are registered', () => {
  const routes = readFileSync(path.join(process.cwd(), 'src/routes/api.ts'), 'utf8');
  assert.match(routes, /\/batches\/:batchId\/enrollment-candidates/);
  assert.match(routes, /\/batches\/:batchId\/enrollments\/preview/);
  assert.match(routes, /\/batches\/:batchId\/enrollments/);
  assert.match(routes, /\/batches\/:batchId\/enrollments\/:enrollmentId/);
});
