import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import request from 'supertest';
import { PrismaClient } from '@prisma/client';

// Run only against the disposable database prepared with the enrollment-fee migration.
const url = process.env.FEE_TEST_DATABASE_URL;
test('phone invitation preserves fees through registration, review, and balance calculation', { skip: !url }, async () => {
  assert.match(url!, /^postgresql:\/\/[^/]*127\.0\.0\.1:55439\/mathlogs_fee_test(?:\?|$)/);
  process.env.DATABASE_URL = url!;
  const db = new PrismaClient({ datasources: { db: { url } } });
  (global as any).prisma = db;
  const { inviteStudentToBatch, createFeeInstallment, getBatchPublicStatus, getBatchDetails } = await import('../src/controllers/batchController');
  const { registerStudent, getStudentProfile } = await import('../src/controllers/studentController');
  const { endEnrollmentController } = await import('../src/controllers/enrollmentController');
  const { resolveIdentityReview } = await import('../src/controllers/identityReviewController');
  const { getFinancialGrowthStats, getInstallmentGrowthStats } = await import('../src/controllers/dashboardController');
  const { getFeeSummary, recordPayment, getStudentPaymentOptions, approveUpiVerification } = await import('../src/controllers/feeController');
  const { validateRequest } = await import('../src/middleware/validation');
  const { inviteStudentEnrollmentSchema, registerStudentSchema } = await import('../src/schemas');
  const institute = await db.institute.create({ data: { name: 'Fee audit fixture', plan: 'BASIC' as any } });
  const admin = await db.admin.create({ data: { username: `fee-test-${Date.now()}`, password: 'test-only', instituteId: institute.id } });
  const batch = await db.batch.create({ data: { name: 'Fee audit', instituteId: institute.id, teacherId: admin.id, feeAmount: 5000 } });
  const old = await db.feeInstallment.create({ data: { batchId: batch.id, name: 'Selected', amount: 1200 } });
  const excluded = await db.feeInstallment.create({ data: { batchId: batch.id, name: 'Not selected', amount: 900 } });
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => { (req as any).user = { id: admin.id, instituteId: institute.id, role: 'INSTITUTE_ADMIN' }; next(); });
  app.post('/batches/:id/invite', validateRequest(inviteStudentEnrollmentSchema), inviteStudentToBatch as any);
  app.get('/students/:id/profile', getStudentProfile as any);
  app.delete('/batches/:batchId/enrollments/:enrollmentId', endEnrollmentController as any);
  app.post('/register', validateRequest(registerStudentSchema), registerStudent as any);
  app.get('/public/batch/:id', getBatchPublicStatus as any);
  app.get('/batches/:id', getBatchDetails as any);
  app.post('/review/:id', resolveIdentityReview as any);
  app.get('/fees', getFeeSummary as any);
  app.get('/growth', getFinancialGrowthStats as any);
  app.get('/installment-growth', getInstallmentGrowthStats as any);
  app.post('/payments', recordPayment as any);
  app.get('/payment-options/:id',getStudentPaymentOptions as any);
  app.post('/upi/:id',approveUpiVerification as any);
  app.post('/batches/:id/installments', createFeeInstallment as any);
  const fee = { mode: 'CURRENT_DUE_BASED', decision: 'SELECTED', installmentIds: [old.id], amounts: { [old.id]: 1200 }, applyFutureInstallments: false };
  const invite = async (phone: string, choice: any, targetBatch = batch.id) => {
    const sent = await request(app).post(`/batches/${targetBatch}/invite`).send({ whatsappNumber: phone, fee: choice });
    assert.equal(sent.status, 200, JSON.stringify(sent.body));
    const short = await db.shortUrl.findFirstOrThrow({ orderBy: { createdAt: 'desc' } });
    return new URL(short.longUrl).searchParams.get('token');
  };
  const details = (token: string | null, phone: string, name = 'New student', batchId = batch.id) => ({ token, batchId, name, parentName: 'Parent', parentWhatsapp: phone });
  try {
    const missing = await request(app).post(`/batches/${batch.id}/invite`).send({ whatsappNumber: '9000000000', fee: { mode: 'CURRENT_DUE_BASED', installmentIds: [] } });
    assert.equal(missing.status, 400);
    const stale = await request(app).post(`/batches/${batch.id}/invite`).send({ whatsappNumber: '9000000000', fee: { ...fee, amounts: { [old.id]: 1 } } });
    assert.equal(stale.status, 409);
    const token = await invite('9000000001', fee);
    await assert.rejects(db.feeInstallment.update({ where: { id: old.id }, data: { amount: 1300 } }), /INVITED_INSTALLMENT_LOCKED/);
    await assert.rejects(db.feeInstallment.delete({ where: { id: old.id } }), /INVITED_INSTALLMENT_LOCKED/);
    const registered = await request(app).post('/register').send(details(token, '9000000001'));
    assert.equal(registered.status, 200, JSON.stringify(registered.body));
    const student = await db.student.findUniqueOrThrow({ where: { id: registered.body.id }, include: { enrollments: true, feeAssignments: true, balance: true } });
    assert.equal(student.enrollments[0].feeDecision, 'SELECTED');
    assert.equal(student.enrollments[0].applyFutureInstallments, false);
    assert.deepEqual(student.feeAssignments.map(a => a.installmentId), [old.id]);
    assert.equal(student.balance?.balance, 1200);
    const repeat = await request(app).post('/register').send(details(token, '9000000001'));
    assert.equal(repeat.status, 403);
    const payment = await request(app).post('/payments').send({ studentId: student.id, amount: 200, allocations:[{installmentId:old.id,amount:200}],idempotencyKey:`payment-${student.id}` });
    assert.equal(payment.status, 200, JSON.stringify(payment.body));
    assert.equal((await db.feePayment.findFirstOrThrow({ where: { studentId: student.id } })).installmentId, old.id);
    assert.equal((await db.studentBalance.findUniqueOrThrow({ where: { studentId: student.id } })).balance, 1000);
    const replay = await request(app).post('/payments').send({studentId:student.id,amount:200,allocations:[{installmentId:old.id,amount:200}],idempotencyKey:`payment-${student.id}`});
    assert.equal(replay.status,200);assert.equal(replay.body.replayed,true);
    assert.equal(await db.feePayment.count({where:{studentId:student.id}}),1);
    const absent = await request(app).post('/payments').send({studentId:student.id,amount:100,idempotencyKey:`absent-${student.id}`});
    assert.equal(absent.status,400);
    const invalid = await request(app).post('/payments').send({studentId:student.id,amount:100,allocations:[{installmentId:excluded.id,amount:100}],idempotencyKey:`invalid-${student.id}`});
    assert.equal(invalid.status,400);
    const options=await request(app).get(`/payment-options/${student.id}`);assert.equal(options.status,200);assert.deepEqual(options.body.installments.map((i:any)=>i.id),[old.id]);
    const next = await request(app).post(`/batches/${batch.id}/installments`).send({ name: 'Future fee', amount: 300 });
    assert.equal(next.status, 200, JSON.stringify(next.body));
    assert.equal(await db.feeInstallmentAssignment.count({ where: { studentId: student.id, installmentId: next.body.id } }), 0);
    const custom = await db.feeInstallment.create({ data: { batchId: batch.id, studentId: student.id, name: 'Personal fee', amount: 250 } });
    assert.equal((await db.studentBalance.findUniqueOrThrow({ where: { studentId: student.id } })).balance, 1250);
    await db.feeInstallment.delete({ where: { id: custom.id } });
    assert.equal((await db.studentBalance.findUniqueOrThrow({ where: { studentId: student.id } })).balance, 1000);
    const batchRead = await request(app).get(`/batches/${batch.id}`);
    assert.equal(batchRead.body.students.find((s: any) => s.id === student.id).feeDecision, 'SELECTED');

    const flatBatch = await db.batch.create({ data: { name: 'Flat fee', instituteId: institute.id, teacherId: admin.id, feeAmount: 5000 } });
    for (const [index, decision] of ['NO_FEE', 'LATER'].entries()) {
      const phone = `900000000${index + 2}`;
      const flatToken = await invite(phone, { mode: 'CURRENT_DUE_BASED', decision, installmentIds: [], applyFutureInstallments: false }, flatBatch.id);
      const result = await request(app).post('/register').send(details(flatToken, phone, `Flat student ${index}`, flatBatch.id));
      assert.equal(result.status, 200, JSON.stringify(result.body));
      assert.equal((await db.studentBalance.findUniqueOrThrow({ where: { studentId: result.body.id } })).balance, 0);
    }

    for (const path of ['/fees', '/growth', '/installment-growth']) {
      const result = await request(app).get(path);
      assert.equal(result.status, 200, `${path}: ${JSON.stringify(result.body)}`);
    }

    // A sibling sharing the first student's phone must reach review, never become the old student's success page.
    const siblingToken = await invite('9000000001', fee);
    const status = await request(app).get(`/public/batch/${batch.id}`).query({ token: siblingToken });
    assert.equal(status.body.alreadyRegistered, false);
    const review = await request(app).post('/register').send(details(siblingToken, '9000000001', 'Sibling'));
    assert.equal(review.status, 202, JSON.stringify(review.body));
    const saved = await db.studentIdentityReview.findUniqueOrThrow({ where: { id: review.body.reviewId } });
    assert.deepEqual((saved.submittedData as any).enrollmentIntent.fee, fee);
    const pending = await request(app).get(`/public/batch/${batch.id}`).query({ token: siblingToken });
    assert.equal(pending.body.identityReviewRequired, true);
    const resolved = await request(app).post(`/review/${saved.id}`).send({ action: 'CREATE_NEW', startedAt: new Date().toISOString(), idempotencyKey: `review-${saved.id}`, fee: { mode: 'CURRENT_DUE_BASED', installmentIds: [] } });
    assert.equal(resolved.status, 200, JSON.stringify(resolved.body));
    const siblingEnrollment = await db.enrollment.findUniqueOrThrow({ where: { id: resolved.body.data.enrollmentId } });
    assert.equal(siblingEnrollment.feeDecision, 'SELECTED');
    assert.equal((await db.feeInstallmentAssignment.findMany({ where: { studentId: siblingEnrollment.studentId } }))[0].installmentId, old.id);
    assert.equal(await db.feeInstallmentAssignment.count({ where: { studentId: siblingEnrollment.studentId, installmentId: excluded.id } }), 0);
    const secondBatch = await db.batch.create({ data: { name: 'Other active batch', instituteId: institute.id, teacherId: admin.id } });
    await db.enrollment.create({ data: { instituteId: institute.id, studentId: student.id, batchId: secondBatch.id, startedAt: new Date() } });
    const removeUrl = `/batches/${batch.id}/enrollments/${student.enrollments[0].id}`;
    for (let attempt = 0; attempt < 2; attempt++) {
      const removed = await request(app).delete(removeUrl).send({ reason: 'Changed batch', idempotencyKey: `remove-${student.id}` });
      assert.equal(removed.status, 200, JSON.stringify(removed.body));
    }
    assert.equal((await db.enrollment.findUniqueOrThrow({ where: { id: student.enrollments[0].id } })).status, 'ENDED');
    assert.equal(await db.enrollment.count({ where: { studentId: student.id, status: 'ACTIVE' } }), 1);
    assert.equal(await db.feePayment.count({ where: { studentId: student.id } }), 1);
    const afterRemoval = await request(app).get(`/students/${student.id}/profile`);
    assert.equal(afterRemoval.status, 200, JSON.stringify(afterRemoval.body));
    assert.equal(afterRemoval.body.id, student.id);
    assert.equal(afterRemoval.body.enrollments.length, 2);
    const visible = await request(app).get(`/batches/${batch.id}`);
    assert.equal(visible.body.students.some((row: any) => row.id === student.id), false);
    const {collectExplicitPayment}=await import('../src/services/explicitFeePaymentService');
    const actor={id:admin.id,instituteId:institute.id};
    const concurrent=await Promise.allSettled([1,2].map(n=>collectExplicitPayment({studentId:siblingEnrollment.studentId,amount:100,allocations:[{installmentId:old.id,amount:100}],idempotencyKey:`concurrent-same-${siblingEnrollment.id}`},actor)));
    assert(concurrent.every(r=>r.status==='fulfilled'));assert.equal(await db.feePayment.count({where:{studentId:siblingEnrollment.studentId}}),1);
    const other = await db.feeInstallment.create({data:{batchId:batch.id,name:'Split target',amount:500}});
    await db.feeInstallmentAssignment.create({data:{studentId:siblingEnrollment.studentId,installmentId:other.id}});
    const split=await collectExplicitPayment({studentId:siblingEnrollment.studentId,amount:300,allocations:[{installmentId:old.id,amount:100},{installmentId:other.id,amount:200}],idempotencyKey:`split-${siblingEnrollment.id}`},actor);
    assert.equal(split.paymentIds.length,2);
    const receipt=await db.upiPaymentVerification.create({data:{studentId:siblingEnrollment.studentId,instituteId:institute.id,amount:100,storageKey:'test-only'}});
    const unallocated=await request(app).post(`/upi/${receipt.id}`).send({});assert.equal(unallocated.status,400);
    const approve=await request(app).post(`/upi/${receipt.id}`).send({allocations:[{installmentId:other.id,amount:100}]});assert.equal(approve.status,200,JSON.stringify(approve.body));
    const again=await request(app).post(`/upi/${receipt.id}`).send({allocations:[{installmentId:other.id,amount:100}]});assert.equal(again.status,200);assert.equal(again.body.replayed,true);
    const race=await Promise.allSettled([1,2].map(n=>collectExplicitPayment({studentId:siblingEnrollment.studentId,amount:200,allocations:[{installmentId:other.id,amount:200}],idempotencyKey:`race-${siblingEnrollment.id}-${n}`},actor)));
    assert.equal(race.filter(r=>r.status==='fulfilled').length,1);
    assert.equal((await db.feePayment.aggregate({where:{studentId:siblingEnrollment.studentId,installmentId:other.id},_sum:{amountPaid:true}}))._sum.amountPaid,500);
    // Removing a student after a course ended must not extend the fee period.
    await db.institute.update({ where: { id: institute.id }, data: { coachingFeeMode: 'MONTH_COVERAGE' } });
    const active = await db.enrollment.findFirstOrThrow({ where: { studentId: student.id, status: 'ACTIVE' } });
    await db.studentMonthCoverageProfile.create({ data: { instituteId: institute.id, batchId: secondBatch.id, studentId: student.id, enrollmentId: active.id, status: 'ACTIVE', feeStartMonth: '2020-01', feeEndMonth: '2020-02' } });
    const monthlyRemoval = await request(app).delete(`/batches/${secondBatch.id}/enrollments/${active.id}`).send({ reason: 'Course completed', idempotencyKey: `monthly-${student.id}` });
    assert.equal(monthlyRemoval.status, 200, JSON.stringify(monthlyRemoval.body));
    assert.equal((await db.studentMonthCoverageProfile.findUniqueOrThrow({ where: { studentId: student.id } })).feeEndMonth, '2020-02');
    // An enrollment ended before its selected fee-start month has an empty fee period.
    await db.studentMonthCoverageProfile.update({ where: { studentId: student.id }, data: { feeStartMonth: '2030-01', feeEndMonth: '2029-12' } });
    const emptyPeriod = await request(app).get(`/students/${student.id}/profile`);
    assert.equal(emptyPeriod.status, 200, JSON.stringify(emptyPeriod.body));
    assert.equal(emptyPeriod.body.monthCoverageStats, null);
  } finally { await db.$disconnect(); }
});
