/// <reference types="node" />
import assert from 'node:assert/strict';
import test from 'node:test';
import { coverageFeeStatus, immediateBatchFeeStatus, installmentFeeStatus, summarizeBatchFees, unavailableFeeStatus, type CoverageSource, type FeeRosterStudent } from './batchFees';

const term = { id: 'f1', amount: 1000, createdAt: '2026-04-01' };
const student: FeeRosterStudent = { id: 's1', enrollmentId: 'e1', feeDecision: 'SELECTED', feeAssignments: [{ installmentId: 'f1' }] };
const now = new Date('2026-10-22T10:00:00Z');
const profile = (): CoverageSource => ({ id: 's1', enrollments: [{ id: 'e1', status: 'ACTIVE', batch: { id: 'b1' },
  monthCoverageProfile: { status: 'ACTIVE', feeStartMonth: '2026-09', feeEndMonth: '2026-12' } }], monthCoverageAllocations: [] });
const allocation = (coverageMonth: string, enrollmentId = 'e1', status = 'ACTIVE') => ({ enrollmentId, coverageMonth, payment: { status } });
const coverage = (source: CoverageSource, at = now) => coverageFeeStatus(student, 'b1', source, 'Asia/Kolkata', at);

test('known installment balances and no-fee choices display without waiting for remote students', () => {
  assert.equal(immediateBatchFeeStatus(student, 'CURRENT_DUE_BASED', [term], 0)?.title, '₹1,000 pending');
  const legacy = { ...student, fees: [{ status: 'PAID', amount: 100 }] };
  assert.equal(immediateBatchFeeStatus(legacy, 'CURRENT_DUE_BASED', [term], 0), undefined);
  assert.equal(immediateBatchFeeStatus({ ...legacy, feeDecision: 'NO_FEE', feeAssignments: [] }, 'CURRENT_DUE_BASED', [term], 0)?.status, 'no-fee');
});

test('monthly setup statuses display immediately; dated active profiles require actual allocations', () => {
  assert.equal(immediateBatchFeeStatus({ ...student, monthCoverageProfile: null }, 'MONTH_COVERAGE', [], 0)?.status, 'setup');
  assert.equal(immediateBatchFeeStatus({ ...student, monthCoverageProfile: { status: 'CLOSED' } }, 'MONTH_COVERAGE', [], 0)?.status, 'closed');
  assert.equal(immediateBatchFeeStatus({ ...student, monthCoverageProfile: profile().enrollments[0].monthCoverageProfile }, 'MONTH_COVERAGE', [], 0), undefined);
  assert.equal(immediateBatchFeeStatus(student, 'MONTH_COVERAGE', [], 0), undefined);
});

test('installment status distinguishes partial, paid, and unpaid with exact paise', () => {
  const partial = installmentFeeStatus({ ...student, feePayments: [{ installmentId: 'f1', amountPaid: 400.25 }] }, [term], 0);
  assert.equal(partial.title, '₹599.75 pending');
  assert.equal(partial.detail, '₹400.25 paid of ₹1,000');
  assert.equal(partial.status, 'pending');
  assert.deepEqual(partial.items, [{ id: 'f1', label: 'Fee installment', status: 'partial', amount: 1000, received: 400.25, remaining: 599.75 }]);
  assert.equal(installmentFeeStatus(student, [term], 0).received, 0);
  assert.equal(installmentFeeStatus({ ...student, feePayments: [{ installmentId: 'f1', amountPaid: 1000 }] }, [term], 0).status, 'paid');
});

test('roster preserves each fee name and separate received, partial, and pending indicators', () => {
  const row = installmentFeeStatus({ ...student,
    feeAssignments: ['f1', 'f2', 'f3'].map(installmentId => ({ installmentId })),
    feePayments: [{ installmentId: 'f1', amountPaid: 1000 }, { installmentId: 'f2', amountPaid: 250 }] },
    [{ ...term, name: 'Admission' }, { ...term, id: 'f2', name: 'Term 1' }, { ...term, id: 'f3', name: 'Term 2' }], 0);
  assert.deepEqual(row.items?.map(item => [item.label, item.status, item.remaining]),
    [['Admission', 'paid', 0], ['Term 1', 'partial', 750], ['Term 2', 'pending', 1000]]);
});

test('no-fee and unconfirmed plans stay distinct and excluded amounts are not inferred from dates', () => {
  const unassigned = { ...student, feeAssignments: [], createdAt: '2020-01-01' };
  assert.equal(installmentFeeStatus({ ...unassigned, feeDecision: 'NO_FEE' }, [term], 1000).status, 'no-fee');
  for (const feeDecision of ['LATER', 'SELECTED']) {
    const row = installmentFeeStatus({ ...unassigned, feeDecision }, [term], 1000);
    assert.equal(row.status, 'setup'); assert.equal(row.expected, 0);
  }
  assert.equal(installmentFeeStatus({ ...unassigned, feeDecision: 'LEGACY', enrollmentStartedAt: '2026-05-01' }, [term], 1000).status, 'unavailable');
});

test('overpayment on one installment cannot cover a different plan, and duplicate plans count once', () => {
  const row = installmentFeeStatus({ ...student, feeAssignments: [{ installmentId: 'f1' }, { installmentId: 'f2' }],
    feePayments: [{ installmentId: 'f1', amountPaid: 2000 }, { installmentId: 'unrelated', amountPaid: 5000 }] },
  [term, term, { ...term, id: 'f2', amount: 500 }], 0);
  assert.equal(row.expected, 1500); assert.equal(row.received, 1000); assert.equal(row.outstanding, 500);
});

test('legacy receipts need authoritative allocation across all enrollments, matched by installment id', () => {
  const legacy = { ...student, fees: [{ status: 'PAID', amount: 5000 }] };
  assert.equal(installmentFeeStatus(legacy, [term], 0).status, 'unavailable');
  const options = [{ id: 'other-batch', amount: 5000, paid: 4700, remaining: 300 }, { id: 'f1', amount: 1000, paid: 300, remaining: 700 }];
  const row = installmentFeeStatus(legacy, [term], 0, options);
  assert.equal(row.received, 300); assert.equal(row.outstanding, 700);
  assert.equal(installmentFeeStatus(legacy, [term], 0, []).status, 'unavailable');
  assert.equal(installmentFeeStatus(legacy, [term], 0, [{ ...options[1], amount: 1100 }]).status, 'unavailable');
  assert.equal(installmentFeeStatus(legacy, [term], 0, [{ ...options[1], remaining: -1 }]).status, 'unavailable');
});

test('invalid payment values are unavailable instead of appearing paid', () => {
  for (const amountPaid of [NaN, -10, Infinity]) {
    assert.equal(installmentFeeStatus({ ...student, feePayments: [{ installmentId: 'f1', amountPaid }] }, [term], 0).status, 'unavailable');
  }
});

test('collection is amount-weighted, setup is explicit, and incomplete data suppresses a misleading percentage', () => {
  const paid = installmentFeeStatus({ ...student, feePayments: [{ installmentId: 'f1', amountPaid: 1000 }] }, [term], 0);
  const pending = installmentFeeStatus(student, [{ ...term, amount: 3000 }], 0);
  const setup = installmentFeeStatus({ ...student, feeAssignments: [] }, [term], 0);
  assert.deepEqual(summarizeBatchFees([paid, pending, setup]), { expected: 4000, received: 1000, setup: 1, unavailable: 0, percent: 25 });
  assert.equal(summarizeBatchFees([paid, unavailableFeeStatus()]).percent, null);
  assert.equal(summarizeBatchFees([]).percent, null);
});

test('monthly status matches exact active enrollment, deduplicates months and excludes voided or foreign allocations', () => {
  const source = profile();
  source.enrollments.unshift({ ...source.enrollments[0], id: 'other', batch: { id: 'other-batch' } });
  source.monthCoverageAllocations = [allocation('2026-10'), allocation('2026-10'), allocation('2026-09', 'other'), allocation('2026-09', 'e1', 'VOID'), allocation('2026-08'), allocation('2027-01')];
  const row = coverage(source);
  assert.equal(row.title, 'October paid');
  assert.equal(row.detail, '1 of 4 months paid · 1 overdue');
  assert.equal(row.status, 'pending');
  assert.equal(row.expected, 4); assert.equal(row.received, 1); assert.equal(row.outstanding, 3);
});

test('monthly future dues do not become overdue and a future payment does not settle the current month', () => {
  const source = profile();
  source.monthCoverageAllocations = [allocation('2026-09'), allocation('2026-10')];
  assert.equal(coverage(source).status, 'paid');
  assert.equal(coverage(source).outstanding, 2);
  assert.equal(coverage(source).detail, '2 of 4 months paid');
  source.monthCoverageAllocations = [allocation('2026-09'), allocation('2026-11')];
  assert.equal(coverage(source).title, 'October pending');
  assert.equal(coverage(source).detail, '2 of 4 months paid · 1 overdue');
});

test('coverage honors institute timezone at month boundaries and before and after the configured period', () => {
  const source = profile();
  source.monthCoverageAllocations = [allocation('2026-09')];
  assert.equal(coverage(source, new Date('2026-09-30T20:00:00Z')).title, 'October pending');
  assert.equal(coverage(source, new Date('2026-08-01')).status, 'not-started');
  assert.equal(coverage(source, new Date('2027-01-01')).title, '3 months pending');
  source.monthCoverageAllocations = ['09', '10', '11', '12'].map(month => allocation(`2026-${month}`));
  assert.equal(coverage(source, new Date('2027-01-01')).title, 'Coverage paid');
  assert.equal(summarizeBatchFees([coverage(source)]).percent, 100);
});

test('missing, closed, mismatched, or invalid monthly profiles do not become paid', () => {
  const source = profile();
  source.enrollments[0].monthCoverageProfile = null;
  assert.equal(coverage(source).status, 'setup');
  source.enrollments[0].monthCoverageProfile = { status: 'CLOSED' };
  assert.equal(coverage(source).status, 'closed');
  assert.equal(coverage({ ...profile(), id: 'wrong-student' }).status, 'unavailable');
  assert.equal(coverage({ ...profile(), enrollments: [{ ...profile().enrollments[0], id: 'old-enrollment' }] }).status, 'unavailable');
  const invalid = profile();
  invalid.enrollments[0].monthCoverageProfile!.feeEndMonth = '2026-13';
  assert.equal(coverage(invalid).status, 'unavailable');
});
