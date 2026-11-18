import bcrypt from 'bcryptjs';
import crypto from 'node:crypto';
import { prisma } from '../src/prisma';

const databaseUrl = process.env.DATABASE_URL;
const phone = String(process.env.DEMO_BASIC_PHONE || '9999900001').replace(/\D/g, '');
const otp = String(process.env.DEMO_BASIC_OTP || '00000').replace(/\D/g, '');

function assertLocalDatabase(): void {
  if (!databaseUrl) throw new Error('DATABASE_URL is required.');
  const hostname = new URL(databaseUrl).hostname;
  if (!['localhost', '127.0.0.1', '::1'].includes(hostname)) {
    throw new Error(`Refusing to seed a non-local database host: ${hostname}`);
  }
  if (!/^\d{10}$/.test(phone)) throw new Error('DEMO_BASIC_PHONE must contain 10 digits.');
  if (!/^\d{5}$/.test(otp)) throw new Error('DEMO_BASIC_OTP must contain exactly 5 digits.');
}

async function main() {
  assertLocalDatabase();
  const now = new Date();

  const existingInstitute = await prisma.institute.findFirst({ where: { phoneNumber: phone } });
  const institute = existingInstitute
    ? await prisma.institute.update({
        where: { id: existingInstitute.id },
        data: {
          name: 'MathLogs Basic Demo',
          teacherName: 'Demo Teacher',
          status: 'ACTIVE',
          plan: 'BASIC',
          planExpiryDate: null,
          trialEndsAt: null,
          includedQuizCredits: 0,
          lifetimeQuizCredits: 0,
          quizCredits: 0,
          coachingFeeMode: 'CURRENT_DUE_BASED',
        },
      })
    : await prisma.institute.create({
        data: {
          name: 'MathLogs Basic Demo',
          teacherName: 'Demo Teacher',
          phoneNumber: phone,
          status: 'ACTIVE',
          plan: 'BASIC',
          planStartDate: now,
          includedQuizCredits: 0,
          lifetimeQuizCredits: 0,
          quizCredits: 0,
          coachingFeeMode: 'CURRENT_DUE_BASED',
        },
      });

  const password = await bcrypt.hash(crypto.randomBytes(24).toString('hex'), 10);
  const admin = await prisma.admin.upsert({
    where: { username: phone },
    update: { instituteId: institute.id, role: 'INSTITUTE_ADMIN' },
    create: { username: phone, password, instituteId: institute.id, role: 'INSTITUTE_ADMIN' },
  });

  const batchDefinitions = [
    { name: 'Class 10 Mathematics', className: '10', subject: 'Mathematics', timeSlot: 'Mon, Wed, Fri · 4 PM' },
    { name: 'Class 9 Foundation', className: '9', subject: 'Mathematics', timeSlot: 'Tue, Thu · 5 PM' },
  ];
  const batches = [];
  for (const definition of batchDefinitions) {
    const existing = await prisma.batch.findFirst({ where: { instituteId: institute.id, name: definition.name } });
    const batch = existing
      ? await prisma.batch.update({ where: { id: existing.id }, data: { ...definition, teacherId: admin.id, isRegistrationOpen: true, isRegistrationEnded: false } })
      : await prisma.batch.create({ data: { ...definition, teacherId: admin.id, instituteId: institute.id, isRegistrationOpen: true } });
    batches.push(batch);
  }

  const students = [
    { humanId: 'DEMO-001', name: 'Aarav Shah', parentName: 'Ritika Shah', parentWhatsapp: '9000000101', batch: batches[0] },
    { humanId: 'DEMO-002', name: 'Diya Mehta', parentName: 'Kunal Mehta', parentWhatsapp: '9000000102', batch: batches[0] },
    { humanId: 'DEMO-003', name: 'Kabir Rao', parentName: 'Anita Rao', parentWhatsapp: '9000000103', batch: batches[0] },
    { humanId: 'DEMO-004', name: 'Meera Nair', parentName: 'Suresh Nair', parentWhatsapp: '9000000104', batch: batches[1] },
  ];
  const seededStudents = [];
  for (const definition of students) {
    const existing = await prisma.student.findFirst({ where: { instituteId: institute.id, humanId: definition.humanId } });
    const student = existing ?? await prisma.student.create({
      data: {
        humanId: definition.humanId,
        name: definition.name,
        parentName: definition.parentName,
        parentWhatsapp: definition.parentWhatsapp,
        status: 'ACTIVE',
        batchId: definition.batch.id,
        instituteId: institute.id,
      },
    });
    const enrollment = await prisma.enrollment.findFirst({ where: { studentId: student.id, batchId: definition.batch.id, status: 'ACTIVE' } });
    if (!enrollment) {
      await prisma.enrollment.create({
        data: {
          instituteId: institute.id,
          studentId: student.id,
          batchId: definition.batch.id,
          status: 'ACTIVE',
          startedAt: now,
          feeDecision: 'SELECTED',
          createdById: admin.id,
        },
      });
    }
    seededStudents.push(student);
  }

  const installment = await prisma.feeInstallment.findFirst({ where: { batchId: batches[0].id, name: 'November fee' } })
    ?? await prisma.feeInstallment.create({ data: { batchId: batches[0].id, name: 'November fee', amount: 1500 } });
  for (const student of seededStudents.slice(0, 3)) {
    await prisma.feeInstallmentAssignment.upsert({
      where: { studentId_installmentId: { studentId: student.id, installmentId: installment.id } },
      update: {},
      create: { studentId: student.id, installmentId: installment.id },
    });
  }
  const existingPayment = await prisma.feePayment.findFirst({ where: { studentId: seededStudents[0].id, installmentId: installment.id } });
  if (!existingPayment) {
    await prisma.feePayment.create({ data: { studentId: seededStudents[0].id, installmentId: installment.id, amountPaid: 1500 } });
  }

  const existingTest = await prisma.test.findFirst({ where: { instituteId: institute.id, batchId: batches[0].id, name: 'Algebra baseline' } });
  const test = existingTest ?? await prisma.test.create({
    data: {
      name: 'Algebra baseline',
      subject: 'Mathematics',
      className: '10',
      date: now,
      maxMarks: 20,
      teacherId: admin.id,
      instituteId: institute.id,
      batchId: batches[0].id,
    },
  });
  const scores = [16, 13, 18];
  for (const [index, student] of seededStudents.slice(0, 3).entries()) {
    await prisma.mark.upsert({
      where: { studentId_testId: { studentId: student.id, testId: test.id } },
      update: { score: scores[index] },
      create: { studentId: student.id, testId: test.id, score: scores[index] },
    });
  }

  await prisma.otpToken.upsert({
    where: { identifier: phone },
    update: { otp, verified: false, createdAt: now, expiresAt: new Date(now.getTime() + 24 * 60 * 60 * 1000) },
    create: { identifier: phone, otp, expiresAt: new Date(now.getTime() + 24 * 60 * 60 * 1000) },
  });

  console.log(`Basic demo ready: +91 ${phone}, OTP ${otp}`);
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
