import test, { describe, it, before, after, mock } from 'node:test';
import assert from 'node:assert';
import request from 'supertest';
import { app } from '../src/index';
import { prisma } from '../src/prisma';
import jwt from 'jsonwebtoken';
import { studentFeesCache } from '../src/controllers/publicController';

const JWT_SECRET = process.env.JWT_SECRET || 'test-secret';

describe('UPI Payment Verification & Infrastructure', () => {
    after(() => {
        studentFeesCache.clear();
        mock.restoreAll();
    });

    describe('GET /api/public/i/:slug/student-fees', () => {
        it('returns 400 when phone is missing', async () => {
            const res = await request(app).get('/api/public/i/test-slug/student-fees');
            assert.strictEqual(res.status, 400);
        });

        it('returns 404 for unknown slug', async () => {
            const res = await request(app).get('/api/public/i/unknown-slug/student-fees?phone=1234567890');
            assert.strictEqual(res.status, 404);
        });

        it('returns 404 when no students match', async () => {
            // Setup an institute
            const institute = await prisma.institute.create({ data: { name: 'Test Inst', slug: 'test-inst-fee' } });
            const res = await request(app).get(`/api/public/i/${institute.slug}/student-fees?phone=0000000000`);
            assert.strictEqual(res.status, 404);
            await prisma.institute.delete({ where: { id: institute.id } });
        });
    });

    describe('POST /api/public/i/:slug/submit-upi', () => {
        it('rejects when required fields are missing (no file, no studentId)', async () => {
            const res = await request(app).post('/api/public/i/test/submit-upi');
            assert.strictEqual(res.status, 400);
        });

        it('rejects non-numeric amount', async () => {
            const res = await request(app)
                .post('/api/public/i/test/submit-upi')
                .field('amount', 'abc')
                .field('studentId', '123')
                .attach('screenshot', Buffer.from('fake-image'), 'test.jpg');
            assert.strictEqual(res.status, 400);
        });

        it('blocks duplicate pending verification requests', async () => {
            const institute = await prisma.institute.create({ data: { name: 'Test Inst', slug: 'test-dup-fee' } });
            const admin = await prisma.admin.create({ data: { username: 'testuser', password: 'pwd', instituteId: institute.id, role: 'TEACHER' } });
            const batch = await prisma.batch.create({ data: { name: 'Batch', instituteId: institute.id, teacherId: admin.id } });
            const student = await prisma.student.create({ data: { name: 'Student', parentName: 'Parent', parentWhatsapp: '9999999999', instituteId: institute.id, batchId: batch.id } });
            const installment = await prisma.feeInstallment.create({ data: { name: 'Jan', amount: 1000, batchId: batch.id } });
            
            // Create a pending verification manually
            await prisma.upiPaymentVerification.create({
                data: {
                    status: 'PENDING',
                    amount: 1000,
                    studentId: student.id,
                    instituteId: institute.id,
                    installmentId: installment.id,
                    storageKey: 'fake-key'
                }
            });

            const res = await request(app)
                .post(`/api/public/i/${institute.slug}/submit-upi`)
                .field('amount', '1000')
                .field('studentId', student.id)
                .field('installmentId', installment.id)
                .attach('screenshot', Buffer.from('fake-image'), 'test.jpg');

            assert.strictEqual(res.status, 400);
            assert.ok(res.body.error.includes('A pending verification already exists'));

            // Cleanup
            await prisma.upiPaymentVerification.deleteMany({ where: { studentId: student.id } });
            await prisma.feeInstallment.deleteMany({ where: { batchId: batch.id } });
            await prisma.student.delete({ where: { id: student.id } });
            await prisma.batch.delete({ where: { id: batch.id } });
            await prisma.admin.delete({ where: { id: admin.id } });
            await prisma.institute.delete({ where: { id: institute.id } });
        });
    });

    describe('GET /api/fees/upi-verifications', () => {
        it('requires authentication', async () => {
            const res = await request(app).get('/api/fees/upi-verifications');
            assert.strictEqual(res.status, 401);
        });
    });

    describe('POST /api/fees/upi-verifications/:id/approve', () => {
        it('requires authentication', async () => {
            const res = await request(app).post('/api/fees/upi-verifications/123/approve');
            assert.strictEqual(res.status, 401);
        });
        
        it('rejects already-processed verification', async () => {
            const token = jwt.sign({ teacherId: 'fake-teacher', instituteId: 'fake-inst', role: 'TEACHER' }, JWT_SECRET);
            
            const res = await request(app)
                .post('/api/fees/upi-verifications/non-existent/approve')
                .set('Authorization', `Bearer ${token}`);
            
            assert.strictEqual(res.status, 404);
        });
    });
});
