import test, { afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { prisma } from '../src/prisma';
import { payInstallment, sendFeeReminder } from '../src/controllers/feeController';

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

// Mock helpers for payInstallment
function setupPayInstallmentMock(installmentOverrides: any, existingPaymentsCount: number = 0) {
    replaceMethod(prisma.student, 'findUnique', (async () => ({
        id: 'student-1',
        name: 'Target Student',
        batchId: 'batch-1',
        createdAt: new Date('2026-03-01T00:00:00Z'), // Joined March 1st
        instituteId: 'inst-1',
        batch: {
            teacherId: 'teacher-1',
            institute: { name: 'Institute' },
        },
    }) as never) as typeof prisma.student.findUnique);

    replaceMethod(prisma.feePayment, 'findMany', (async () => {
        if (existingPaymentsCount > 0) {
            return [{ amountPaid: 100 }] as never; // prior payment
        }
        return [] as never;
    }) as typeof prisma.feePayment.findMany);

    replaceMethod(prisma.feeInstallment, 'findUnique', (async () => ({
        id: 'installment-1',
        name: 'Test Installment',
        amount: 500,
        ...installmentOverrides,
    }) as never) as typeof prisma.feeInstallment.findUnique);

    replaceMethod(prisma.feePayment, 'create', (async () => ({ id: 'payment-1' }) as never) as typeof prisma.feePayment.create);
    replaceMethod(prisma.systemLog, 'create', (async () => ({})) as never as typeof prisma.systemLog.create);
    replaceMethod(prisma, '$transaction', (async (callback: any) => callback(prisma)) as typeof prisma.$transaction);
}

test('payInstallment security: CANNOT pay towards another student\'s custom installment', async () => {
    setupPayInstallmentMock({
        studentId: 'student-2', // belongs to someone else
        batchId: 'batch-1',
        createdAt: new Date('2026-04-01T00:00:00Z')
    });

    const req = {
        body: { studentId: 'student-1', installmentId: 'installment-1', amount: 500 },
        user: { id: 'teacher-1', instituteId: 'inst-1' }
    } as MockRequest;
    const res = createMockResponse();

    await payInstallment(req as never, res as never);
    assert.equal(res.statusCode, 403);
    assert.deepEqual(res.body, { error: 'Forbidden: Installment is not valid for this student' });
});

test('payInstallment security: CANNOT pay towards global installment from a different batch', async () => {
    setupPayInstallmentMock({
        studentId: null, // global
        batchId: 'batch-2', // different batch
        createdAt: new Date('2026-04-01T00:00:00Z') // after join
    });

    const req = {
        body: { studentId: 'student-1', installmentId: 'installment-1', amount: 500 },
        user: { id: 'teacher-1', instituteId: 'inst-1' }
    } as MockRequest;
    const res = createMockResponse();

    await payInstallment(req as never, res as never);
    assert.equal(res.statusCode, 403);
    assert.deepEqual(res.body, { error: 'Forbidden: Installment is not valid for this student' });
});

test('payInstallment security: CAN pay towards their own custom installment', async () => {
    setupPayInstallmentMock({
        studentId: 'student-1', // their own
        batchId: 'batch-1',
        createdAt: new Date('2026-01-01T00:00:00Z') // before join (doesn't matter for custom)
    });

    const req = {
        body: { studentId: 'student-1', installmentId: 'installment-1', amount: 500 },
        user: { id: 'teacher-1', instituteId: 'inst-1' }
    } as MockRequest;
    const res = createMockResponse();

    await payInstallment(req as never, res as never);
    assert.equal(res.statusCode, 200);
});

test('payInstallment security: CAN pay towards valid global installment in own batch after join date', async () => {
    setupPayInstallmentMock({
        studentId: null, // global
        batchId: 'batch-1', // own batch
        createdAt: new Date('2026-04-01T00:00:00Z') // after join
    });

    const req = {
        body: { studentId: 'student-1', installmentId: 'installment-1', amount: 500 },
        user: { id: 'teacher-1', instituteId: 'inst-1' }
    } as MockRequest;
    const res = createMockResponse();

    await payInstallment(req as never, res as never);
    assert.equal(res.statusCode, 200);
});

test('payInstallment security: CAN pay towards global installment before join date IF prior payment exists', async () => {
    setupPayInstallmentMock({
        studentId: null, // global
        batchId: 'batch-1', // own batch
        createdAt: new Date('2026-01-01T00:00:00Z') // BEFORE join date
    }, 1); // 1 prior payment

    const req = {
        body: { studentId: 'student-1', installmentId: 'installment-1', amount: 400 },
        user: { id: 'teacher-1', instituteId: 'inst-1' }
    } as MockRequest;
    const res = createMockResponse();

    await payInstallment(req as never, res as never);
    assert.equal(res.statusCode, 200);
});


// Mock helpers for sendFeeReminder
test('sendFeeReminder: Ignores client amountDue and uses server-calculated balance', async () => {
    replaceMethod(prisma.student, 'findUnique', (async () => ({
        id: 'student-1',
        name: 'Aarav Sharma',
        parentEmail: 'parent@test.com',
        createdAt: new Date('2026-01-01T00:00:00Z'),
        batch: {
            teacherId: 'teacher-1',
            feeAmount: 5000,
            feeInstallments: []
        },
        fees: [],
        feePayments: []
    }) as never) as typeof prisma.student.findUnique);

    let emailJobCreated = false;
    let emailBody = '';
    replaceMethod(prisma.emailJob, 'create', (async ({ data }: any) => {
        emailJobCreated = true;
        emailBody = data.body;
        return {} as never;
    }) as typeof prisma.emailJob.create);

    const req = {
        body: { studentId: 'student-1', amountDue: 1000000 }, // Client tries to spoof 1,000,000
        user: { id: 'teacher-1', instituteId: 'inst-1' }
    } as MockRequest;
    const res = createMockResponse();

    await sendFeeReminder(req as never, res as never);
    
    assert.equal(emailJobCreated, true);
    // Real server balance is 5000, client asked for 1000000. Ensure 5000 is used.
    assert.match(emailBody, /Rs\. 5,000/);
    assert.doesNotMatch(emailBody, /1,000,000/);
});

test('sendFeeReminder: balance 0 gets 400 response and no email', async () => {
    replaceMethod(prisma.student, 'findUnique', (async () => ({
        id: 'student-1',
        name: 'Aarav Sharma',
        parentEmail: 'parent@test.com',
        createdAt: new Date('2026-01-01T00:00:00Z'),
        batch: {
            teacherId: 'teacher-1',
            feeAmount: 5000,
            feeInstallments: []
        },
        fees: [{ status: 'PAID', amount: 5000 }], // Fully paid
        feePayments: []
    }) as never) as typeof prisma.student.findUnique);

    let emailJobCreated = false;
    replaceMethod(prisma.emailJob, 'create', (async () => {
        emailJobCreated = true;
        return {} as never;
    }) as typeof prisma.emailJob.create);

    const req = {
        body: { studentId: 'student-1', amountDue: 0 },
        user: { id: 'teacher-1', instituteId: 'inst-1' }
    } as MockRequest;
    const res = createMockResponse();

    await sendFeeReminder(req as never, res as never);
    
    assert.equal(res.statusCode, 400);
    assert.deepEqual(res.body, { error: 'Student has no pending balance. Reminder skipped.' });
    assert.equal(emailJobCreated, false);
});

test('sendFeeReminder: negative (overpaid) balance gets 400 response, never negative reminder', async () => {
    replaceMethod(prisma.student, 'findUnique', (async () => ({
        id: 'student-1',
        name: 'Kushagra Bhargav',
        parentEmail: 'parent@test.com',
        createdAt: new Date('2026-01-01T00:00:00Z'),
        batch: {
            teacherId: 'teacher-1',
            feeAmount: 5000,
            feeInstallments: []
        },
        fees: [{ status: 'PAID', amount: 6000 }], // Overpaid by 1000
        feePayments: []
    }) as never) as typeof prisma.student.findUnique);

    let emailJobCreated = false;
    replaceMethod(prisma.emailJob, 'create', (async () => {
        emailJobCreated = true;
        return {} as never;
    }) as typeof prisma.emailJob.create);

    const req = {
        body: { studentId: 'student-1', amountDue: 0 },
        user: { id: 'teacher-1', instituteId: 'inst-1' }
    } as MockRequest;
    const res = createMockResponse();

    await sendFeeReminder(req as never, res as never);
    
    // Balance is -1000, clamped to 0 -> skips reminder
    assert.equal(res.statusCode, 400);
    assert.deepEqual(res.body, { error: 'Student has no pending balance. Reminder skipped.' });
    assert.equal(emailJobCreated, false);
});
