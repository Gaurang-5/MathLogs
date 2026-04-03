import test from 'node:test';
import assert from 'node:assert/strict';
import { loginSchema, registerStudentSchema, paymentSchema, payInstallmentSchema } from '../src/schemas';

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
