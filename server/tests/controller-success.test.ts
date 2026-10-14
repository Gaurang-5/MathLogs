import test, { afterEach } from 'node:test';
import assert from 'node:assert/strict';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { prisma } from '../src/prisma';
import { loginAdmin, refreshTokenUser } from '../src/controllers/authController';
import { payInstallment } from '../src/controllers/feeController';
import { startOnlineQuiz, submitOnlineQuiz } from '../src/controllers/studentPortalController';
import { quizCache } from '../src/utils/redis';

type MockRequest = {
    body: Record<string, unknown>;
    headers?: Record<string, string>;
    params?: Record<string, string>;
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
        institute: {
            status: 'ACTIVE', plan: 'ENTERPRISE', planExpiryDate: new Date('2099-01-01T00:00:00Z'),
            marketplaceAccessGrantedAt: new Date('2026-01-01T00:00:00Z'), trialEndsAt: null,
            includedQuizCredits: 0, lifetimeQuizCredits: 0,
        },
    }) as never) as typeof prisma.admin.findUnique);
    replaceMethod(prisma.admin, 'findFirst', (async () => null as never) as typeof prisma.admin.findFirst);
    replaceMethod(bcrypt, 'compare', (async () => true) as typeof bcrypt.compare);
    replaceMethod(jwt, 'sign', (() => 'signed-access-token' as never) as typeof jwt.sign);
    replaceMethod(crypto, 'randomBytes', (((size: number) => Buffer.alloc(size, 7)) as unknown) as typeof crypto.randomBytes);
    replaceMethod(prisma.adminSession, 'create', (async () => ({ id: 'session-1' }) as never) as typeof prisma.adminSession.create);
    replaceMethod(prisma.authenticationEvent, 'create', (async () => ({ id: 'auth-event-1' }) as never) as typeof prisma.authenticationEvent.create);

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
        isQuizOnly: false,
        isPageOnly: false,
        quizCredits: 0,
        includedQuizCredits: 0,
        lifetimeQuizCredits: 0,
        includedQuizCreditsExpireAt: null,
        quizCreditsRenewAt: null,
        message: 'Login successful',
    });
    assert.equal(refreshTokenCreateCalls, 1);
});

test('refreshTokenUser rotates the refresh token on success', async () => {
    replaceMethod(prisma.refreshToken, 'findUnique', (async () => ({
        id: 'old-token-id',
        token: 'refresh-token',
        sessionId: 'session-2',
        session: { id: 'session-2', revokedAt: null, expiresAt: new Date(Date.now() + 60_000) },
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
    replaceMethod(prisma.adminSession, 'updateMany', (async () => ({ count: 1 }) as never) as typeof prisma.adminSession.updateMany);
    replaceMethod(prisma.authenticationEvent, 'create', (async () => ({ id: 'auth-event-2' }) as never) as typeof prisma.authenticationEvent.create);

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


function mockExplicitCollection(studentId: string, installmentId: string) {
    const payments: any[] = [];
    const actions = new Map<string, any>();
    let queue = Promise.resolve();
    replaceMethod(prisma, '$transaction', (async (callback: any) => {
        const previous=queue; let release!:()=>void;
        queue=new Promise<void>(resolve=>{release=resolve;});await previous;
        try { return await callback(prisma); } finally { release(); }
    }) as never);
    replaceMethod(prisma, '$queryRaw', (async()=>[]) as never);
    replaceMethod(prisma.student,'findUnique',(async()=>({id:studentId,name:'Fixture',instituteId:'inst-1',fees:[],feeAssignments:[],feePayments:payments,
        enrollments:[{feeDecision:'LEGACY',startedAt:new Date('2026-01-01'),batch:{teacherId:'teacher-1',name:'Batch',feeInstallments:[{id:installmentId,name:'October',amount:500,studentId:null,createdAt:new Date('2026-04-01')}]}}]})) as never);
    replaceMethod(prisma.feePayment,'create',(async({data}:any)=>{const payment={id:`payment-${payments.length+1}`,...data};payments.push(payment);return payment;}) as never);
    replaceMethod(prisma.systemLog,'create',(async()=>({})) as never);
    replaceMethod(prisma.enrollmentAction,'findUnique',(async({where}:any)=>actions.get(where.instituteId_idempotencyKey.idempotencyKey)||null) as never);
    replaceMethod(prisma.enrollmentAction,'create',(async({data}:any)=>{actions.set(data.idempotencyKey,data);return data;}) as never);
    return payments;
}
test('payInstallment records a valid installment payment',async()=>{
    const payments=mockExplicitCollection('student-1','installment-1');
    const res=createMockResponse();
    await payInstallment({body:{studentId:'student-1',installmentId:'installment-1',amount:500,date:'2026-04-03',idempotencyKey:'controller-payment'},user:{id:'teacher-1',instituteId:'inst-1'}} as never,res as never);
    assert.equal(res.statusCode,200);assert.equal(payments.length,1);
    assert.equal(payments[0].date.toISOString(),'2026-04-03T00:00:00.000Z');
});

test('startOnlineQuiz creates an attempt without exposing correct answers', async () => {
    replaceMethod(jwt, 'verify', (() => ({ studentId: 'student-quiz-1' }) as never) as typeof jwt.verify);
    replaceMethod(prisma.student, 'findUnique', (async () => ({
        id: 'student-quiz-1',
        batchId: 'batch-quiz-1',
        createdAt: new Date('2026-05-01T00:00:00.000Z'),
        quizSubmissions: [],
    }) as never) as typeof prisma.student.findUnique);
    replaceMethod(prisma.onlineQuiz, 'findUnique', (async () => ({
        timeLimitMins: 10,
    }) as never) as typeof prisma.onlineQuiz.findUnique);
    replaceMethod(prisma.quizSubmission, 'findMany', (async () => [] as never) as typeof prisma.quizSubmission.findMany);
    replaceMethod(quizCache, 'get', (async () => null) as typeof quizCache.get);
    replaceMethod(quizCache, 'set', (async () => undefined) as typeof quizCache.set);
    replaceMethod(prisma.onlineQuiz, 'findFirst', (async () => ({
        id: 'quiz-1',
        title: 'Online Quiz',
        batchId: 'batch-quiz-1',
        isPublic: false,
        availableFrom: null,
        availableUntil: null,
        timeLimitMins: 10,
        totalMarks: 1,
        batches: [],
        questions: [
            {
                id: 'question-1',
                questionText: '2 + 2?',
                options: ['3', '4'],
                correctOption: '4',
                marks: 1,
            },
        ],
    }) as never) as typeof prisma.onlineQuiz.findFirst);
    replaceMethod(prisma.quizSubmission, 'findUnique', (async () => null as never) as typeof prisma.quizSubmission.findUnique);
    replaceMethod(prisma.quizSubmission, 'upsert', (async () => ({
        id: 'submission-1',
        quizId: 'quiz-1',
        studentId: 'student-quiz-1',
        score: null,
        autoSavedAnswers: { 'question-1': '4' },
        startedAt: new Date('2026-05-21T05:00:00.000Z'),
        submittedAt: null,
    }) as never) as typeof prisma.quizSubmission.upsert);
    replaceMethod(prisma.quizSubmission, 'update', (async () => ({
        id: 'submission-1',
        quizId: 'quiz-1',
        studentId: 'student-quiz-1',
        score: null,
        autoSavedAnswers: { 'question-1': '4' },
        startedAt: new Date('2026-05-21T05:00:00.000Z'),
        submittedAt: null,
    }) as never) as typeof prisma.quizSubmission.update);

    const req = {
        headers: { authorization: 'Bearer student-token' },
        params: { id: 'quiz-1' },
        body: {},
    } as MockRequest;
    const res = createMockResponse();

    await startOnlineQuiz(req as never, res as never);

    assert.equal(res.statusCode, 200);
    const body = res.body as { quiz: { questions: Array<Record<string, unknown>> }; submission: { id: string; autoSavedAnswers: Record<string, string> } };
    assert.equal(body.submission.id, 'submission-1');
    assert.deepEqual(body.submission.autoSavedAnswers, { 'question-1': '4' });
    assert.equal(body.quiz.questions[0].questionText, '2 + 2?');
    assert.equal('correctOption' in body.quiz.questions[0], false);
});

test('startOnlineQuiz rejects scheduled cached quizzes before creating an attempt', async () => {
    replaceMethod(jwt, 'verify', (() => ({ studentId: 'student-quiz-1' }) as never) as typeof jwt.verify);
    replaceMethod(prisma.onlineQuiz, 'findUnique', (async () => ({
        timeLimitMins: 10,
    }) as never) as typeof prisma.onlineQuiz.findUnique);
    replaceMethod(prisma.quizSubmission, 'findMany', (async () => [] as never) as typeof prisma.quizSubmission.findMany);
    replaceMethod(prisma.student, 'findUnique', (async () => ({
        id: 'student-quiz-1',
        batchId: 'batch-quiz-1',
        createdAt: new Date('2026-05-01T00:00:00.000Z'),
        quizSubmissions: [],
    }) as never) as typeof prisma.student.findUnique);
    replaceMethod(quizCache, 'get', (async () => ({
        id: 'quiz-1',
        title: 'Scheduled Quiz',
        batchId: 'batch-quiz-1',
        isPublic: false,
        availableFrom: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
        availableUntil: new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString(),
        timeLimitMins: 10,
        totalMarks: 1,
        questions: [],
        batches: [],
    })) as typeof quizCache.get);

    let upsertCalled = false;
    replaceMethod(prisma.quizSubmission, 'upsert', (async () => {
        upsertCalled = true;
        return {} as never;
    }) as typeof prisma.quizSubmission.upsert);

    const req = {
        headers: { authorization: 'Bearer student-token' },
        params: { id: 'quiz-1' },
        body: {},
    } as MockRequest;
    const res = createMockResponse();

    await startOnlineQuiz(req as never, res as never);

    assert.equal(res.statusCode, 403);
    assert.deepEqual(res.body, { error: 'This quiz is not available yet.' });
    assert.equal(upsertCalled, false);
});

test('submitOnlineQuiz grades answers and prevents duplicate submissions', async () => {
    replaceMethod(jwt, 'verify', (() => ({ studentId: 'student-quiz-1' }) as never) as typeof jwt.verify);
    replaceMethod(prisma.student, 'findUnique', (async () => ({
        id: 'student-quiz-1',
        batchId: 'batch-quiz-1',
        createdAt: new Date('2026-05-01T00:00:00.000Z'),
    }) as never) as typeof prisma.student.findUnique);
    replaceMethod(prisma.onlineQuiz, 'findFirst', (async () => ({
        id: 'quiz-1',
        title: 'Online Quiz',
        timeLimitMins: 10,
        totalMarks: 2,
        questions: [
            {
                id: 'question-1',
                questionText: '2 + 2?',
                options: ['3', '4'],
                correctOption: '4',
                marks: 2,
            },
        ],
    }) as never) as typeof prisma.onlineQuiz.findFirst);

    let submitted = false;
    let savedAnswer: Record<string, unknown> | null = null;
    let submissionScore = 0;
    replaceMethod(prisma, '$transaction', (async (callback: any) => {
        const result = await callback({
            quizSubmission: {
                findUnique: async () => submitted
                    ? ({
                        id: 'submission-1',
                        submittedAt: new Date('2026-05-21T05:03:00.000Z'),
                        startedAt: new Date('2026-05-21T05:00:00.000Z'),
                    } as never)
                    : ({
                        id: 'submission-1',
                        submittedAt: null,
                        startedAt: new Date(),
                        cheatingEvents: [],
                        quiz: {
                            timeLimitMins: 10,
                            totalMarks: 2,
                            title: 'Online Quiz',
                            institute: { name: 'MathLogs Academy' },
                        },
                        shuffledQuestions: [
                            {
                                id: 'question-1',
                                questionText: '2 + 2?',
                                options: ['3', '4'],
                                correctOption: '4',
                                marks: 2,
                            }
                        ],
                    } as never),
                updateMany: async ({ data }: { data: any }) => {
                    submitted = true;
                    if (data && typeof data.score === 'number') {
                        submissionScore = data.score;
                    }
                    return { count: 1 };
                },
                create: async ({ data }: { data: any }) => {
                    submitted = true;
                    if (data && typeof data.score === 'number') {
                        submissionScore = data.score;
                    }
                    return { id: 'submission-1' };
                },
            },
            quizAnswer: {
                deleteMany: async () => ({ count: 0 }),
                createMany: async ({ data }: { data: Array<Record<string, unknown>> }) => {
                    savedAnswer = data[0];
                    return { count: data.length };
                },
            },
        });
        return result;
    }) as typeof prisma.$transaction);

    replaceMethod(prisma.quizSubmission, 'findUnique', (async () => ({
        id: 'submission-1',
        score: submissionScore,
    }) as never) as typeof prisma.quizSubmission.findUnique);

    const req = {
        headers: { authorization: 'Bearer student-token' },
        params: { id: 'quiz-1' },
        body: { answers: { 'question-1': '4' } },
    } as MockRequest;
    const res = createMockResponse();

    await submitOnlineQuiz(req as never, res as never);

    assert.equal(res.statusCode, 200);
    assert.deepEqual(res.body, { success: true, score: 2, totalMarks: 2 });
    assert.equal(savedAnswer?.isCorrect, true);
    assert.equal(savedAnswer?.marksObtained, 2);

    const duplicateRes = createMockResponse();
    await submitOnlineQuiz(req as never, duplicateRes as never);

    assert.equal(duplicateRes.statusCode, 400);
    assert.deepEqual(duplicateRes.body, { error: 'You have already submitted this quiz.' });
});
