import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeIdentityText } from '../src/domain/enrollments/identity';
import { searchEnrollmentCandidates } from '../src/services/enrollmentQueryService';

test('identity normalization is deterministic across spacing and case', () => {
  assert.equal(normalizeIdentityText('  Riya   SHARMA '), 'riya sharma');
  assert.equal(normalizeIdentityText('98765-43210'), '98765-43210');
});

test('candidate search includes ended profiles and explains phone matches', async () => {
  const db = {
    student: {
      findMany: async () => [{
        id: 's1', humanId: 'MB-MTH26-049', name: 'Riya Sharma', parentName: 'Asha Sharma',
        parentWhatsapp: '9876543210', schoolName: 'Central School', balance: { balance: 1200 },
        enrollments: [
          { status: 'ENDED', batch: { id: 'b1', name: 'Class 10 Boys' } },
          { status: 'ACTIVE', batch: { id: 'b2', name: 'Class 10 Girls' } },
        ],
      }],
    },
  };

  const rows = await searchEnrollmentCandidates(
    { instituteId: 'i1', batchId: 'b3', query: '98765 43210' },
    db as any,
  );

  assert.deepEqual(rows[0].matchReasons, ['PARENT_PHONE']);
  assert.deepEqual(rows[0].previousBatches, [{ id: 'b1', name: 'Class 10 Boys' }]);
  assert.deepEqual(rows[0].currentBatches, [{ id: 'b2', name: 'Class 10 Girls' }]);
});
