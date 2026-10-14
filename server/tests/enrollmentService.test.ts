import test from 'node:test';
import assert from 'node:assert/strict';
import { createEnrollmentService, type EnrollmentServiceTx } from '../src/services/enrollmentService';

function harness() {
  const enrollments: any[] = [
    { id: 'old-e1', instituteId: 'i1', studentId: 's1', batchId: 'b1', status: 'ENDED' },
    { id: 'e2', instituteId: 'i1', studentId: 's1', batchId: 'b2', status: 'ACTIVE' },
  ];
  const actions = new Map<string, any>();
  const tx: EnrollmentServiceTx = {
    findAction: async (_instituteId, key) => actions.get(key) || null,
    saveAction: async (_instituteId, key, _action, result) => { actions.set(key, result); },
    findStudent: async () => ({ id: 's1', instituteId: 'i1' }),
    findBatch: async (_id, instituteId) => ({ id: 'b1', instituteId }),
    findActiveEnrollment: async (studentId, batchId) => enrollments.find(e => e.studentId === studentId && e.batchId === batchId && e.status === 'ACTIVE') || null,
    hasEndedEnrollment: async (studentId, batchId) => enrollments.some(e => e.studentId === studentId && e.batchId === batchId && e.status === 'ENDED'),
    createEnrollment: async input => {
      const row = { id: `e${enrollments.length + 1}`, status: 'ACTIVE', ...input };
      enrollments.push(row);
      return row;
    },
    applyFees: async () => undefined,
    findEnrollment: async id => enrollments.find(e => e.id === id) || null,
    endEnrollment: async (id, input) => {
      const row = enrollments.find(e => e.id === id);
      Object.assign(row, input, { status: 'ENDED' });
      return row;
    },
    closeMonthCoverageProfile: async () => undefined,
    historyCounts: async () => ({ enrollments: 1, marks: 0, quizzes: 0, fees: 0, operational: 0 }),
    auditAndDeleteStudent: async () => undefined,
  };
  return { enrollments, service: createEnrollmentService({ runTransaction: operation => operation(tx) }) };
}

test('re-enrollment preserves identity and creates a new period', async () => {
  const { enrollments, service } = harness();
  const result = await service.enrollExistingStudent({
    instituteId: 'i1', actorId: 'a1', studentId: 's1', batchId: 'b1',
    startedAt: new Date('2026-08-27'), fee: { mode: 'CURRENT_DUE_BASED', installmentIds: [] },
    idempotencyKey: 'reenroll-1',
  });

  assert.equal(result.outcome, 'REENROLLED');
  assert.equal(enrollments.filter(e => e.studentId === 's1' && e.batchId === 'b1').length, 2);
});

test('ending one enrollment leaves another active', async () => {
  const { enrollments, service } = harness();
  const result = await service.endEnrollment({
    instituteId: 'i1', actorId: 'a1', enrollmentId: 'e2',
    endedAt: new Date('2026-08-27'), reason: 'Moved schedule', idempotencyKey: 'end-1',
  });

  assert.equal(result.outcome, 'ENDED');
  assert.equal(enrollments.find(e => e.id === 'e2').status, 'ENDED');
  assert.equal(enrollments.find(e => e.id === 'old-e1').status, 'ENDED');
});

test('permanent deletion rejects any enrollment history', async () => {
  const { service } = harness();
  assert.deepEqual(
    await service.getPermanentDeletionEligibility({ instituteId: 'i1', studentId: 's1' }),
    { eligible: false, blockers: ['ENROLLMENT_HISTORY'] },
  );
});
