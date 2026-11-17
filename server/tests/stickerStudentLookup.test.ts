import test from 'node:test';
import assert from 'node:assert/strict';
import { prisma } from '../src/prisma';
import { getStudentByHumanId } from '../src/controllers/testController';

const enrollment = (id: string, className: string, teacherId: string | null = 'teacher') => ({
    batchId: id, batch: { id, className, teacherId, name: id },
});

test('sticker lookup selects an eligible enrollment and preserves institute and teacher boundaries', async t => {
    const studentFind = prisma.student.findFirst;
    const testFind = prisma.test.findFirst;
    let student: any;
    let selectedTest: any;
    let studentQuery: any;
    let testQuery: any;
    (prisma.student.findFirst as any) = async (query: any) => { studentQuery = query; return student; };
    (prisma.test.findFirst as any) = async (query: any) => { testQuery = query; return selectedTest; };
    const lookup = async (testId: string | undefined = 'test') => {
        let status = 200, body: any;
        await getStudentByHumanId({ params: { humanId: ' DEMO-SCAN-001 ' }, query: { testId },
            user: { id: 'teacher', instituteId: 'institute' } } as any,
        { status(value: number) { status = value; return this; }, json(value: any) { body = value; } } as any);
        return { status, body };
    };
    try {
        await t.test('uses the matching batch even when it is the second enrollment', async () => {
            student = { enrollments: [enrollment('old', '9'), enrollment('target', '10')], marks: [] };
            selectedTest = { batchId: 'target', className: '10', batches: [{ id: 'target' }] };
            const result = await lookup();
            assert.equal(result.status, 200);
            assert.equal(result.body.batch.id, 'target');
            assert.equal(result.body.testEligible, true);
            assert.deepEqual(studentQuery.where, { humanId: 'DEMO-SCAN-001', instituteId: 'institute' });
            assert.deepEqual(studentQuery.include.enrollments.where, { status: 'ACTIVE' });
            assert.deepEqual(studentQuery.include.marks, { where: { testId: 'test' } });
            assert.deepEqual(testQuery.where, { id: 'test', instituteId: 'institute', OR: [{ teacherId: 'teacher' }, { teacherId: null }] });
        });
        await t.test('accepts a linked batch from a different class in a shared test', async () => {
            student = { enrollments: [enrollment('shared', '9')] };
            selectedTest = { batchId: 'target', className: '10', batches: [{ id: 'target' }, { id: 'shared' }] };
            assert.equal((await lookup()).body.batch.id, 'shared');
        });
        await t.test('rejects another batch even when its class matches', async () => {
            student = { enrollments: [enrollment('unlinked', '10')] };
            assert.equal((await lookup()).status, 409);
        });
        await t.test('does not grant access via another teachers matching enrollment', async () => {
            student = { enrollments: [enrollment('old', '9'), enrollment('target', '10', 'other-teacher')] };
            assert.equal((await lookup()).status, 409);
            student = { enrollments: [enrollment('target', '10', 'other-teacher')] };
            assert.equal((await lookup()).status, 403);
        });
        await t.test('uses class matching for older tests without linked batches', async () => {
            student = { enrollments: [enrollment('old', '9'), enrollment('target', '10')] };
            selectedTest = { batchId: null, className: '10', batches: [] };
            assert.equal((await lookup()).body.batch.id, 'target');
        });
        await t.test('rejects a missing or inaccessible test', async () => {
            selectedTest = null;
            assert.equal((await lookup()).status, 404);
        });
        await t.test('keeps lookup without a test limited to accessible enrollments', async () => {
            student = { enrollments: [enrollment('hidden', '9', 'other'), enrollment('target', '10')] };
            let body: any;
            await getStudentByHumanId({ params: { humanId: 'DEMO-SCAN-001' }, query: {}, user: { id: 'teacher', instituteId: 'institute' } } as any,
                { status() { return this; }, json(value: any) { body = value; } } as any);
            assert.equal(body.batch.id, 'target');
            assert.equal(body.enrollments.length, 1);
            assert.equal(body.testEligible, false);
        });
    } finally {
        prisma.student.findFirst = studentFind;
        prisma.test.findFirst = testFind;
    }
});
