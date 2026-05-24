import test, { afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { prisma } from '../src/prisma';
import { createCustomInvoice } from '../src/controllers/feeController';

type MockRequest = {
    body: Record<string, unknown>;
    user?: Record<string, unknown>;
};

type MockResponse = {
    statusCode: number;
    body: unknown;
    status: (code: number) => MockResponse;
    json: (payload: unknown) => MockResponse;
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

test('createCustomInvoice copies an existing installment for one student and can mark it paid', async () => {
    replaceMethod(prisma.student, 'findUnique', (async () => ({
        id: 'student-1',
        name: 'Aarav Sharma',
        batchId: 'batch-1',
        parentWhatsapp: '9876543210',
        instituteId: 'inst-1',
        batch: {
            id: 'batch-1',
            teacherId: 'teacher-1',
            instituteId: 'inst-1',
            name: 'Class 10',
            institute: {
                name: 'MathLogs Institute',
                slug: 'mathlogs',
            },
        },
    }) as never) as typeof prisma.student.findUnique);
    replaceMethod(prisma.feeInstallment, 'findFirst', (async ({ where }: { where: Record<string, unknown> }) => {
        if (where.id === 'installment-1') {
            return {
                id: 'installment-1',
                name: 'April Fee',
                amount: 500,
                batchId: 'batch-1',
                studentId: null,
            } as never;
        }

        return null as never;
    }) as typeof prisma.feeInstallment.findFirst);

    let createdInstallment: Record<string, unknown> | null = null;
    replaceMethod(prisma.feeInstallment, 'create', (async ({ data }: { data: Record<string, unknown> }) => {
        createdInstallment = data;
        return {
            id: 'custom-installment-1',
            ...data,
            createdAt: new Date('2026-04-04T00:00:00.000Z'),
        } as never;
    }) as typeof prisma.feeInstallment.create);

    let createdPayment: Record<string, unknown> | null = null;
    replaceMethod(prisma.feePayment, 'create', (async ({ data }: { data: Record<string, unknown> }) => {
        createdPayment = data;
        return {
            id: 'payment-1',
            ...data,
        } as never;
    }) as typeof prisma.feePayment.create);
    replaceMethod(prisma.systemLog, 'create', (async () => ({ id: 'system-log-1' }) as never) as typeof prisma.systemLog.create);
    let whatsappJob: Record<string, unknown> | null = null;
    replaceMethod(prisma.whatsappJob, 'create', (async ({ data }: { data: Record<string, unknown> }) => {
        whatsappJob = data;
        return { id: 'wa-1', ...data } as never;
    }) as typeof prisma.whatsappJob.create);

    const req = {
        body: {
            studentId: 'student-1',
            installmentId: 'installment-1',
            markAsPaid: true,
        },
        user: {
            id: 'teacher-1',
            instituteId: 'inst-1',
        },
    } as MockRequest;
    const res = createMockResponse();

    await createCustomInvoice(req as never, res as never);

    assert.equal(res.statusCode, 201);
    assert.deepEqual(createdInstallment, {
        batchId: 'batch-1',
        name: 'April Fee',
        amount: 500,
        studentId: 'student-1',
    });
    assert.equal(createdPayment?.studentId, 'student-1');
    assert.equal(createdPayment?.installmentId, 'custom-installment-1');
    assert.equal(createdPayment?.amountPaid, 500);
    assert.equal(whatsappJob?.templateId, 'payment_receipt_1');
});

test('createCustomInvoice creates a reusable custom template assignment and queues a due reminder', async () => {
    replaceMethod(prisma.student, 'findUnique', (async () => ({
        id: 'student-2',
        name: 'Meera Singh',
        batchId: 'batch-1',
        parentWhatsapp: '9876500000',
        instituteId: 'inst-1',
        batch: {
            id: 'batch-1',
            teacherId: 'teacher-1',
            instituteId: 'inst-1',
            name: 'Class 10',
            institute: {
                name: 'MathLogs Institute',
                slug: 'mathlogs',
            },
        },
    }) as never) as typeof prisma.student.findUnique);
    replaceMethod(prisma.feeInstallment, 'findFirst', (async () => null as never) as typeof prisma.feeInstallment.findFirst);

    let createdInstallment: Record<string, unknown> | null = null;
    replaceMethod(prisma.feeInstallment, 'create', (async ({ data }: { data: Record<string, unknown> }) => {
        createdInstallment = data;
        return {
            id: 'custom-installment-2',
            ...data,
            createdAt: new Date('2026-04-04T00:00:00.000Z'),
        } as never;
    }) as typeof prisma.feeInstallment.create);

    let paymentCreateCalls = 0;
    replaceMethod(prisma.feePayment, 'create', (async () => {
        paymentCreateCalls += 1;
        return { id: 'payment-2' } as never;
    }) as typeof prisma.feePayment.create);

    let whatsappJob: Record<string, unknown> | null = null;
    replaceMethod(prisma.whatsappJob, 'create', (async ({ data }: { data: Record<string, unknown> }) => {
        whatsappJob = data;
        return { id: 'wa-2', ...data } as never;
    }) as typeof prisma.whatsappJob.create);

    const req = {
        body: {
            studentId: 'student-2',
            name: 'Study Material',
            amount: 750,
            markAsPaid: false,
        },
        user: {
            id: 'teacher-1',
            instituteId: 'inst-1',
        },
    } as MockRequest;
    const res = createMockResponse();

    await createCustomInvoice(req as never, res as never);

    assert.equal(res.statusCode, 201);
    assert.deepEqual(createdInstallment, {
        batchId: 'batch-1',
        name: 'Study Material',
        amount: 750,
        studentId: 'student-2',
    });
    assert.equal(paymentCreateCalls, 0);
    assert.equal(whatsappJob?.templateId, 'fee_breakup_alert_1');
});

test('createCustomInvoice rejects duplicate template assignment for the same student', async () => {
    replaceMethod(prisma.student, 'findUnique', (async () => ({
        id: 'student-1',
        name: 'Aarav Sharma',
        batchId: 'batch-1',
        parentWhatsapp: '9876543210',
        instituteId: 'inst-1',
        batch: {
            id: 'batch-1',
            teacherId: 'teacher-1',
            instituteId: 'inst-1',
            name: 'Class 10',
            institute: {
                name: 'MathLogs Institute',
                slug: 'mathlogs',
            },
        },
    }) as never) as typeof prisma.student.findUnique);
    replaceMethod(prisma.feeInstallment, 'findFirst', (async ({ where }: { where: Record<string, unknown> }) => {
        if (where.id === 'custom-template-1') {
            return {
                id: 'custom-template-1',
                name: 'Study Material',
                amount: 750,
                batchId: 'batch-1',
                studentId: 'student-2',
            } as never;
        }

        return {
            id: 'already-assigned',
            name: 'Study Material',
            amount: 750,
            batchId: 'batch-1',
            studentId: 'student-1',
        } as never;
    }) as typeof prisma.feeInstallment.findFirst);

    let createCalls = 0;
    replaceMethod(prisma.feeInstallment, 'create', (async () => {
        createCalls += 1;
        return { id: 'should-not-create' } as never;
    }) as typeof prisma.feeInstallment.create);

    const req = {
        body: {
            studentId: 'student-1',
            installmentId: 'custom-template-1',
            markAsPaid: false,
        },
        user: {
            id: 'teacher-1',
            instituteId: 'inst-1',
        },
    } as MockRequest;
    const res = createMockResponse();

    await createCustomInvoice(req as never, res as never);

    assert.equal(res.statusCode, 409);
    assert.deepEqual(res.body, { error: 'This invoice is already assigned to the student' });
    assert.equal(createCalls, 0);
});
