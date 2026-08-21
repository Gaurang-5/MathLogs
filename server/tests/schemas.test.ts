import test from 'node:test';
import assert from 'node:assert/strict';
import {
    createMonthCoveragePaymentSchema,
    loginSchema,
    registerStudentSchema,
    paymentSchema,
    payInstallmentSchema,
    setupAccountSchema,
} from '../src/schemas';

const validUuid = '123e4567-e89b-12d3-a456-426614174000';

test('loginSchema rejects blank usernames', () => {
    const result = loginSchema.safeParse({
        body: {
            username: '',
            password: 'secret123',
        },
    });

    assert.equal(result.success, false);
});

test('registerStudentSchema accepts normal registration payloads', () => {
    const result = registerStudentSchema.safeParse({
        body: {
            batchId: validUuid,
            name: 'Aarav Sharma',
            parentName: 'Ritika Sharma',
            parentWhatsapp: '+919876543210',
            parentEmail: '',
            schoolName: 'DPS',
        },
    });

    assert.equal(result.success, true);
});

test('registerStudentSchema rejects malformed phone numbers', () => {
    const result = registerStudentSchema.safeParse({
        body: {
            batchId: validUuid,
            name: 'Aarav Sharma',
            parentName: 'Ritika Sharma',
            parentWhatsapp: '98-76',
        },
    });

    assert.equal(result.success, false);
});

test('paymentSchema allows numeric strings for backward compatibility', () => {
    const result = paymentSchema.safeParse({
        body: {
            studentId: validUuid,
            amount: '450.50',
        },
    });

    assert.equal(result.success, true);
});

test('payInstallmentSchema requires a positive numeric amount', () => {
    const result = payInstallmentSchema.safeParse({
        body: {
            studentId: validUuid,
            installmentId: validUuid,
            amount: 0,
        },
    });

    assert.equal(result.success, false);
});

test('setupAccountSchema accepts each supported coaching fee mode and preserves setup fields', () => {
    for (const coachingFeeMode of ['CURRENT_DUE_BASED', 'MONTH_COVERAGE']) {
        const result = setupAccountSchema.safeParse({
            body: {
                token: 'invite-token',
                username: 'teacher',
                password: 'secret123',
                city: 'Pune',
                area: 'Kothrud',
                subjectsOffered: ['Mathematics'],
                allowedClasses: ['10'],
                requiresGrades: true,
                googleMapsUrl: 'https://maps.example.test/place',
                isPubliclyListed: true,
                tagline: 'Exam prep',
                description: 'Coaching for board exams',
                coachingFeeMode,
            },
        });

        assert.equal(result.success, true);
    }
});

test('setupAccountSchema rejects unsupported coaching fee modes', () => {
    const result = setupAccountSchema.safeParse({
        body: { token: 'invite-token', coachingFeeMode: 'INSTALLMENT_BASED' },
    });

    assert.equal(result.success, false);
});

test('month coverage payment schema rejects non-positive amounts and malformed canonical months', () => {
    const base = {
        studentId: validUuid,
        amount: 500,
        paymentDate: '2026-08-22',
        paymentMethod: 'CASH',
        duration: 'MONTHLY',
        requestedStartMonth: '2026-08',
        allowGap: false,
    };

    for (const amount of [0, -1]) {
        assert.equal(createMonthCoveragePaymentSchema.safeParse({ body: { ...base, amount } }).success, false);
    }

    for (const requestedStartMonth of ['2026-00', '2026-13', '2026-8', 'August 2026']) {
        assert.equal(createMonthCoveragePaymentSchema.safeParse({ body: { ...base, requestedStartMonth } }).success, false);
    }
});
