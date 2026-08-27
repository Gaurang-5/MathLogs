import test from 'node:test';
import assert from 'node:assert/strict';
import { applyEnrollmentFees, previewEnrollmentFees } from '../src/services/enrollmentFeeService';

function createDeps(mode: 'MONTH_COVERAGE' | 'CURRENT_DUE_BASED') {
  const profiles: any[] = [];
  const assignments: string[] = [];
  return {
    profiles,
    assignments,
    deps: {
      loadContext: async () => ({
        feeMode: mode,
        batchStartMonth: '2026-01',
        batchEndMonth: '2026-12',
        installments: [
          { id: 'old', amount: 1000 },
          { id: 'current', amount: 1200 },
        ],
      }),
      createMonthProfile: async (input: any) => { profiles.push(input); },
      assignInstallments: async (_studentId: string, ids: string[]) => { assignments.push(...ids); return ids; },
    },
  };
}

test('month coverage allows the same month in two enrollment scopes', async () => {
  const harness = createDeps('MONTH_COVERAGE');
  await applyEnrollmentFees(
    { id: 'e1', instituteId: 'i1', studentId: 's1', batchId: 'b1' },
    { mode: 'MONTH_COVERAGE', feeStartMonth: '2026-08' },
    harness.deps,
  );
  await applyEnrollmentFees(
    { id: 'e2', instituteId: 'i1', studentId: 's1', batchId: 'b2' },
    { mode: 'MONTH_COVERAGE', feeStartMonth: '2026-08' },
    harness.deps,
  );
  assert.deepEqual(harness.profiles.map(profile => profile.enrollmentId), ['e1', 'e2']);
});

test('current due applies only selected destination-batch installments', async () => {
  const harness = createDeps('CURRENT_DUE_BASED');
  const applied = await applyEnrollmentFees(
    { id: 'e1', instituteId: 'i1', studentId: 's1', batchId: 'b1' },
    { mode: 'CURRENT_DUE_BASED', installmentIds: ['old', 'current'] },
    harness.deps,
  );
  assert.deepEqual(applied.assignmentIds, ['old', 'current']);
});

test('preview rejects installments outside the destination batch', async () => {
  const harness = createDeps('CURRENT_DUE_BASED');
  await assert.rejects(
    previewEnrollmentFees(
      { instituteId: 'i1', studentId: 's1', batchId: 'b1' },
      { mode: 'CURRENT_DUE_BASED', installmentIds: ['foreign'] },
      harness.deps,
    ),
    /INVALID_INSTALLMENT_SELECTION/,
  );
});
