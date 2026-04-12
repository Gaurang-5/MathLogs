import { describe, expect, it } from 'vitest';
import { getInstallmentPaidMap, getStudentJoinDate, type FeeAllocationStudent, type FeeInstallment } from './fees';

const installments: FeeInstallment[] = [
    { id: 'inst-1', amount: 500, createdAt: '2026-01-01T10:00:00.000Z' },
    { id: 'inst-2', amount: 500, createdAt: '2026-02-01T10:00:00.000Z' },
    { id: 'inst-3', amount: 500, createdAt: '2026-03-01T10:00:00.000Z' },
];

describe('fees helpers', () => {
    it('normalizes join date to midnight timestamp', () => {
        expect(getStudentJoinDate('2026-02-11T18:45:00.000Z')).toBe(new Date('2026-02-11T18:45:00.000Z').setHours(0, 0, 0, 0));
        expect(getStudentJoinDate()).toBe(0);
    });

    it('applies generic paid balance to the earliest applicable installments', () => {
        const student: FeeAllocationStudent = {
            createdAt: '2026-01-15T08:00:00.000Z',
            fees: [{ status: 'PAID', amount: 650 }],
            feePayments: [{ installmentId: 'inst-2', amountPaid: 100 }],
        };

        expect(getInstallmentPaidMap(student, installments)).toEqual({
            'inst-2': 500,
            'inst-3': 250,
        });
    });

    it('ignores installments created before the student joined', () => {
        const student: FeeAllocationStudent = {
            createdAt: '2026-02-15T08:00:00.000Z',
            fees: [{ status: 'PAID', amount: 500 }],
            feePayments: [],
        };

        expect(getInstallmentPaidMap(student, installments)).toEqual({
            'inst-3': 500,
        });
    });
});
