/// <reference types="node" />
import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildPaymentAllocations,
  paymentAmountInPaise,
  paymentInputValue,
  selectedInstallmentTotal,
  type PaymentOption,
} from './feePayment';

const options: PaymentOption[] = [
  { id: 'term-1', name: 'Term 1', batchName: 'Math', amount: 1000, paid: 250, remaining: 750 },
  { id: 'term-2', name: 'Term 2', batchName: 'Math', amount: 900, paid: 0, remaining: 900 },
];

test('parses rupees with exact paise and rejects ambiguous values', () => {
  assert.equal(paymentAmountInPaise('125.50'), 12550);
  assert.equal(paymentAmountInPaise('0.01'), 1);
  for (const value of ['', '0', '-1', '1.234', '1,000', 'abc']) assert.equal(paymentAmountInPaise(value), null);
});

test('allocates a partial payment to one selected installment', () => {
  assert.deepEqual(buildPaymentAllocations('500', ['term-1'], options), {
    ok: true,
    amount: 500,
    allocations: [{ installmentId: 'term-1', amount: 500 }],
  });
});

test('splits a payment across selected installments in visible order', () => {
  assert.deepEqual(buildPaymentAllocations('1000.25', ['term-1', 'term-2'], options), {
    ok: true,
    amount: 1000.25,
    allocations: [
      { installmentId: 'term-1', amount: 750 },
      { installmentId: 'term-2', amount: 250.25 },
    ],
  });
});

test('adds the remaining balances when multiple installments are selected', () => {
  assert.equal(selectedInstallmentTotal(['term-1'], options), 750);
  assert.equal(selectedInstallmentTotal(['term-1', 'term-2'], options), 1650);
  assert.equal(selectedInstallmentTotal(['term-1', 'term-1'], options), 750);
  assert.equal(paymentInputValue(1650), '1650');
  assert.equal(paymentInputValue(1000.25), '1000.25');
});

test('rejects missing, unknown, duplicate-only, and insufficient selections', () => {
  assert.equal(buildPaymentAllocations('100', [], options).ok, false);
  assert.equal(buildPaymentAllocations('100', ['missing'], options).ok, false);
  assert.equal(buildPaymentAllocations('800', ['term-1'], options).ok, false);
  assert.deepEqual(buildPaymentAllocations('100', ['term-1', 'term-1'], options), {
    ok: true,
    amount: 100,
    allocations: [{ installmentId: 'term-1', amount: 100 }],
  });
});
