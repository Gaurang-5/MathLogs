import test, { after, afterEach, before } from 'node:test';
import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { prisma } from '../src/prisma';

let server: Server;
let baseUrl: string;
const restores: Array<() => void> = [];

function replaceMethod<T extends object, K extends keyof T>(target: T, key: K, replacement: T[K]) {
    const original = target[key];
    target[key] = replacement;
    restores.push(() => {
        target[key] = original;
    });
}

before(async () => {
    const { app } = await import('../src/index');

    await new Promise<void>((resolve) => {
        server = app.listen(0, () => resolve());
    });

    const address = server.address() as AddressInfo;
    baseUrl = `http://127.0.0.1:${address.port}`;
});

after(async () => {
    await new Promise<void>((resolve, reject) => {
        server.close((error) => {
            if (error) reject(error);
            else resolve();
        });
    });
});

afterEach(() => {
    while (restores.length > 0) {
        restores.pop()?.();
    }
});

async function postJson(path: string, body: unknown, headers: Record<string, string> = {}) {
    return fetch(`${baseUrl}${path}`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            ...headers,
        },
        body: JSON.stringify(body),
    });
}

test('POST /api/auth/login rejects invalid payloads before controller execution', async () => {
    const response = await postJson('/api/auth/login', {
        username: '',
        password: '123',
    });

    assert.equal(response.status, 400);

    const json = await response.json() as { error: string; details: Array<{ path: string[]; message: string }> };
    assert.equal(json.error, 'Validation failed');
    assert.ok(json.details.some((detail) => detail.path.join('.') === 'body.username'));
    assert.ok(json.details.some((detail) => detail.path.join('.') === 'body.password'));
});

test('POST /api/public/register rejects malformed registration input', async () => {
    const response = await postJson('/api/public/register', {
        batchId: 'not-a-uuid',
        name: 'Aarav',
        parentName: 'Ritika',
        parentWhatsapp: '1234',
    });

    assert.equal(response.status, 400);

    const json = await response.json() as { error: string; details: Array<{ path: string[]; message: string }> };
    assert.equal(json.error, 'Validation failed');
    assert.ok(json.details.some((detail) => detail.path.join('.') === 'body.batchId'));
    assert.ok(json.details.some((detail) => detail.path.join('.') === 'body.parentWhatsapp'));
});

test('POST /api/auth/refresh returns 400 when refresh token is missing', async () => {
    const response = await postJson('/api/auth/refresh', {});

    assert.equal(response.status, 400);

    const json = await response.json() as { error: string };
    assert.equal(json.error, 'Refresh token is required');
});

test('GET /api/auth/me requires an authorization header', async () => {
    const response = await fetch(`${baseUrl}/api/auth/me`);

    assert.equal(response.status, 401);
});

test('POST /api/fees/pay rejects invalid bearer tokens before hitting the controller', async () => {
    const response = await postJson('/api/fees/pay', {
        studentId: '123e4567-e89b-12d3-a456-426614174000',
        amount: 500,
    }, {
        Authorization: 'Bearer definitely-invalid',
    });

    assert.equal(response.status, 403);
});

test('POST /api/auth/login returns tokens for valid credentials', async () => {
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
    replaceMethod(jwt, 'sign', (() => 'login-route-token' as never) as typeof jwt.sign);
    replaceMethod(crypto, 'randomBytes', (((size: number) => Buffer.alloc(size, 5)) as unknown) as typeof crypto.randomBytes);
    replaceMethod(prisma.refreshToken, 'create', (async () => ({ id: 'rt-route-1' }) as never) as typeof prisma.refreshToken.create);

    const response = await postJson('/api/auth/login', {
        username: 'owner',
        password: 'correct-password',
    });

    assert.equal(response.status, 200);

    const json = await response.json() as {
        success: boolean;
        adminId: string;
        token: string;
        refreshToken: string;
        role: string;
        message: string;
    };

    assert.deepEqual(json, {
        success: true,
        adminId: 'admin-1',
        token: 'login-route-token',
        refreshToken: Buffer.alloc(40, 5).toString('hex'),
        role: 'ADMIN',
        message: 'Login successful',
    });
});

test('POST /api/auth/refresh rotates tokens for a valid refresh token', async () => {
    replaceMethod(prisma.refreshToken, 'findUnique', (async () => ({
        id: 'stored-token-id',
        token: 'stored-refresh-token',
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
    replaceMethod(prisma.refreshToken, 'delete', (async () => ({ id: 'stored-token-id' }) as never) as typeof prisma.refreshToken.delete);
    replaceMethod(prisma.refreshToken, 'create', (async () => ({ id: 'new-token-id' }) as never) as typeof prisma.refreshToken.create);
    replaceMethod(jwt, 'sign', (() => 'refresh-route-token' as never) as typeof jwt.sign);
    replaceMethod(crypto, 'randomBytes', (((size: number) => Buffer.alloc(size, 6)) as unknown) as typeof crypto.randomBytes);

    const response = await postJson('/api/auth/refresh', {
        refreshToken: 'stored-refresh-token',
    });

    assert.equal(response.status, 200);

    const json = await response.json() as {
        success: boolean;
        token: string;
        refreshToken: string;
    };

    assert.deepEqual(json, {
        success: true,
        token: 'refresh-route-token',
        refreshToken: Buffer.alloc(40, 6).toString('hex'),
    });
});

test('POST /api/fees/pay-installment records a payment for an authenticated teacher', async () => {
    replaceMethod(jwt, 'verify', (((token: string, secret: string, callback: (error: unknown, decoded?: unknown) => void) => {
        callback(null, {
            id: 'teacher-1',
            username: 'owner',
            passwordVersion: 1,
            instituteId: 'inst-1',
            role: 'ADMIN',
        });
    }) as unknown) as typeof jwt.verify);
    replaceMethod(prisma.admin, 'findUnique', (async () => ({
        id: 'teacher-1',
        username: 'owner',
        currentAcademicYearId: 'year-1',
        passwordVersion: 1,
        instituteId: 'inst-1',
        role: 'ADMIN',
        institute: {
            planExpiryDate: null,
            plan: 'ACTIVE',
        },
    }) as never) as typeof prisma.admin.findUnique);
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
    replaceMethod(prisma.feePayment, 'create', (async ({ data }: { data: Record<string, unknown> }) => ({
        id: 'payment-route-1',
        studentId: data.studentId,
        installmentId: data.installmentId,
        amountPaid: data.amountPaid,
        date: data.date,
    }) as never) as typeof prisma.feePayment.create);

    const response = await postJson('/api/fees/pay-installment', {
        studentId: '123e4567-e89b-12d3-a456-426614174000',
        installmentId: '123e4567-e89b-12d3-a456-426614174001',
        amount: 500,
        date: '2026-04-03',
    }, {
        Authorization: 'Bearer valid-token',
    });

    assert.equal(response.status, 200);

    const json = await response.json() as {
        id: string;
        studentId: string;
        installmentId: string;
        amountPaid: number;
        date: string;
    };

    assert.equal(json.id, 'payment-route-1');
    assert.equal(json.studentId, '123e4567-e89b-12d3-a456-426614174000');
    assert.equal(json.installmentId, '123e4567-e89b-12d3-a456-426614174001');
    assert.equal(json.amountPaid, 500);
    assert.equal(json.date, new Date('2026-04-03').toISOString());
});
