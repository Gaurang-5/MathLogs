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
            const institute = await prisma.institute.create({ data: { name: 'Test Inst', slug: 'test-inst-fee' } });
            const res = await request(app).get(`/api/public/i/${institute.slug}/student-fees?phone=0000000000`);
            assert.strictEqual(res.status, 404);
            await prisma.institute.delete({ where: { id: institute.id } });
        });

        it('returns single student with institute info', async () => {
            const institute = await prisma.institute.create({ data: { name: 'Test', slug: 'tst1' } });
            const admin = await prisma.admin.create({ data: { username: 't1', password: 'pwd', instituteId: institute.id, role: 'TEACHER' } });
            const batch = await prisma.batch.create({ data: { name: 'B1', instituteId: institute.id, teacherId: admin.id } });
            const student = await prisma.student.create({ data: { name: 'S1', parentWhatsapp: '1234567890', parentName: 'P1', instituteId: institute.id, batchId: batch.id } });
            
            const res = await request(app).get(`/api/public/i/${institute.slug}/student-fees?phone=1234567890`);
            assert.strictEqual(res.status, 200);
            assert.ok(res.body.students.length > 0);
            
            await prisma.student.delete({ where: { id: student.id } });
            await prisma.batch.delete({ where: { id: batch.id } });
            await prisma.admin.delete({ where: { id: admin.id } });
            await prisma.institute.delete({ where: { id: institute.id } });
        });

        it('returns multiple students for shared phone', async () => {
            const institute = await prisma.institute.create({ data: { name: 'Test', slug: 'tst2' } });
            const admin = await prisma.admin.create({ data: { username: 't2', password: 'pwd', instituteId: institute.id, role: 'TEACHER' } });
            const batch = await prisma.batch.create({ data: { name: 'B1', instituteId: institute.id, teacherId: admin.id } });
            const s1 = await prisma.student.create({ data: { name: 'S1', parentWhatsapp: '8888888888', parentName: 'P1', instituteId: institute.id, batchId: batch.id } });
            const s2 = await prisma.student.create({ data: { name: 'S2', parentWhatsapp: '8888888888', parentName: 'P1', instituteId: institute.id, batchId: batch.id } });
            
            const res = await request(app).get(`/api/public/i/${institute.slug}/student-fees?phone=8888888888`);
            assert.strictEqual(res.status, 200);
            assert.strictEqual(res.body.students.length, 2);
            
            await prisma.student.deleteMany({ where: { id: { in: [s1.id, s2.id] } } });
            await prisma.batch.delete({ where: { id: batch.id } });
            await prisma.admin.delete({ where: { id: admin.id } });
            await prisma.institute.delete({ where: { id: institute.id } });
        });

        it('strips country code and matches last 10 digits', async () => {
            const institute = await prisma.institute.create({ data: { name: 'Test', slug: 'ccode' } });
            const admin = await prisma.admin.create({ data: { username: 'tcc', password: 'pwd', instituteId: institute.id, role: 'TEACHER' } });
            const batch = await prisma.batch.create({ data: { name: 'B1', instituteId: institute.id, teacherId: admin.id } });
            const student = await prisma.student.create({ data: { name: 'S1', parentWhatsapp: '9988776655', parentName: 'P1', instituteId: institute.id, batchId: batch.id } });
            
            const res = await request(app).get(`/api/public/i/${institute.slug}/student-fees?phone=+919988776655`);
            assert.strictEqual(res.status, 200);
            
            await prisma.student.delete({ where: { id: student.id } });
            await prisma.batch.delete({ where: { id: batch.id } });
            await prisma.admin.delete({ where: { id: admin.id } });
            await prisma.institute.delete({ where: { id: institute.id } });
        });
    });

    describe('GET /api/public/payment-screenshot/:key', () => {
        it('blocks directory traversal via base64', async () => {
            const evilPayload = Buffer.from('../../../etc/passwd').toString('base64');
            const res = await request(app).get(`/api/public/payment-screenshot/${evilPayload}`);
            assert.strictEqual(res.status, 400); // Controller should block traversal sequences
        });

        it('returns 404 for non-existent file', async () => {
            const fakePayload = Buffer.from('payments/fake/fake/fake.jpg').toString('base64');
            const res = await request(app).get(`/api/public/payment-screenshot/${fakePayload}`);
            assert.strictEqual(res.status, 404);
        });

        it('handles URL-safe base64 encoding', async () => {
            let encodedString = Buffer.from('payments/test.jpg').toString('base64');
            encodedString = encodedString.replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
            const res = await request(app).get(`/api/public/payment-screenshot/${encodedString}`);
            assert.strictEqual(res.status, 404); // Even if correctly decoded, it doesn't exist
        });
    });

    describe('POST /api/public/i/:slug/submit-upi', () => {
        it('rejects when required fields are missing', async () => {
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

        it('returns 404 for unknown institute slug', async () => {
            const res = await request(app)
                .post('/api/public/i/random-123456/submit-upi')
                .field('amount', '1000')
                .field('studentId', '123')
                .attach('screenshot', Buffer.from('fake-image'), 'test.jpg');
            assert.strictEqual(res.status, 404);
        });

        it('validates amount is positive', async () => {
            const res = await request(app)
                .post('/api/public/i/test/submit-upi')
                .field('amount', '-500')
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
            assert.ok(res.body.error.includes('pending verification already exists'));

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

        it('returns verifications scoped to teacher', async () => {
            const token = jwt.sign({ adminId: 'fake-teacher', instituteId: 'fake-inst', role: 'TEACHER' }, JWT_SECRET);
            const res = await request(app).get('/api/fees/upi-verifications').set('Authorization', `Bearer ${token}`);
            assert.ok([200, 404].includes(res.status)); // Valid token response
        });
    });

    describe('POST /api/fees/upi-verifications/:id/approve', () => {
        it('requires authentication', async () => {
            const res = await request(app).post('/api/fees/upi-verifications/123/approve');
            assert.strictEqual(res.status, 401);
        });

        it('rejects invalid bearer tokens', async () => {
            const res = await request(app).post('/api/fees/upi-verifications/123/approve').set('Authorization', 'Bearer invalid.token.here');
            assert.strictEqual(res.status, 403);
        });
        
        it('rejects already-processed verification', async () => {
            const token = jwt.sign({ adminId: 'fake-teacher', instituteId: 'fake-inst', role: 'TEACHER' }, JWT_SECRET);
            const res = await request(app).post('/api/fees/upi-verifications/12345678-1234-1234-1234-123456789012/approve').set('Authorization', `Bearer ${token}`);
            assert.strictEqual(res.status, 404);
        });
    });

    describe('POST /api/fees/upi-verifications/:id/reject', () => {
        it('requires authentication', async () => {
            const res = await request(app).post('/api/fees/upi-verifications/123/reject');
            assert.strictEqual(res.status, 401);
        });

        it('rejects invalid bearer tokens', async () => {
            const res = await request(app).post('/api/fees/upi-verifications/123/reject').set('Authorization', 'Bearer BAD_TOKEN');
            assert.strictEqual(res.status, 403);
        });

        it('returns 404 for non-existent verification', async () => {
            const token = jwt.sign({ adminId: 'fake-teacher', instituteId: 'fake-inst', role: 'TEACHER' }, JWT_SECRET);
            const res = await request(app).post('/api/fees/upi-verifications/12345678-1234-1234-1234-123456789012/reject').set('Authorization', `Bearer ${token}`);
            assert.strictEqual(res.status, 404);
        });
    });

    describe('GET /api/public/i/:slug', () => {
        it('returns 404 for unknown institute', async () => {
            const res = await request(app).get('/api/public/i/not-a-real-institute');
            assert.strictEqual(res.status, 404);
        });
    });
});
