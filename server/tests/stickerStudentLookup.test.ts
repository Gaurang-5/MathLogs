import test from 'node:test';
import assert from 'node:assert/strict';
import { prisma } from '../src/prisma';
import { getStudentByHumanId } from '../src/controllers/testController';

test('sticker lookup respects test batch links and institute/teacher boundaries', async t => {
    const studentFind = prisma.student.findFirst;
    const testFind = prisma.test.findFirst;
    let student: any;
    let selectedTest: any;
    let studentQuery: any;
    let testQuery: any;
    (prisma.student.findFirst as any) = async (query: any) => { studentQuery = query; return student; };
    (prisma.test.findFirst as any) = async (query: any) => { testQuery = query; return selectedTest; };
    const lookup = async (query = { testId: 'test' } as Record<string, string>) => {
        let status = 200, body: any;
        await getStudentByHumanId({ params: { humanId: ' DEMO-SCAN-001 ' }, query,
            user: { id: 'teacher', instituteId: 'institute' } } as any,
        { status(value: number) { status = value; return this; }, json(value: any) { body = value; } } as any);
        return { status, body };
    };
    try {
        await t.test('accepts a linked batch from a different class in a shared test', async () => {
            student = { id: 'student', batchId: 'shared', batch: { className: '9', teacherId: 'teacher' }, marks: [] };
            selectedTest = { batchId: 'target', className: '10', batches: [{ id: 'target' }, { id: 'shared' }] };
            const result = await lookup();
            assert.equal(result.status, 200);
            assert.equal(result.body.id, 'student');
            assert.equal(result.body.testEligible, true);
            assert.deepEqual(studentQuery.where, { humanId: 'DEMO-SCAN-001', instituteId: 'institute' });
            assert.deepEqual(studentQuery.include.marks, { where: { testId: 'test' } });
            assert.deepEqual(testQuery.where, { id: 'test', instituteId: 'institute', OR: [{ teacherId: 'teacher' }, { teacherId: null }] });
        });
        await t.test('rejects another batch even when its class matches', async () => {
            student = { batchId: 'unlinked', batch: { className: '10', teacherId: 'teacher' } };
            assert.equal((await lookup()).status, 409);
        });
        await t.test('does not grant access to another teachers student', async () => {
            student = { batchId: 'target', batch: { className: '10', teacherId: 'other-teacher' } };
            assert.equal((await lookup()).status, 403);
        });
        await t.test('uses class matching for older tests without linked batches', async () => {
            student = { batchId: 'target', batch: { className: '10', teacherId: 'teacher' } };
            selectedTest = { batchId: null, className: '10', batches: [] };
            assert.equal((await lookup()).status, 200);
        });
        await t.test('rejects a missing or inaccessible test', async () => {
            selectedTest = null;
            assert.equal((await lookup()).status, 404);
        });
        await t.test('preserves lookup without a selected test', async () => {
            const result = await lookup({});
            assert.equal(result.status, 200);
            assert.equal(result.body.testEligible, false);
        });
    } finally {
        prisma.student.findFirst = studentFind;
        prisma.test.findFirst = testFind;
    }
});
