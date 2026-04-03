import test, { afterEach } from 'node:test';
import assert from 'node:assert/strict';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { prisma } from '../src/prisma';
import { loginAdmin, refreshTokenUser } from '../src/controllers/authController';
import { payInstallment } from '../src/controllers/feeController';

type MockRequest = {
    body: Record<string, unknown>;
    user?: Record<string, unknown>;
};

type MockResponse = {
    statusCode: number;
    body: unknown;
    status: (code: number) => MockResponse;
    json: (payload: unknown) => MockResponse;
    sendStatus: (code: number) => MockResponse;
};

function createMockResponse(): MockResponse {
    return {
        statusCode: 200,
        body: undefined,
        status(code: number) {
            this.statusCode = code;
            return this;
        },
        json(payload: unknown) {
            this.body = payload;
            return this;
        },
        sendStatus(code: number) {
            this.statusCode = code;
            this.body = undefined;
            return this;
        },
    };
}

const restores: Array<() => void> = [];

function replaceMethod<T extends object, K extends keyof T>(target: T, key: K, replacement: T[K]) {
    const original = target[key];
    target[key] = replacement;
    restores.push(() => {
        target[key] = original;
    });
}

afterEach(() => {
    while (restores.length > 0) {
        restores.pop()?.();
    }
});

test('loginAdmin returns tokens for a valid admin', async () => {
    replaceMethod(prisma.admin, 'findUnique', (async () => ({
        id: 'admin-1',
        username: 'owner',
        password: 'hashed-password',
        role: 'ADMIN',
        passwordVersion: 2,
        instituteId: 'inst-1',
        institute: { status: 'ACTIVE' },
    }) as never) as typeof prisma.admin.findUnique);
    replaceMethod(prisma.admin, 'findFirst', (async () => null as never) as typeof prisma.admin.findFirst);
    replaceMethod(bcrypt, 'compare', (async () => true) as typeof bcrypt.compare);
    replaceMethod(jwt, 'sign', (() => 'signed-access-token' as never) as typeof jwt.sign);
    replaceMethod(crypto, 'randomBytes', (((size: number) => Buffer.alloc(size, 7)) as unknown) as typeof crypto.randomBytes);

    let refreshTokenCreateCalls = 0;
    replaceMethod(prisma.refreshToken, 'create', (async () => {
        refreshTokenCreateCalls += 1;
        return { id: 'rt-1' } as never;
    }) as typeof prisma.refreshToken.create);

    const req = {
        body: {
            username: 'owner',
            password: 'correct-password',
        },
    } as MockRequest;
    const res = createMockResponse();

    await loginAdmin(req as never, res as never);

    assert.equal(res.statusCode, 200);
    assert.deepEqual(res.body, {
        success: true,
        adminId: 'admin-1',
        token: 'signed-access-token',
        refreshToken: Buffer.alloc(40, 7).toString('hex'),
        role: 'ADMIN',
        message: 'Login successful',
    });
    assert.equal(refreshTokenCreateCalls, 1);
});

test('refreshTokenUser rotates the refresh token on success', async () => {
    replaceMethod(prisma.refreshToken, 'findUnique', (async () => ({
        id: 'old-token-id',
        token: 'refresh-token',
        expiresAt: new Date(Date.now() + 60_000),
        admin: {
            id: 'admin-2',
            username: 'teacher',
            role: 'ADMIN',
            passwordVersion: 3,
            instituteId: 'inst-2',
            institute: { status: 'ACTIVE' },
        },
    }) as never) as typeof prisma.refreshToken.findUnique);

    let refreshTokenDeleteCalls = 0;
    replaceMethod(prisma.refreshToken, 'delete', (async () => {
        refreshTokenDeleteCalls += 1;
        return { id: 'old-token-id' } as never;
    }) as typeof prisma.refreshToken.delete);

    let refreshTokenCreateCalls = 0;
    replaceMethod(prisma.refreshToken, 'create', (async () => {
        refreshTokenCreateCalls += 1;
        return { id: 'new-token-id' } as never;
    }) as typeof prisma.refreshToken.create);

    replaceMethod(jwt, 'sign', (() => 'rotated-access-token' as never) as typeof jwt.sign);
    replaceMethod(crypto, 'randomBytes', (((size: number) => Buffer.alloc(size, 9)) as unknown) as typeof crypto.randomBytes);

    const req = {
        body: {
            refreshToken: 'refresh-token',
        },
    } as MockRequest;
    const res = createMockResponse();

    await refreshTokenUser(req as never, res as never);

    assert.equal(res.statusCode, 200);
    assert.deepEqual(res.body, {
        success: true,
        token: 'rotated-access-token',
        refreshToken: Buffer.alloc(40, 9).toString('hex'),
    });
    assert.equal(refreshTokenDeleteCalls, 1);
    assert.equal(refreshTokenCreateCalls, 1);
});

test('payInstallment records a valid installment payment', async () => {
    replaceMethod(prisma.student, 'findUnique', (async () => ({
        id: 'student-1',
        name: 'Aarav Sharma',
        batchId: 'batch-1',
        parentWhatsapp: '',
        instituteId: 'inst-1',
        batch: {
            teacherId: 'teacher-1',
            institute: { name: 'MathLogs Institute' },
        },
    }) as never) as typeof prisma.student.findUnique);
    replaceMethod(prisma.feePayment, 'findMany', (async () => [] as never) as typeof prisma.feePayment.findMany);
    replaceMethod(prisma.feeInstallment, 'findUnique', (async () => ({
        id: 'installment-1',
        name: 'April Fee',
        amount: 500,
    }) as never) as typeof prisma.feeInstallment.findUnique);

    let paymentCreateCalls = 0;
    replaceMethod(prisma.feePayment, 'create', (async ({ data }: { data: Record<string, unknown> }) => {
        paymentCreateCalls += 1;
        return {
            id: 'payment-1',
            studentId: data.studentId,
            installmentId: data.installmentId,
            amountPaid: data.amountPaid,
            date: data.date,
        } as never;
    }) as typeof prisma.feePayment.create);

    const req = {
        body: {
            studentId: 'student-1',
            installmentId: 'installment-1',
            amount: 500,
            date: '2026-04-03',
        },
        user: {
            id: 'teacher-1',
            instituteId: 'inst-1',
        },
    } as MockRequest;
    const res = createMockResponse();

    await payInstallment(req as never, res as never);

    assert.equal(res.statusCode, 200);
    assert.deepEqual(res.body, {
        id: 'payment-1',
        studentId: 'student-1',
        installmentId: 'installment-1',
        amountPaid: 500,
        date: new Date('2026-04-03'),
    });
    assert.equal(paymentCreateCalls, 1);
});
