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

async function putJson(path: string, body: unknown, headers: Record<string, string> = {}) {
    return fetch(`${baseUrl}${path}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', ...headers },
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

test('canonical Marketplace-only and expired Enterprise access cannot mutate ERP routes', async () => {
    replaceMethod(jwt, 'verify', (((token: string, secret: string, callback: (error: unknown, decoded?: unknown) => void) => {
        callback(null, { id: 'marketplace-auth-admin', username: 'marketplace-owner', passwordVersion: 1, instituteId: 'marketplace-auth-inst', role: 'INSTITUTE_ADMIN' });
    }) as unknown) as typeof jwt.verify);
    replaceMethod(prisma.admin, 'findUnique', (async () => ({
        id: 'marketplace-auth-admin',
        username: 'marketplace-owner',
        passwordVersion: 1,
        instituteId: 'marketplace-auth-inst',
        role: 'INSTITUTE_ADMIN',
        institute: {
            plan: 'ENTERPRISE',
            planExpiryDate: new Date('2026-01-01T00:00:00Z'),
            marketplaceAccessGrantedAt: new Date('2025-01-01T00:00:00Z'),
            trialEndsAt: null,
            includedQuizCredits: 5,
            lifetimeQuizCredits: 12,
        },
    }) as never) as typeof prisma.admin.findUnique);

    const response = await postJson('/api/students/manual', {}, { Authorization: 'Bearer valid-token' });
    assert.equal(response.status, 403);
    assert.equal((await response.json() as { error: string }).error, 'MARKETPLACE_ONLY_ACCESS_RESTRICTED');
});

test('canonical Quiz-only access cannot mutate Enterprise ERP routes', async () => {
    replaceMethod(jwt, 'verify', (((token: string, secret: string, callback: (error: unknown, decoded?: unknown) => void) => {
        callback(null, { id: 'quiz-auth-admin', username: 'quiz-owner', passwordVersion: 1, instituteId: 'quiz-auth-inst', role: 'INSTITUTE_ADMIN' });
    }) as unknown) as typeof jwt.verify);
    replaceMethod(prisma.admin, 'findUnique', (async () => ({
        id: 'quiz-auth-admin', username: 'quiz-owner', passwordVersion: 1, instituteId: 'quiz-auth-inst', role: 'INSTITUTE_ADMIN',
        institute: {
            plan: 'QUIZ', planExpiryDate: new Date('2099-01-01T00:00:00Z'),
            marketplaceAccessGrantedAt: new Date('2026-01-01T00:00:00Z'), trialEndsAt: null,
            includedQuizCredits: 5, lifetimeQuizCredits: 0,
        },
    }) as never) as typeof prisma.admin.findUnique);

    const response = await postJson('/api/students/manual', {}, { Authorization: 'Bearer valid-token' });
    assert.equal(response.status, 403);
    assert.equal((await response.json() as { error: string }).error, 'ENTERPRISE_PLAN_REQUIRED');
});

test('POST /api/auth/login returns tokens for valid credentials', async () => {
    replaceMethod(prisma.admin, 'findUnique', (async () => ({
        id: 'admin-1',
        username: 'owner',
        password: 'hashed-password',
        role: 'ADMIN',
        passwordVersion: 2,
        instituteId: 'inst-1',
        institute: {
            status: 'ACTIVE', plan: 'ENTERPRISE', planExpiryDate: new Date('2099-01-01T00:00:00Z'),
            marketplaceAccessGrantedAt: new Date('2026-01-01T00:00:00Z'), trialEndsAt: null,
            includedQuizCredits: 0, lifetimeQuizCredits: 0,
        },
    }) as never) as typeof prisma.admin.findUnique);
    replaceMethod(prisma.admin, 'findFirst', (async () => null as never) as typeof prisma.admin.findFirst);
    replaceMethod(bcrypt, 'compare', (async () => true) as typeof bcrypt.compare);
    replaceMethod(jwt, 'sign', (() => 'login-route-token' as never) as typeof jwt.sign);
    replaceMethod(crypto, 'randomBytes', (((size: number) => Buffer.alloc(size, 5)) as unknown) as typeof crypto.randomBytes);
    replaceMethod(prisma.adminSession, 'create', (async () => ({ id: 'session-route-1' }) as never) as typeof prisma.adminSession.create);
    replaceMethod(prisma.refreshToken, 'create', (async () => ({ id: 'rt-route-1' }) as never) as typeof prisma.refreshToken.create);
    replaceMethod(prisma.authenticationEvent, 'create', (async () => ({ id: 'auth-event-route-1' }) as never) as typeof prisma.authenticationEvent.create);

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
        isQuizOnly: false,
        isPageOnly: false,
        quizCredits: 0,
        includedQuizCredits: 0,
        lifetimeQuizCredits: 0,
        includedQuizCreditsExpireAt: null,
        quizCreditsRenewAt: null,
        message: 'Login successful',
    });
});

test('POST /api/auth/refresh rotates tokens for a valid refresh token', async () => {
    replaceMethod(prisma.refreshToken, 'findUnique', (async () => ({
        id: 'stored-token-id',
        token: 'stored-refresh-token',
        sessionId: 'session-route-2',
        session: { id: 'session-route-2', revokedAt: null, expiresAt: new Date(Date.now() + 60_000) },
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
    replaceMethod(prisma.adminSession, 'updateMany', (async () => ({ count: 1 }) as never) as typeof prisma.adminSession.updateMany);
    replaceMethod(prisma.refreshToken, 'create', (async () => ({ id: 'new-token-id' }) as never) as typeof prisma.refreshToken.create);
    replaceMethod(prisma.authenticationEvent, 'create', (async () => ({ id: 'auth-event-route-2' }) as never) as typeof prisma.authenticationEvent.create);
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
        passwordVersion: 1,
        instituteId: 'inst-1',
        role: 'ADMIN',
        institute: {
            planExpiryDate: null,
            plan: 'ENTERPRISE',
        },
    }) as never) as typeof prisma.admin.findUnique);
    replaceMethod(prisma.student, 'findUnique', (async () => ({
        id: 'student-1',
        name: 'Aarav Sharma',
        batchId: 'batch-1',
        parentWhatsapp: '',
        instituteId: 'inst-1',
        createdAt: new Date('2026-01-01T00:00:00Z'),
        batch: {
            id: 'batch-1',
            teacherId: 'teacher-1',
            institute: { name: 'MathLogs Institute' },
        },
    }) as never) as typeof prisma.student.findUnique);
    replaceMethod(prisma.feePayment, 'findMany', (async () => [] as never) as typeof prisma.feePayment.findMany);
    replaceMethod(prisma.feeInstallment, 'findUnique', (async () => ({
        id: 'installment-1',
        name: 'April Fee',
        amount: 500,
        studentId: null,
        batchId: 'batch-1',
        createdAt: new Date('2026-04-01T00:00:00Z')
    }) as never) as typeof prisma.feeInstallment.findUnique);
    replaceMethod(prisma.feePayment, 'create', (async ({ data }: { data: Record<string, unknown> }) => ({
        id: 'payment-route-1',
        studentId: data.studentId,
        installmentId: data.installmentId,
        amountPaid: data.amountPaid,
        date: data.date,
    }) as never) as typeof prisma.feePayment.create);
    replaceMethod(prisma.systemLog, 'create', (async () => ({ id: 'system-log-route-1' }) as never) as typeof prisma.systemLog.create);
    replaceMethod(prisma, '$transaction', (async (cb: any) => cb(prisma)) as typeof prisma.$transaction);

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

test('POST /api/tests/online saves generated quiz questions for a teacher batch', async () => {
    replaceMethod(jwt, 'verify', (((token: string, secret: string, callback: (error: unknown, decoded?: unknown) => void) => {
        callback(null, {
            id: 'teacher-quiz-1',
            username: 'owner',
            passwordVersion: 1,
            instituteId: 'inst-quiz-1',
            role: 'ADMIN',
        });
    }) as unknown) as typeof jwt.verify);
    replaceMethod(prisma.admin, 'findUnique', (async () => ({
        id: 'teacher-quiz-1',
        username: 'owner',
        passwordVersion: 1,
        instituteId: 'inst-quiz-1',
        role: 'ADMIN',
        institute: {
            planExpiryDate: null,
            plan: 'ENTERPRISE',
        },
    }) as never) as typeof prisma.admin.findUnique);
    replaceMethod(prisma.batch, 'findFirst', (async () => ({ id: 'batch-quiz-1' }) as never) as typeof prisma.batch.findFirst);
    replaceMethod(prisma.batch, 'findMany', (async () => [{ id: 'batch-quiz-1' }] as never) as typeof prisma.batch.findMany);
    replaceMethod(prisma.institute, 'findUnique', (async () => ({
        id: 'inst-quiz-1',
        createdAt: new Date('2026-01-01T00:00:00.000Z'),
        plan: 'QUIZ',
        planStartDate: new Date('2026-08-01T00:00:00.000Z'),
        planExpiryDate: new Date('2026-09-01T00:00:00.000Z'),
        trialEndsAt: null,
        marketplaceAccessGrantedAt: new Date('2026-08-01T00:00:00.000Z'),
        includedQuizCredits: 5,
        includedQuizCreditsExpireAt: new Date('2026-09-01T00:00:00.000Z'),
        lifetimeQuizCredits: 0,
        quizCreditsRenewAt: new Date('2026-09-01T00:00:00.000Z'),
        quizCredits: 5,
    }) as never) as typeof prisma.institute.findUnique);
    replaceMethod(prisma.institute, 'update', (async () => ({
        id: 'inst-quiz-1',
        createdAt: new Date('2026-01-01T00:00:00.000Z'),
        plan: 'QUIZ',
        planStartDate: new Date('2026-08-01T00:00:00.000Z'),
        planExpiryDate: new Date('2026-09-01T00:00:00.000Z'),
        trialEndsAt: null,
        marketplaceAccessGrantedAt: new Date('2026-08-01T00:00:00.000Z'),
        includedQuizCredits: 4,
        includedQuizCreditsExpireAt: new Date('2026-09-01T00:00:00.000Z'),
        lifetimeQuizCredits: 0,
        quizCreditsRenewAt: new Date('2026-09-01T00:00:00.000Z'),
        quizCredits: 4,
    }) as never) as typeof prisma.institute.update);
    replaceMethod(prisma, '$executeRaw', (async () => 1) as typeof prisma.$executeRaw);
    replaceMethod(prisma, '$transaction', (async (callback: any) => callback(prisma)) as typeof prisma.$transaction);

    let createdQuestions: Array<Record<string, unknown>> = [];
    replaceMethod(prisma.onlineQuiz, 'create', (async ({ data }: { data: any }) => {
        createdQuestions = data.questions.create;
        return {
            id: 'quiz-route-1',
            title: data.title,
            topic: data.topic,
            difficulty: data.difficulty,
            timeLimitMins: data.timeLimitMins,
            totalMarks: data.totalMarks,
            batchId: data.batchId,
            instituteId: data.instituteId,
            teacherId: data.teacherId,
            batch: { id: data.batchId, name: 'Batch A', className: '10' },
            questions: createdQuestions.map((question, index) => ({ id: `q-${index + 1}`, ...question })),
            _count: { submissions: 0 },
        } as never;
    }) as typeof prisma.onlineQuiz.create);

    const response = await postJson('/api/tests/online', {
        title: 'Linear Equations Quiz',
        topic: 'Linear equations',
        difficulty: 'Medium',
        timeLimitMins: 15,
        totalMarks: 2,
        availableFrom: '2026-05-21T04:00:00.000Z',
        availableUntil: '2026-05-21T05:00:00.000Z',
        batchId: 'batch-quiz-1',
        questions: [
            {
                questionText: 'What is x if x + 2 = 5?',
                options: ['2', '3', '4', '5'],
                correctAnswer: '3',
                marks: 2,
            },
        ],
    }, {
        Authorization: 'Bearer valid-token',
    });

    assert.equal(response.status, 200);

    const json = await response.json() as { id: string; title: string; questions: Array<{ orderIndex: number; correctOption: string }> };
    assert.equal(json.id, 'quiz-route-1');
    assert.equal(json.title, 'Linear Equations Quiz');
    assert.equal(json.questions[0].orderIndex, 0);
    assert.equal(json.questions[0].correctOption, '3');
    assert.equal(createdQuestions.length, 1);
});

test('PUT /api/tests/online charges one credit when publishing a draft and never charges it twice', async () => {
    replaceMethod(jwt, 'verify', (((token: string, secret: string, callback: (error: unknown, decoded?: unknown) => void) => {
        callback(null, { id: 'draft-publish-admin', username: 'quiz-owner', passwordVersion: 1, instituteId: 'draft-publish-inst', role: 'INSTITUTE_ADMIN' });
    }) as unknown) as typeof jwt.verify);
    replaceMethod(prisma.admin, 'findUnique', (async () => ({
        id: 'draft-publish-admin', username: 'quiz-owner', passwordVersion: 1, instituteId: 'draft-publish-inst', role: 'INSTITUTE_ADMIN',
        institute: { plan: 'QUIZ', planExpiryDate: new Date('2099-01-01T00:00:00Z'), trialEndsAt: null, marketplaceAccessGrantedAt: new Date(), includedQuizCredits: 5, lifetimeQuizCredits: 0 },
    }) as never) as typeof prisma.admin.findUnique);

    let finalized = false;
    let includedCredits = 5;
    const walletInstitute = () => ({
        id: 'draft-publish-inst', createdAt: new Date('2026-01-01T00:00:00Z'), plan: 'QUIZ',
        planStartDate: new Date('2026-08-01T00:00:00Z'), planExpiryDate: new Date('2099-01-01T00:00:00Z'), trialEndsAt: null,
        marketplaceAccessGrantedAt: new Date('2026-08-01T00:00:00Z'), includedQuizCredits: includedCredits,
        includedQuizCreditsExpireAt: new Date('2099-01-01T00:00:00Z'), lifetimeQuizCredits: 0,
        quizCreditsRenewAt: new Date('2099-01-01T00:00:00Z'), quizCredits: includedCredits,
    });
    replaceMethod(prisma.institute, 'findUnique', (async () => walletInstitute() as never) as typeof prisma.institute.findUnique);
    replaceMethod(prisma.institute, 'update', (async ({ data }: { data: any }) => {
        includedCredits = Number(data.includedQuizCredits);
        return walletInstitute() as never;
    }) as typeof prisma.institute.update);
    replaceMethod(prisma, '$executeRaw', (async () => 1) as typeof prisma.$executeRaw);
    replaceMethod(prisma, '$transaction', (async (callback: any) => callback(prisma)) as typeof prisma.$transaction);
    replaceMethod(prisma.onlineQuiz, 'findFirst', (async () => ({
        id: 'draft-quiz-1', teacherId: 'draft-publish-admin', instituteId: 'draft-publish-inst', batchId: null,
        title: 'Draft quiz', topic: 'Algebra', difficulty: 'Medium', timeLimitMins: 20, totalMarks: 1,
        availableFrom: null, availableUntil: null, isFinalized: finalized, isPublic: true, studentQuestionCount: null,
        questions: [{ id: 'question-1', questionText: '1 + 1?', options: ['1', '2'], correctOption: '2', marks: 1 }],
        _count: { submissions: 0 },
    }) as never) as typeof prisma.onlineQuiz.findFirst);
    replaceMethod(prisma.onlineQuiz, 'update', (async ({ data }: { data: any }) => {
        finalized = Boolean(data.isFinalized);
        return { id: 'draft-quiz-1', isFinalized: finalized } as never;
    }) as typeof prisma.onlineQuiz.update);
    replaceMethod(prisma.onlineQuiz, 'updateMany', (async () => {
        if (finalized) return { count: 0 };
        finalized = true;
        return { count: 1 };
    }) as typeof prisma.onlineQuiz.updateMany);

    const body = {
        title: 'Published quiz', topic: 'Algebra', difficulty: 'Medium', timeLimitMins: 20, totalMarks: 1,
        availableFrom: '2098-01-01T00:00:00.000Z', availableUntil: '2098-01-02T00:00:00.000Z', isPublic: true, isDraft: false,
    };
    const first = await putJson('/api/tests/online/draft-quiz-1', body, { Authorization: 'Bearer valid-token' });
    const second = await putJson('/api/tests/online/draft-quiz-1', body, { Authorization: 'Bearer valid-token' });
    assert.equal(first.status, 200);
    assert.equal(second.status, 200);
    assert.equal(includedCredits, 4);
});

test('POST /api/fees/pay is idempotent and prevents double-payment', async () => {
    replaceMethod(jwt, 'verify', (((token: string, secret: string, callback: any) => {
        callback(null, { id: 'teacher-1', instituteId: 'inst-1', role: 'ADMIN' });
    }) as unknown) as typeof jwt.verify);
    replaceMethod(prisma.admin, 'findUnique', (async () => ({
        id: 'teacher-1', instituteId: 'inst-1', role: 'ADMIN', institute: { plan: 'ENTERPRISE' },
    }) as never) as typeof prisma.admin.findUnique);

    let txLock = Promise.resolve();
    replaceMethod(prisma, '$transaction', (async (cb: any) => {
        const previous = txLock;
        let release!: () => void;
        txLock = new Promise(r => { release = r; });
        await previous;
        try {
            return await cb(prisma);
        } finally {
            release();
        }
    }) as typeof prisma.$transaction);

    let createdRecords: any[] = [];
    replaceMethod(prisma.student, 'findUnique', (async () => ({
        id: '123e4567-e89b-12d3-a456-426614174002',
        name: 'Idempotency Test',
        instituteId: 'inst-1',
        createdAt: new Date(),
        batch: { teacherId: 'teacher-1', feeAmount: 1000, feeInstallments: [] },
        fees: [...createdRecords],
        feePayments: []
    }) as never) as typeof prisma.student.findUnique);

    replaceMethod(prisma.feeRecord, 'create', (async ({ data }: any) => {
        createdRecords.push(data);
        return { id: 'fr-1', ...data };
    }) as typeof prisma.feeRecord.create);
    replaceMethod(prisma.systemLog, 'create', (async () => ({})) as typeof prisma.systemLog.create);

    const [res1, res2] = await Promise.all([
        postJson('/api/fees/pay', { studentId: '123e4567-e89b-12d3-a456-426614174002', amount: 1000 }, { Authorization: 'Bearer token' }),
        postJson('/api/fees/pay', { studentId: '123e4567-e89b-12d3-a456-426614174002', amount: 1000 }, { Authorization: 'Bearer token' })
    ]);

    assert.ok(res1.status === 200 || res2.status === 200, 'At least one request should succeed');
    assert.ok(res1.status === 400 || res2.status === 400, 'One request should fail due to overpayment');
    assert.equal(createdRecords.length, 1, 'Only one fee record should be created');
});

test('POST /api/fees/pay-installment is idempotent and prevents double-payment', async () => {
    replaceMethod(jwt, 'verify', (((token: string, secret: string, callback: any) => {
        callback(null, { id: 'teacher-1', instituteId: 'inst-1', role: 'ADMIN' });
    }) as unknown) as typeof jwt.verify);
    replaceMethod(prisma.admin, 'findUnique', (async () => ({
        id: 'teacher-1', instituteId: 'inst-1', role: 'ADMIN', institute: { plan: 'ENTERPRISE' },
    }) as never) as typeof prisma.admin.findUnique);

    let txLock = Promise.resolve();
    replaceMethod(prisma, '$transaction', (async (cb: any) => {
        const previous = txLock;
        let release!: () => void;
        txLock = new Promise(r => { release = r; });
        await previous;
        try {
            return await cb(prisma);
        } finally {
            release();
        }
    }) as typeof prisma.$transaction);

    replaceMethod(prisma.student, 'findUnique', (async () => ({
        id: '123e4567-e89b-12d3-a456-426614174003',
        name: 'Installment Test',
        instituteId: 'inst-1',
        batchId: 'batch-1',
        createdAt: new Date('2026-01-01T00:00:00Z'),
        batch: { id: 'batch-1', teacherId: 'teacher-1', institute: { name: 'Inst' } }
    }) as never) as typeof prisma.student.findUnique);

    replaceMethod(prisma.feeInstallment, 'findUnique', (async () => ({
        id: '123e4567-e89b-12d3-a456-426614174004',
        name: 'May Fee',
        amount: 500,
        studentId: null,
        batchId: 'batch-1',
        createdAt: new Date('2026-04-01T00:00:00Z')
    }) as never) as typeof prisma.feeInstallment.findUnique);

    let createdInstallmentPayments: any[] = [];
    replaceMethod(prisma.feePayment, 'findMany', (async () => [...createdInstallmentPayments]) as typeof prisma.feePayment.findMany);
    replaceMethod(prisma.feePayment, 'create', (async ({ data }: any) => {
        createdInstallmentPayments.push(data);
        return { id: 'fp-1', ...data };
    }) as typeof prisma.feePayment.create);
    replaceMethod(prisma.systemLog, 'create', (async () => ({})) as typeof prisma.systemLog.create);

    const [res1, res2] = await Promise.all([
        postJson('/api/fees/pay-installment', { studentId: '123e4567-e89b-12d3-a456-426614174003', installmentId: '123e4567-e89b-12d3-a456-426614174004', amount: 500 }, { Authorization: 'Bearer token' }),
        postJson('/api/fees/pay-installment', { studentId: '123e4567-e89b-12d3-a456-426614174003', installmentId: '123e4567-e89b-12d3-a456-426614174004', amount: 500 }, { Authorization: 'Bearer token' })
    ]);

    assert.ok(res1.status === 200 || res2.status === 200, 'At least one request should succeed');
    assert.ok(res1.status === 400 || res2.status === 400, 'One request should fail due to overpayment');
    assert.equal(createdInstallmentPayments.length, 1, 'Only one fee payment should be created');
});
