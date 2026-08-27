import test from 'node:test';
import assert from 'node:assert/strict';
import { buildEnrollmentBackfillPlan } from '../src/domain/enrollments/backfill';

test('backfill never guesses ambiguous historical membership', () => {
  const result = buildEnrollmentBackfillPlan({
    students: [{
      id: 's1', instituteId: 'i1', batchId: null, status: 'LEFT',
      createdAt: new Date('2026-01-01'), leftAt: new Date('2026-04-01'),
    }],
    evidenceByStudent: {
      s1: [
        { batchId: 'b1', instituteId: 'i1', kind: 'TEST' },
        { batchId: 'b2', instituteId: 'i1', kind: 'PAYMENT' },
      ],
    },
  });

  assert.deepEqual(result.enrollments, []);
  assert.equal(result.unresolved[0].reason, 'AMBIGUOUS_BATCH_EVIDENCE');
});

test('backfill creates an active enrollment from current Student.batchId', () => {
  const result = buildEnrollmentBackfillPlan({
    students: [{
      id: 's1', instituteId: 'i1', batchId: 'b1', status: 'APPROVED',
      createdAt: new Date('2026-01-01'),
    }],
    evidenceByStudent: {},
  });

  assert.deepEqual(
    result.enrollments.map(row => [row.studentId, row.batchId, row.status]),
    [['s1', 'b1', 'ACTIVE']],
  );
});

test('backfill rejects cross-tenant evidence', () => {
  const result = buildEnrollmentBackfillPlan({
    students: [{ id: 's1', instituteId: 'i1', batchId: null, status: 'LEFT', createdAt: new Date() }],
    evidenceByStudent: { s1: [{ batchId: 'b2', instituteId: 'i2', kind: 'TEST' }] },
  });

  assert.deepEqual(result.crossTenantRows, ['s1']);
  assert.equal(result.unresolved[0].reason, 'CROSS_TENANT_EVIDENCE');
});
