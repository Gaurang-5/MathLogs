import 'dotenv/config';
import bcrypt from 'bcryptjs';
import { PrismaClient, type MonthCoverageDuration } from '@prisma/client';

const prisma = new PrismaClient();
const DEMO_SLUG = 'month-coverage-demo';
const DEMO_LOGIN_PHONE = '9557940810';
const DEMO_ALERT_PHONE = '9557940807';

const monthKey = (date: Date) => `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
const laterMonth = (left: string, right: string) => left > right ? left : right;
const monthSequence = (start: string, count: number) => {
  const [year, month] = start.split('-').map(Number);
  return Array.from({ length: count }, (_, index) => monthKey(new Date(Date.UTC(year, month - 1 + index, 1))));
};

export async function seedMonthCoverageDemo(client: PrismaClient = prisma) {
  return client.$transaction(async tx => {
    const bySlug = await tx.institute.findUnique({ where: { slug: DEMO_SLUG } });
    const byPhone = await tx.institute.findFirst({ where: { phoneNumber: DEMO_LOGIN_PHONE } });
    const byUsername = await tx.admin.findUnique({ where: { username: DEMO_LOGIN_PHONE } });
    if (bySlug && bySlug.name !== 'Month Coverage Demo') throw new Error('DEMO_SLUG_OWNED_BY_ANOTHER_INSTITUTE');
    if (byPhone && byPhone.id !== bySlug?.id && byPhone.slug !== DEMO_SLUG) throw new Error('DEMO_PHONE_OWNED_BY_ANOTHER_INSTITUTE');
    if (byUsername && byUsername.instituteId !== bySlug?.id) throw new Error('DEMO_USERNAME_OWNED_BY_ANOTHER_INSTITUTE');

    const institute = await tx.institute.upsert({
      where: { slug: DEMO_SLUG },
      update: {
        name: 'Month Coverage Demo', phoneNumber: DEMO_LOGIN_PHONE, teacherName: 'Demo Teacher',
        plan: 'ENTERPRISE', coachingFeeMode: 'MONTH_COVERAGE', coachingFeeModeSelectedAt: new Date(), timezone: 'Asia/Kolkata', status: 'ACTIVE',
        config: { requiresGrades: false, subjects: ['Mathematics'], registrationForm: { fields: [
          { id: 'studentName', label: 'Student Name', type: 'text', required: true, system: true },
          { id: 'parentName', label: 'Parent / Guardian Name', type: 'text', required: true, system: true },
          { id: 'parentWhatsapp', label: 'WhatsApp Number', type: 'tel', required: true, system: true },
          { id: 'emergencyPhone', label: 'Additional alert number', type: 'tel', required: false, system: false, sendAlerts: true },
        ] } },
      },
      create: {
        slug: DEMO_SLUG, name: 'Month Coverage Demo', phoneNumber: DEMO_LOGIN_PHONE, teacherName: 'Demo Teacher',
        plan: 'ENTERPRISE', coachingFeeMode: 'MONTH_COVERAGE', coachingFeeModeSelectedAt: new Date(), timezone: 'Asia/Kolkata', status: 'ACTIVE',
        config: { requiresGrades: false, subjects: ['Mathematics'], registrationForm: { fields: [
          { id: 'studentName', label: 'Student Name', type: 'text', required: true, system: true },
          { id: 'parentName', label: 'Parent / Guardian Name', type: 'text', required: true, system: true },
          { id: 'parentWhatsapp', label: 'WhatsApp Number', type: 'tel', required: true, system: true },
          { id: 'emergencyPhone', label: 'Additional alert number', type: 'tel', required: false, system: false, sendAlerts: true },
        ] } },
      },
    });

    await tx.monthCoverageAuditEvent.deleteMany({ where: { instituteId: institute.id } });
    await tx.monthCoverageAllocation.deleteMany({ where: { instituteId: institute.id } });
    await tx.monthCoveragePayment.deleteMany({ where: { instituteId: institute.id } });
    await tx.studentMonthCoverageProfile.deleteMany({ where: { instituteId: institute.id } });
    await tx.student.deleteMany({ where: { instituteId: institute.id } });
    await tx.batch.deleteMany({ where: { instituteId: institute.id } });

    const password = await bcrypt.hash(`demo-${Date.now()}-${Math.random()}`, 10);
    const admin = await tx.admin.upsert({
      where: { username: DEMO_LOGIN_PHONE },
      update: { instituteId: institute.id, role: 'INSTITUTE_ADMIN', password },
      create: { username: DEMO_LOGIN_PHONE, instituteId: institute.id, role: 'INSTITUTE_ADMIN', password },
    });

    const batchDefs = [
      { name: 'Foundation 2026-27', start: new Date('2026-04-01T00:00:00.000Z'), end: new Date('2027-03-31T23:59:59.000Z') },
      { name: 'Target Jul-Dec 2026', start: new Date('2026-07-01T00:00:00.000Z'), end: new Date('2026-12-31T23:59:59.000Z') },
      { name: 'Weekend Aug-Jan', start: new Date('2026-08-01T00:00:00.000Z'), end: new Date('2027-01-31T23:59:59.000Z') },
    ];
    const names = ['Aarav Sharma', 'Meera Gupta', 'Vihaan Singh', 'Anaya Jain', 'Arjun Verma', 'Diya Kapoor', 'Kabir Joshi', 'Ira Mehta', 'Reyansh Das', 'Sara Khan', 'Atharv Rao', 'Myra Nair'];
    const joinDates = [
      '2026-03-20', '2026-04-08', '2026-06-15', '2026-08-12',
      '2026-06-22', '2026-07-10', '2026-08-05', '2026-09-14',
      '2026-07-25', '2026-08-03', '2026-08-18', '2026-10-02',
    ];
    const students: Array<{ id: string; batchId: string; feeStart: string; feeEnd: string }> = [];
    for (let batchIndex = 0; batchIndex < batchDefs.length; batchIndex += 1) {
      const definition = batchDefs[batchIndex];
      const batch = await tx.batch.create({ data: {
        name: definition.name, subject: 'Mathematics', className: 'Demo', timeSlot: batchIndex === 2 ? 'Sat-Sun 10 AM' : 'Mon-Wed-Fri 4 PM',
        feeAmount: 0, startDate: definition.start, endDate: definition.end, instituteId: institute.id, teacherId: admin.id,
      } });
      for (let offset = 0; offset < 4; offset += 1) {
        const index = batchIndex * 4 + offset;
        const joinedAt = new Date(`${joinDates[index]}T08:00:00.000Z`);
        const student = await tx.student.create({ data: {
          humanId: `DEMO-${String(index + 1).padStart(3, '0')}`, name: names[index], parentName: `Parent of ${names[index]}`,
          parentWhatsapp: DEMO_ALERT_PHONE, status: 'APPROVED', batchId: batch.id, instituteId: institute.id, createdAt: joinedAt,
          additionalData: { emergencyPhone: DEMO_ALERT_PHONE },
        } });
        const feeStart = laterMonth(monthKey(definition.start), monthKey(joinedAt));
        const feeEnd = monthKey(definition.end);
        await tx.studentMonthCoverageProfile.create({ data: {
          instituteId: institute.id, batchId: batch.id, studentId: student.id, feeStartMonth: feeStart, feeEndMonth: feeEnd,
          status: 'ACTIVE', confirmedAt: new Date(), confirmedById: admin.id,
        } });
        students.push({ id: student.id, batchId: batch.id, feeStart, feeEnd });
      }
    }

    const plans: Array<{ index: number; duration: MonthCoverageDuration; months: number; amount: number }> = [
      { index: 0, duration: 'YEARLY', months: 12, amount: 12000 },
      { index: 1, duration: 'QUARTERLY', months: 3, amount: 3000 },
      { index: 2, duration: 'MONTHLY', months: 1, amount: 1000 },
      { index: 4, duration: 'HALF_YEARLY', months: 6, amount: 6000 },
      { index: 5, duration: 'QUARTERLY', months: 3, amount: 3000 },
      { index: 6, duration: 'MONTHLY', months: 1, amount: 1000 },
      { index: 8, duration: 'QUARTERLY', months: 3, amount: 3000 },
      { index: 9, duration: 'MONTHLY', months: 1, amount: 1000 },
      { index: 11, duration: 'MONTHLY', months: 1, amount: 1000 },
    ];
    for (const plan of plans) {
      const student = students[plan.index];
      const coverageMonths = monthSequence(student.feeStart, plan.months).filter(month => month <= student.feeEnd);
      const payment = await tx.monthCoveragePayment.create({ data: {
        instituteId: institute.id, batchId: student.batchId, studentId: student.id, amountPaise: plan.amount * 100,
        paymentDate: new Date('2026-08-20T12:00:00.000Z'), paymentMethod: plan.index % 2 ? 'UPI' : 'CASH',
        duration: plan.duration, status: 'ACTIVE', idempotencyKey: `demo-${plan.index}-${plan.duration}`, createdById: admin.id,
      } });
      await tx.monthCoverageAllocation.createMany({ data: coverageMonths.map(coverageMonth => ({
        instituteId: institute.id, batchId: student.batchId, studentId: student.id, paymentId: payment.id, coverageMonth,
      })) });
    }

    return {
      instituteId: institute.id, slug: DEMO_SLUG, loginPhone: DEMO_LOGIN_PHONE, alertPhone: DEMO_ALERT_PHONE,
      batches: await tx.batch.count({ where: { instituteId: institute.id } }),
      students: await tx.student.count({ where: { instituteId: institute.id } }),
      profiles: await tx.studentMonthCoverageProfile.count({ where: { instituteId: institute.id, status: 'ACTIVE' } }),
      payments: await tx.monthCoveragePayment.count({ where: { instituteId: institute.id } }),
      allocations: await tx.monthCoverageAllocation.count({ where: { instituteId: institute.id } }),
    };
  }, { timeout: 30_000 });
}

if (require.main === module) {
  seedMonthCoverageDemo().then(result => console.log(JSON.stringify(result, null, 2)))
    .catch(error => { console.error(error instanceof Error ? error.message : error); process.exitCode = 1; })
    .finally(() => prisma.$disconnect());
}
