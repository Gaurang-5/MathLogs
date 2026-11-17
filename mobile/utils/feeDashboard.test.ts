/// <reference types="node" />
import assert from 'node:assert/strict';
import test from 'node:test';
import { feeCollectionStats, feeStudentState, filterFeeStudents, type FeeDashboardStudent } from './feeDashboard';

const students: FeeDashboardStudent[] = [
  { id: '1', humanId: 'M-1', name: 'Aarav', batchName: 'Math', totalFee: 1000, totalPaid: 250, balance: 750, lastPaymentDate: null, oldestDue: null },
  { id: '2', humanId: 'M-2', name: 'Diya', batchName: 'Math, Science', totalFee: 500, totalPaid: 0, balance: 500, lastPaymentDate: null, oldestDue: null },
  { id: '3', humanId: 'M-3', name: 'Kabir', batchName: 'Science', totalFee: 800, totalPaid: 800, balance: 0, lastPaymentDate: null, oldestDue: null },
  { id: '4', humanId: 'M-4', name: 'Meera', batchName: 'Math', totalFee: 0, totalPaid: 0, balance: 0, lastPaymentDate: null, oldestDue: null },
];

test('classifies pending, part-paid, paid, and unconfigured students separately', () => {
  assert.equal(feeStudentState(students[0]), 'part_paid');
  assert.equal(feeStudentState(students[1]), 'pending');
  assert.equal(feeStudentState(students[2]), 'paid');
  assert.equal(feeStudentState(students[3]), 'not_configured');
});

test('filters by student status, exact batch membership, and search', () => {
  assert.deepEqual(filterFeeStudents(students, { search: '', status: 'needs_payment', batch: 'All' }).map(student => student.id), ['1', '2']);
  assert.deepEqual(filterFeeStudents(students, { search: '', status: 'all', batch: 'Science' }).map(student => student.id), ['2', '3']);
  assert.deepEqual(filterFeeStudents(students, { search: 'm-3', status: 'all', batch: 'All' }).map(student => student.id), ['3']);
});

test('summarizes exact received and outstanding amounts without counting unconfigured students as paid', () => {
  assert.deepEqual(feeCollectionStats(students), {
    collected: 1050,
    outstanding: 1250,
    expected: 2300,
    rate: 46,
    needsPayment: 2,
    paid: 1,
  });
});
