/// <reference types="node" />
import assert from 'node:assert/strict';
import test from 'node:test';
import { buildBatchInvitePayload, getBatchAssessmentInsights, getBatchMonthBounds, initialBatchFeeMonth, isBatchInstallmentApplicable, type BatchInviteData } from './batchInsights';

const paper = { id: 't1', name: 'Algebra', maxMarks: 40, date: '2026-10-18' };
const batch: BatchInviteData = { id: 'b1', name: 'Evening', coachingFeeMode: 'CURRENT_DUE_BASED', feeInstallments: [
  { id: 'f1', name: 'Term', amount: 1000 }, { id: 'private', amount: 500, studentId: 's2' },
] };
const input = { phone: '+91 98765 43210', decision: 'SELECTED' as const, installmentIds: ['f1'], applyFutureInstallments: false, feeStartMonth: '' };

test('averages recorded marks only, retaining zero scores and excluding invalid records', () => {
  const students = [
    { id: 'a', marks: [{ score: 0, test: paper }] },
    { id: 'b', marks: [{ score: 40, test: paper }] },
    { id: 'c', marks: [] },
    { id: 'd', marks: [{ score: NaN, test: paper }] },
    { id: 'e', marks: [{ score: 41, test: paper }] },
  ];
  const [result] = getBatchAssessmentInsights(students, [paper]);
  assert.equal(result.average, 50); assert.equal(result.recorded, 2); assert.equal(result.enrolled, 5);
});
test('deduplicates shared tests and enrollments and excludes unrelated tests', () => {
  const student = { id: 'a', marks: [{ score: 30, test: paper }, { score: 40, test: { ...paper, id: 'other' } }] };
  const result = getBatchAssessmentInsights([student, student], [paper, paper]);
  assert.equal(result.length, 1); assert.equal(result[0].average, 75); assert.equal(result[0].recorded, 1); assert.equal(result[0].enrolled, 1);
});
test('empty and zero-maximum papers do not invent a zero-percent average', () => {
  assert.equal(getBatchAssessmentInsights([], [paper])[0].average, null);
  assert.equal(getBatchAssessmentInsights([{ id: 'a', marks: [{ score: 0, test: paper }] }], [{ ...paper, maxMarks: 0 }])[0].average, null);
});
test('fee applicability respects explicit decisions and assignments before legacy dates', () => {
  const installment = { id: 'f1', amount: 100, createdAt: '2026-10-01' };
  assert.equal(isBatchInstallmentApplicable({ id: 'a', feeDecision: 'NO_FEE', createdAt: '2026-01-01' }, installment), false);
  assert.equal(isBatchInstallmentApplicable({ id: 'a', feeDecision: 'LATER', feeAssignments: [{ installmentId: 'f1' }] }, installment), true);
  assert.equal(isBatchInstallmentApplicable({ id: 'a', feeDecision: 'LEGACY', enrollmentStartedAt: '2026-10-10' }, installment), false);
  assert.equal(isBatchInstallmentApplicable({ id: 'a', feeDecision: 'LEGACY', enrollmentStartedAt: '2026-09-10' }, installment), true);
  assert.equal(isBatchInstallmentApplicable({ id: 'a', feeAssignments: [{ installmentId: 'f1' }] }, { ...installment, studentId: 'b' }), false);
});
test('invite includes an immutable fee amount snapshot and normalizes the Indian number', () => {
  const payload = buildBatchInvitePayload(batch, input);
  assert.equal(payload.whatsappNumber, '9876543210');
  assert.deepEqual(payload.fee, { mode: 'CURRENT_DUE_BASED', decision: 'SELECTED', installmentIds: ['f1'], amounts: { f1: 1000 }, applyFutureInstallments: false });
});
test('invite requires explicit fee selection and rejects private or unknown installments', () => {
  assert.throws(() => buildBatchInvitePayload(batch, { ...input, decision: '' }));
  assert.throws(() => buildBatchInvitePayload(batch, { ...input, installmentIds: [] }));
  assert.throws(() => buildBatchInvitePayload(batch, { ...input, installmentIds: ['private'] }));
  assert.throws(() => buildBatchInvitePayload(batch, { ...input, phone: '1234' }));
});
test('no-fee/later decisions cannot leak a previously selected amount or future assignment', () => {
  for (const decision of ['NO_FEE', 'LATER'] as const) {
    assert.deepEqual(buildBatchInvitePayload(batch, { ...input, decision, applyFutureInstallments: true }).fee,
      { mode: 'CURRENT_DUE_BASED', decision, installmentIds: [], applyFutureInstallments: false });
  }
});
test('month boundaries use institute timezone and enforce inclusive date range', () => {
  const monthBatch: BatchInviteData = { ...batch, coachingFeeMode: 'MONTH_COVERAGE', timezone: 'Asia/Kolkata', startDate: '2026-09-30T18:30:00Z', endDate: '2027-03-31T18:29:59Z' };
  assert.deepEqual(getBatchMonthBounds(monthBatch), { first: '2026-10', last: '2027-03' });
  assert.equal(initialBatchFeeMonth(monthBatch, new Date('2026-09-01')), '2026-10');
  assert.equal(initialBatchFeeMonth(monthBatch, new Date('2027-05-01')), '2027-03');
  assert.throws(() => buildBatchInvitePayload(monthBatch, { ...input, feeStartMonth: '2026-09' }));
  assert.throws(() => buildBatchInvitePayload(monthBatch, { ...input, feeStartMonth: '2026-13' }));
  assert.deepEqual(buildBatchInvitePayload(monthBatch, { ...input, feeStartMonth: '2026-10' }).fee, { mode: 'MONTH_COVERAGE', feeStartMonth: '2026-10' });
});
