import test, { after, before, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import jwt from 'jsonwebtoken';
import { prisma } from '../src/prisma';
import { getJwtSecret } from '../src/utils/env';

let server: Server;
let baseUrl: string;

before(async () => {
    const { app } = await import('../src/index');

    await new Promise<void>((resolve) => {
        server = app.listen(0, () => resolve());
    });

    const address = server.address() as AddressInfo;
    baseUrl = `http://127.0.0.1:${address.port}`;
});

after(async () => {
    await prisma.$disconnect();
    await new Promise<void>((resolve, reject) => {
        server.close((error) => {
            if (error) reject(error);
            else resolve();
        });
    });
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

async function patchJson(path: string, body: unknown, headers: Record<string, string> = {}) {
    return fetch(`${baseUrl}${path}`, {
        method: 'PATCH',
        headers: {
            'Content-Type': 'application/json',
            ...headers,
        },
        body: JSON.stringify(body),
    });
}

async function getJson(path: string, headers: Record<string, string> = {}) {
    return fetch(`${baseUrl}${path}`, {
        method: 'GET',
        headers: {
            'Content-Type': 'application/json',
            ...headers,
        },
    });
}

test('Quiz System: Complete Flow (Guest & Regular)', async (t) => {
    const instituteId = `inst-quiz-${Date.now()}`;
    const student1Id = `stu1-${Date.now()}`;
    const student2Id = `stu2-${Date.now()}`; // Guest
    const batchId = `batch-${Date.now()}`;
    const quizId = `quiz-${Date.now()}`;
    const publicQuizId = `pub-quiz-${Date.now()}`;
    const question1Id = `q1-${Date.now()}`;
    const question2Id = `q2-${Date.now()}`;

    // 1. Setup Test Data
    await prisma.institute.create({
        data: {
            id: instituteId,
            name: 'Test Quiz Inst',
            slug: `test-quiz-${Date.now()}`,
            isQuizOnly: true
        }
    });

    await prisma.batch.create({
        data: {
            id: batchId,
            name: 'Test Batch',
            instituteId,
            feeAmount: 100
        }
    });

    await prisma.student.createMany({
        data: [
            { id: student1Id, instituteId, batchId, name: 'Reg Student', parentName: 'Reg Parent', parentWhatsapp: '9999999991' },
            { id: student2Id, instituteId, name: 'Guest Student', parentName: 'Guest Parent', parentWhatsapp: '9999999992' }
        ]
    });

    await prisma.onlineQuiz.create({
        data: {
            id: quizId,
            instituteId,
            batchId,
            title: 'Assigned Quiz',
            timeLimitMins: 30,
            totalMarks: 10,
            isPublic: false,
            questions: {
                create: [
                    { id: question1Id, questionText: 'Q1', options: ['A', 'B'], correctOption: 'A', marks: 10, orderIndex: 0 }
                ]
            }
        }
    });

    await prisma.onlineQuiz.create({
        data: {
            id: publicQuizId,
            instituteId,
            title: 'Public Quiz',
            isPublic: true,
            timeLimitMins: 30,
            totalMarks: 5,
            questions: {
                create: [
                    { id: question2Id, questionText: 'Q2', options: ['A', 'B'], correctOption: 'B', marks: 5, orderIndex: 0 }
                ]
            }
        }
    });

    const jwtSecret = getJwtSecret();
    const token1 = jwt.sign({ studentId: student1Id }, jwtSecret);
    const token2 = jwt.sign({ studentId: student2Id }, jwtSecret);
    const auth1 = { Authorization: `Bearer ${token1}` };
    const auth2 = { Authorization: `Bearer ${token2}` };

    await t.test('Regular student can access assigned quiz', async () => {
        const res = await postJson(`/api/student-portal/quizzes/${quizId}/start`, {}, auth1);
        assert.equal(res.status, 200);
        const data = await res.json() as any;
        assert.equal(data.quiz.id, quizId);
    });

    await t.test('Guest student cannot access private assigned quiz', async () => {
        const res = await postJson(`/api/student-portal/quizzes/${quizId}/start`, {}, auth2);
        assert.equal(res.status, 404);
    });

    await t.test('Guest student can access public quiz', async () => {
        const res = await postJson(`/api/student-portal/quizzes/${publicQuizId}/start`, {}, auth2);
        assert.equal(res.status, 200);
        const data = await res.json() as any;
        assert.equal(data.quiz.id, publicQuizId);
        assert.ok(data.submission.id);
    });

    await t.test('Guest student autosave and submission', async () => {
        // Autosave
        const autosaveRes = await patchJson(`/api/student-portal/quizzes/${publicQuizId}/autosave`, {
            answers: { [question2Id]: 'B' }
        }, auth2);
        if (autosaveRes.status !== 200) {
            console.log('Autosave failed:', autosaveRes.status, await autosaveRes.json());
        }
        assert.equal(autosaveRes.status, 200);

        // Submit
        const submitRes = await postJson(`/api/student-portal/quizzes/${publicQuizId}/submit`, {
            answers: { [question2Id]: 'B' }
        }, auth2);
        assert.equal(submitRes.status, 200);
        const data = await submitRes.json() as any;
        assert.equal(data.score, 5);
        assert.equal(data.totalMarks, 5);
    });

    await t.test('Double submission is rejected', async () => {
        const submitRes = await postJson(`/api/student-portal/quizzes/${publicQuizId}/submit`, {
            answers: { [question2Id]: 'B' }
        }, auth2);
        assert.equal(submitRes.status, 400);
    });

    await t.test('Guest student quiz list includes submitted public quiz', async () => {
        const listRes = await getJson(`/api/student-portal/quizzes`, auth2);
        assert.equal(listRes.status, 200);
        const list = await listRes.json() as any[];
        assert.ok(list.length > 0);
        const submittedQuiz = list.find(q => q.id === publicQuizId);
        assert.ok(submittedQuiz);
        assert.equal(submittedQuiz.availabilityStatus, 'SUBMITTED');
    });

    // Cleanup
    await prisma.institute.delete({ where: { id: instituteId } });
});
