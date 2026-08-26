import test, { afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { prisma } from '../src/prisma';
import { sendTestResultsEmail } from '../src/controllers/testController';

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
    while (restores.length > 0) restores.pop()?.();
});

test('queues a WhatsApp test report when the student has no email address', async () => {
    replaceMethod(prisma.test, 'findUnique', (async () => ({
        id: 'test-1',
        name: 'Test 1',
        subject: 'Math',
        date: new Date('2026-08-26T00:00:00.000Z'),
        maxMarks: 10,
        className: '10',
        teacherId: 'teacher-1',
        instituteId: 'institute-1',
        batchId: 'batch-1',
        batches: [{ id: 'batch-1' }],
        institute: { name: 'Example Coaching' },
    }) as never) as typeof prisma.test.findUnique);

    replaceMethod(prisma.student, 'findMany', (async () => ([{
        id: 'student-1',
        name: 'Aarav',
        parentEmail: null,
        parentWhatsapp: '9876543210',
        marks: [{ score: 9 }],
    }] as never)) as typeof prisma.student.findMany);

    replaceMethod(prisma.student, 'findFirst', (async () => ({
        parentWhatsapp: '9876543210',
        additionalData: null,
        institute: { config: null },
    }) as never) as typeof prisma.student.findFirst);

    const createdJobs: Array<Record<string, unknown>> = [];
    replaceMethod(prisma.whatsappJob, 'create', (async ({ data }: { data: Record<string, unknown> }) => {
        createdJobs.push(data);
        return { id: 'whatsapp-job-1', ...data } as never;
    }) as typeof prisma.whatsappJob.create);

    let emailCreateManyCalls = 0;
    replaceMethod(prisma.emailJob, 'createMany', (async () => {
        emailCreateManyCalls += 1;
        return { count: 0 } as never;
    }) as typeof prisma.emailJob.createMany);

    const req = {
        params: { id: 'test-1' },
        user: { id: 'teacher-1', instituteId: 'institute-1' },
    };
    const res = createMockResponse();

    await sendTestResultsEmail(req as never, res as never);

    assert.equal(res.statusCode, 200);
    assert.equal(createdJobs.length, 1);
    assert.deepEqual(createdJobs[0], {
        recipient: '919876543210',
        templateId: 'test_marks_update',
        data: ['Aarav', 'Example Coaching', 'Test 1', '10', '9'],
        status: 'PENDING',
        instituteId: null,
        marketplaceEntityType: null,
        marketplaceEntityId: null,
    });
    assert.equal(emailCreateManyCalls, 0);
    assert.deepEqual(res.body, {
        success: true,
        message: 'Queued 0 emails and 1 WhatsApp message for sending.',
        emailQueued: 0,
        whatsappQueued: 1,
        whatsappFailed: 0,
    });
});
