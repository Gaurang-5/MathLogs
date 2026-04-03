import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateStudentFeeSnapshot } from '../src/utils/feeCalculations';

test('calculateStudentFeeSnapshot applies generic fees to the oldest applicable installments', () => {
    const result = calculateStudentFeeSnapshot({
        createdAt: '2026-01-15T00:00:00.000Z',
        fees: [{ status: 'PAID', amount: 650 }],
        feePayments: [{ installmentId: 'inst-2', amountPaid: 100 }],
        batch: {
            feeAmount: 1500,
            feeInstallments: [
                { id: 'inst-1', amount: 500, createdAt: '2026-01-01T00:00:00.000Z' },
                { id: 'inst-2', amount: 500, createdAt: '2026-02-01T00:00:00.000Z' },
                { id: 'inst-3', amount: 500, createdAt: '2026-03-01T00:00:00.000Z' },
            ],
        },
    });

    assert.equal(result.balance, 250);
    assert.equal(result.oldestDue.toISOString(), '2026-03-01T00:00:00.000Z');
});

test('calculateStudentFeeSnapshot falls back to flat fee timing when no installments exist', () => {
    const result = calculateStudentFeeSnapshot({
        createdAt: '2026-02-10T09:30:00.000Z',
        fees: [{ status: 'PAID', amount: 200 }],
        feePayments: [],
        batch: {
            feeAmount: 1000,
            feeInstallments: [],
        },
    });

    assert.equal(result.balance, 800);
    assert.equal(result.oldestDue.toISOString(), '2026-02-10T09:30:00.000Z');
});

test('calculateStudentFeeSnapshot ignores installments from before the student joined', () => {
    const result = calculateStudentFeeSnapshot({
        createdAt: '2026-02-15T00:00:00.000Z',
        fees: [{ status: 'PAID', amount: 300 }],
        feePayments: [],
        batch: {
            feeInstallments: [
                { id: 'inst-1', amount: 500, createdAt: '2026-01-01T00:00:00.000Z' },
                { id: 'inst-2', amount: 500, createdAt: '2026-03-01T00:00:00.000Z' },
            ],
        },
    });

    assert.equal(result.balance, 200);
    assert.equal(result.oldestDue.toISOString(), '2026-03-01T00:00:00.000Z');
});
