import test, { afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { prisma } from '../src/prisma';
import { createBatch, getBatchDetails } from '../src/controllers/batchController';
import {
  addStudentManually,
  approveStudent,
  archiveStudent,
  confirmMonthCoverageProfileController,
  registerStudent,
} from '../src/controllers/studentController';

function response() {
  return {
    statusCode: 200,
    body: undefined as unknown,
    status(code: number) { this.statusCode = code; return this; },
    json(body: unknown) { this.body = body; return this; },
  };
}

const restores: Array<() => void> = [];

function replaceMethod<T extends object, K extends keyof T>(target: T, key: K, replacement: T[K]) {
  const original = target[key];
  target[key] = replacement;
  restores.push(() => { target[key] = original; });
}

afterEach(() => {
  while (restores.length > 0) restores.pop()?.();
});

function batchRequest(body: Record<string, unknown>) {
  return { body, user: { id: 'teacher-1', instituteId: 'inst-1' } } as never;
}

test('month mode batch creation requires start and end dates before writing', async () => {
  replaceMethod(prisma.institute, 'findUnique', (async () => ({
    config: { requiresGrades: false },
    coachingFeeMode: 'MONTH_COVERAGE',
  })) as typeof prisma.institute.findUnique);
  replaceMethod(prisma.batch, 'findFirst', (async () => assert.fail('missing dates must reject before duplicate lookup')) as typeof prisma.batch.findFirst);
  replaceMethod(prisma.batch, 'create', (async () => assert.fail('missing dates must not create a batch')) as typeof prisma.batch.create);
  const res = response();

  await createBatch(batchRequest({ name: 'Evening Maths', subject: 'Maths', feeAmount: 1000 }), res as never);

  assert.equal(res.statusCode, 400);
  assert.deepEqual(res.body, { error: 'BATCH_DATES_REQUIRED' });
});

test('legacy batch creation preserves fee amount and does not synthesize dates', async () => {
  replaceMethod(prisma.institute, 'findUnique', (async () => ({
    config: { requiresGrades: false },
    coachingFeeMode: 'CURRENT_DUE_BASED',
  })) as typeof prisma.institute.findUnique);
  replaceMethod(prisma.batch, 'findFirst', (async () => null) as typeof prisma.batch.findFirst);
  let created: Record<string, unknown> | undefined;
  replaceMethod(prisma.batch, 'create', (async ({ data }: { data: Record<string, unknown> }) => {
    created = data;
    return { id: 'batch-1', ...data } as never;
  }) as typeof prisma.batch.create);
  const res = response();

  await createBatch(batchRequest({ name: 'Evening Maths', subject: 'Maths', feeAmount: 1000 }), res as never);

  assert.equal(res.statusCode, 200);
  assert.equal(created?.feeAmount, 1000);
  assert.equal('startDate' in (created ?? {}), false);
  assert.equal('endDate' in (created ?? {}), false);
});

test('month mode batch creation stores its date range and forces legacy fee amount to zero', async () => {
  replaceMethod(prisma.institute, 'findUnique', (async () => ({
    config: { requiresGrades: false },
    coachingFeeMode: 'MONTH_COVERAGE',
  })) as typeof prisma.institute.findUnique);
  replaceMethod(prisma.batch, 'findFirst', (async () => null) as typeof prisma.batch.findFirst);
  let created: Record<string, unknown> | undefined;
  replaceMethod(prisma.batch, 'create', (async ({ data }: { data: Record<string, unknown> }) => {
    created = data;
    return { id: 'batch-1', ...data } as never;
  }) as typeof prisma.batch.create);
  const res = response();

  await createBatch(batchRequest({
    name: 'Evening Maths', subject: 'Maths', feeAmount: 1000,
    startDate: '2026-07-01T00:00:00.000Z', endDate: '2026-12-31T00:00:00.000Z',
  }), res as never);

  assert.equal(res.statusCode, 200);
  assert.equal(created?.feeAmount, 0);
  assert.deepEqual(created?.startDate, new Date('2026-07-01T00:00:00.000Z'));
  assert.deepEqual(created?.endDate, new Date('2026-12-31T00:00:00.000Z'));
});

test('batch details expose fee mode, timezone, dates, and student setup status', async () => {
  replaceMethod(prisma.batch, 'findUnique', (async () => ({
    id: 'batch-1', instituteId: 'inst-1', startDate: new Date('2026-07-01T00:00:00.000Z'),
    endDate: new Date('2026-12-31T00:00:00.000Z'), tests: [], sharedTests: [],
    institute: { config: {}, coachingFeeMode: 'MONTH_COVERAGE', timezone: 'Asia/Kolkata' },
    students: [{ id: 'student-1', monthCoverageProfile: { status: 'PENDING_SETUP' } }],
  }) as never) as typeof prisma.batch.findUnique);
  const res = response();

  await getBatchDetails({ params: { id: 'batch-1' }, user: { instituteId: 'inst-1' } } as never, res as never);

  assert.equal(res.statusCode, 200);
  const body = res.body as Record<string, unknown>;
  assert.equal(body.coachingFeeMode, 'MONTH_COVERAGE');
  assert.equal(body.timezone, 'Asia/Kolkata');
  assert.deepEqual((body.students as Array<{ monthCoverageProfile: { status: string } }>)[0].monthCoverageProfile.status, 'PENDING_SETUP');
});

test('manual month-mode admission requires the teacher to choose a fee start month', async () => {
  replaceMethod(prisma.batch, 'findUnique', (async () => ({
    id: 'batch-1', instituteId: 'inst-1', institute: {
      id: 'inst-1', name: 'MathLogs', coachingFeeMode: 'MONTH_COVERAGE', timezone: 'Asia/Kolkata',
    },
  }) as never) as typeof prisma.batch.findUnique);
  replaceMethod(prisma.student, 'findFirst', (async () => assert.fail('missing fee start must reject before student lookup')) as typeof prisma.student.findFirst);
  const res = response();

  await addStudentManually({
    body: { batchId: 'batch-1', name: 'Aarav', parentName: 'Parent', parentWhatsapp: '9876543210' },
    user: { id: 'teacher-1', instituteId: 'inst-1' },
  } as never, res as never);

  assert.equal(res.statusCode, 400);
  assert.deepEqual(res.body, { error: 'FEE_START_MONTH_REQUIRED' });
});

test('month-mode approval requires the teacher to choose a fee start month', async () => {
  replaceMethod(prisma.student, 'findUnique', (async () => ({
    id: 'student-1', status: 'PENDING', humanId: null, instituteId: 'inst-1',
    batch: {
      id: 'batch-1', instituteId: 'inst-1', institute: {
        id: 'inst-1', name: 'MathLogs', coachingFeeMode: 'MONTH_COVERAGE', timezone: 'Asia/Kolkata',
      },
    },
  }) as never) as typeof prisma.student.findUnique);
  replaceMethod(prisma.student, 'update', (async () => assert.fail('missing fee start must reject before approval')) as typeof prisma.student.update);
  const res = response();

  await approveStudent({
    params: { id: 'student-1' }, body: {}, user: { id: 'teacher-1', instituteId: 'inst-1' },
  } as never, res as never);

  assert.equal(res.statusCode, 400);
  assert.deepEqual(res.body, { error: 'FEE_START_MONTH_REQUIRED' });
});

test('manual month-mode admission creates the student and active profile in one transaction', async () => {
  const batch = {
    id: 'batch-1', name: 'Evening Maths', subject: 'Maths', className: null, timeSlot: null,
    createdAt: new Date('2026-07-01T00:00:00.000Z'), startDate: new Date('2026-07-01T00:00:00.000Z'),
    endDate: new Date('2026-12-31T00:00:00.000Z'), autoSendWelcome: false, whatsappGroupLink: null,
    instituteId: 'inst-1', institute: { id: 'inst-1', name: 'MathLogs', coachingFeeMode: 'MONTH_COVERAGE', timezone: 'Asia/Kolkata' },
  };
  replaceMethod(prisma.batch, 'findUnique', (async () => batch as never) as typeof prisma.batch.findUnique);
  replaceMethod(prisma.student, 'findFirst', (async () => null) as typeof prisma.student.findFirst);
  replaceMethod(prisma.institute, 'findUnique', (async () => ({ name: 'MathLogs' }) as never) as typeof prisma.institute.findUnique);
  replaceMethod(prisma.idCounter, 'upsert', (async () => ({ seq: 1 }) as never) as typeof prisma.idCounter.upsert);
  replaceMethod(prisma.student, 'create', (async () => assert.fail('student write must use transaction client')) as typeof prisma.student.create);
  replaceMethod(prisma.studentMonthCoverageProfile, 'create', (async () => assert.fail('profile write must use transaction client')) as typeof prisma.studentMonthCoverageProfile.create);

  let transactionCalls = 0;
  const createdAt = new Date('2026-08-10T00:00:00.000Z');
  const txStudent = {
    id: 'student-1', instituteId: 'inst-1', batchId: 'batch-1', createdAt, leftAt: null,
    name: 'Aarav', humanId: 'MA-MTH26-001', parentEmail: null, parentWhatsapp: '9876543210',
  };
  const activeProfile = {
    id: 'profile-1', instituteId: 'inst-1', batchId: 'batch-1', studentId: 'student-1',
    feeStartMonth: '2026-08', feeEndMonth: '2026-12', status: 'ACTIVE',
    confirmedAt: new Date(), confirmedById: 'teacher-1', createdAt: new Date(), updatedAt: new Date(),
  };
  const fakeTx = {
    student: {
      create: async () => txStudent,
      findFirst: async () => ({ ...txStudent, institute: batch.institute, batch }),
    },
    admin: { findFirst: async () => ({ id: 'teacher-1', instituteId: 'inst-1' }) },
    studentMonthCoverageProfile: {
      findUnique: async () => null,
      updateMany: async () => ({ count: 0 }),
      create: async () => activeProfile,
      findFirst: async () => activeProfile,
    },
  };
  replaceMethod(prisma, '$transaction', (async (operation: unknown) => {
    transactionCalls += 1;
    assert.equal(typeof operation, 'function');
    return (operation as (tx: typeof fakeTx) => Promise<unknown>)(fakeTx);
  }) as typeof prisma.$transaction);
  const res = response();

  await addStudentManually({
    body: {
      batchId: 'batch-1', name: 'Aarav', parentName: 'Parent', parentWhatsapp: '9876543210', feeStartMonth: '2026-08',
    },
    user: { id: 'teacher-1', instituteId: 'inst-1' },
  } as never, res as never);

  assert.equal(res.statusCode, 200);
  assert.equal(transactionCalls, 1);
  assert.equal((res.body as { monthCoverageProfile: { status: string } }).monthCoverageProfile.status, 'ACTIVE');
});

test('month-mode approval updates the student and confirms the profile in one transaction', async () => {
  const batch = {
    id: 'batch-1', name: 'Evening Maths', subject: 'Maths', className: null, timeSlot: null,
    createdAt: new Date('2026-07-01T00:00:00.000Z'), startDate: new Date('2026-07-01T00:00:00.000Z'),
    endDate: new Date('2026-12-31T00:00:00.000Z'), autoSendWelcome: false, whatsappGroupLink: null,
    instituteId: 'inst-1', institute: { id: 'inst-1', name: 'MathLogs', coachingFeeMode: 'MONTH_COVERAGE', timezone: 'Asia/Kolkata' },
  };
  const pendingStudent = {
    id: 'student-1', instituteId: 'inst-1', batchId: 'batch-1', status: 'PENDING', humanId: null,
    name: 'Aarav', parentEmail: null, parentWhatsapp: '9876543210', createdAt: new Date('2026-08-10T00:00:00.000Z'), leftAt: null, batch,
  };
  replaceMethod(prisma.student, 'findUnique', (async () => pendingStudent as never) as typeof prisma.student.findUnique);
  replaceMethod(prisma.institute, 'findUnique', (async () => ({ name: 'MathLogs' }) as never) as typeof prisma.institute.findUnique);
  replaceMethod(prisma.idCounter, 'upsert', (async () => ({ seq: 1 }) as never) as typeof prisma.idCounter.upsert);
  replaceMethod(prisma.student, 'update', (async () => assert.fail('approval write must use transaction client')) as typeof prisma.student.update);

  let transactionCalls = 0;
  const activeProfile = {
    id: 'profile-1', instituteId: 'inst-1', batchId: 'batch-1', studentId: 'student-1',
    feeStartMonth: '2026-08', feeEndMonth: '2026-12', status: 'ACTIVE',
    confirmedAt: new Date(), confirmedById: 'teacher-1', createdAt: new Date(), updatedAt: new Date(),
  };
  const approvedStudent = { ...pendingStudent, status: 'APPROVED', humanId: 'MA-MTH26-001' };
  const fakeTx = {
    student: {
      update: async () => approvedStudent,
      findFirst: async () => ({ ...approvedStudent, institute: batch.institute, batch }),
    },
    admin: { findFirst: async () => ({ id: 'teacher-1', instituteId: 'inst-1' }) },
    studentMonthCoverageProfile: {
      findUnique: async () => ({ ...activeProfile, status: 'PENDING_SETUP', feeStartMonth: null, feeEndMonth: null }),
      updateMany: async () => ({ count: 1 }),
      findFirst: async () => activeProfile,
      create: async () => activeProfile,
    },
  };
  replaceMethod(prisma, '$transaction', (async (operation: unknown) => {
    transactionCalls += 1;
    return (operation as (tx: typeof fakeTx) => Promise<unknown>)(fakeTx);
  }) as typeof prisma.$transaction);
  const res = response();

  await approveStudent({
    params: { id: 'student-1' }, body: { feeStartMonth: '2026-08' },
    user: { id: 'teacher-1', instituteId: 'inst-1' },
  } as never, res as never);

  assert.equal(res.statusCode, 200);
  assert.equal(transactionCalls, 1);
  assert.equal((res.body as { monthCoverageProfile: { status: string } }).monthCoverageProfile.status, 'ACTIVE');
});

test('self-registered month-mode student receives pending setup without legacy assignments', async () => {
  const batch = {
    id: 'batch-1',
    name: 'Evening Maths',
    subject: 'Maths',
    className: null,
    timeSlot: null,
    createdAt: new Date('2026-07-01T00:00:00.000Z'),
    startDate: new Date('2026-07-01T00:00:00.000Z'),
    endDate: new Date('2026-12-31T00:00:00.000Z'),
    autoSendWelcome: false,
    whatsappGroupLink: null,
    isRegistrationOpen: true,
    isRegistrationEnded: false,
    instituteId: 'inst-1',
    institute: {
      id: 'inst-1',
      name: 'MathLogs',
      coachingFeeMode: 'MONTH_COVERAGE',
      timezone: 'Asia/Kolkata',
      areRegistrationsPaused: false,
      plan: 'MARKETPLACE',
      planExpiryDate: null,
    },
  };
  replaceMethod(prisma.batch, 'findUnique', (async () => batch as never) as typeof prisma.batch.findUnique);
  replaceMethod(prisma.institute, 'findUnique', (async () => ({ name: 'MathLogs' }) as never) as typeof prisma.institute.findUnique);
  replaceMethod(prisma.idCounter, 'upsert', (async () => ({ seq: 1 }) as never) as typeof prisma.idCounter.upsert);
  let student: Record<string, unknown> | null = null;
  replaceMethod(prisma.student, 'findFirst', (async ({ where }: { where: Record<string, unknown> }) => {
    if (where.id === 'student-1') return { ...student, institute: batch.institute, batch } as never;
    return null;
  }) as typeof prisma.student.findFirst);
  replaceMethod(prisma.student, 'create', (async ({ data }: { data: Record<string, unknown> }) => {
    student = { id: 'student-1', createdAt: new Date('2026-08-10T00:00:00.000Z'), ...data };
    return student as never;
  }) as typeof prisma.student.create);
  replaceMethod(prisma.studentMonthCoverageProfile, 'findUnique', (async () => null) as typeof prisma.studentMonthCoverageProfile.findUnique);
  let profileWrite: Record<string, unknown> | undefined;
  replaceMethod(prisma.studentMonthCoverageProfile, 'create', (async ({ data }: { data: Record<string, unknown> }) => {
    profileWrite = data;
    return { id: 'profile-1', confirmedAt: null, confirmedById: null, createdAt: new Date(), updatedAt: new Date(), ...data } as never;
  }) as typeof prisma.studentMonthCoverageProfile.create);
  replaceMethod(prisma.feeInstallment, 'findMany', (async () => assert.fail('month mode must not read legacy installments')) as typeof prisma.feeInstallment.findMany);
  const res = response();

  await registerStudent({
    body: {
      batchId: 'batch-1', name: 'Aarav', parentName: 'Parent', parentWhatsapp: '9876543210',
    },
  } as never, res as never);

  assert.equal(res.statusCode, 200);
  assert.deepEqual(profileWrite, {
    instituteId: 'inst-1', batchId: 'batch-1', studentId: 'student-1',
    feeStartMonth: null, feeEndMonth: null, status: 'PENDING_SETUP',
  });
});

test('teacher can confirm a pending student fee profile through the lifecycle controller', async () => {
  const contextStudent = {
    id: 'student-1', instituteId: 'inst-1', batchId: 'batch-1',
    createdAt: new Date('2026-08-10T00:00:00.000Z'), leftAt: null,
    institute: { id: 'inst-1', coachingFeeMode: 'MONTH_COVERAGE', timezone: 'Asia/Kolkata' },
    batch: {
      id: 'batch-1', instituteId: 'inst-1',
      startDate: new Date('2026-07-01T00:00:00.000Z'), endDate: new Date('2026-12-31T00:00:00.000Z'),
    },
  };
  replaceMethod(prisma.student, 'findFirst', (async () => contextStudent as never) as typeof prisma.student.findFirst);
  replaceMethod(prisma.admin, 'findFirst', (async () => ({ id: 'teacher-1', instituteId: 'inst-1' }) as never) as typeof prisma.admin.findFirst);
  replaceMethod(prisma.studentMonthCoverageProfile, 'findUnique', (async () => ({
    id: 'profile-1', instituteId: 'inst-1', batchId: 'batch-1', studentId: 'student-1',
    feeStartMonth: null, feeEndMonth: null, status: 'PENDING_SETUP', confirmedAt: null, confirmedById: null,
    createdAt: new Date(), updatedAt: new Date(),
  }) as never) as typeof prisma.studentMonthCoverageProfile.findUnique);
  replaceMethod(prisma.studentMonthCoverageProfile, 'updateMany', (async () => ({ count: 1 })) as typeof prisma.studentMonthCoverageProfile.updateMany);
  replaceMethod(prisma.studentMonthCoverageProfile, 'findFirst', (async () => ({
    id: 'profile-1', instituteId: 'inst-1', batchId: 'batch-1', studentId: 'student-1',
    feeStartMonth: '2026-08', feeEndMonth: '2026-12', status: 'ACTIVE',
    confirmedAt: new Date(), confirmedById: 'teacher-1', createdAt: new Date(), updatedAt: new Date(),
  }) as never) as typeof prisma.studentMonthCoverageProfile.findFirst);
  const res = response();

  await confirmMonthCoverageProfileController({
    params: { studentId: 'student-1' }, body: { feeStartMonth: '2026-08' },
    user: { id: 'teacher-1', instituteId: 'inst-1' },
  } as never, res as never);

  assert.equal(res.statusCode, 200);
  assert.equal((res.body as { profile: { status: string } }).profile.status, 'ACTIVE');
});

test('archiving a month-mode student closes the profile before clearing the batch', async () => {
  const leaveAt = new Date('2026-09-15T00:00:00.000Z');
  const archivedStudent = {
    id: 'student-1', name: 'Aarav', humanId: 'MA-MTH26-001', parentName: 'Parent', parentWhatsapp: '9876543210',
    instituteId: 'inst-1', batchId: 'batch-1', createdAt: new Date('2026-08-10T00:00:00.000Z'), leftAt: null,
    fees: [], feePayments: [], attendanceRecords: [], marks: [], quizSubmissions: [],
    batch: { id: 'batch-1', instituteId: 'inst-1', startDate: new Date('2026-07-01T00:00:00.000Z'), endDate: new Date('2026-12-31T00:00:00.000Z'), institute: { id: 'inst-1', coachingFeeMode: 'MONTH_COVERAGE', timezone: 'Asia/Kolkata' } },
  };
  replaceMethod(prisma.student, 'findUnique', (async () => archivedStudent as never) as typeof prisma.student.findUnique);
  replaceMethod(prisma.student, 'findFirst', (async () => ({ ...archivedStudent, institute: archivedStudent.batch.institute }) as never) as typeof prisma.student.findFirst);
  replaceMethod(prisma.studentMonthCoverageProfile, 'findUnique', (async () => ({
    id: 'profile-1', instituteId: 'inst-1', batchId: 'batch-1', studentId: 'student-1', feeStartMonth: '2026-08', feeEndMonth: '2026-12', status: 'ACTIVE',
    confirmedAt: new Date(), confirmedById: 'teacher-1', createdAt: new Date(), updatedAt: new Date(),
  }) as never) as typeof prisma.studentMonthCoverageProfile.findUnique);
  let closedBeforeArchive = false;
  replaceMethod(prisma.studentMonthCoverageProfile, 'updateMany', (async () => { closedBeforeArchive = true; return { count: 1 }; }) as typeof prisma.studentMonthCoverageProfile.updateMany);
  replaceMethod(prisma.studentMonthCoverageProfile, 'findFirst', (async () => ({
    id: 'profile-1', instituteId: 'inst-1', batchId: 'batch-1', studentId: 'student-1', feeStartMonth: '2026-08', feeEndMonth: '2026-09', status: 'CLOSED',
    confirmedAt: new Date(), confirmedById: 'teacher-1', createdAt: new Date(), updatedAt: new Date(),
  }) as never) as typeof prisma.studentMonthCoverageProfile.findFirst);
  let archiveWrite: Record<string, unknown> | undefined;
  replaceMethod(prisma.student, 'update', (async ({ data }: { data: Record<string, unknown> }) => {
    assert.equal(closedBeforeArchive, true);
    archiveWrite = data;
    return { ...archivedStudent, ...data } as never;
  }) as typeof prisma.student.update);
  const res = response();

  await archiveStudent({
    params: { id: 'student-1' }, body: { leaveReason: 'Moved' },
    user: { id: 'teacher-1', instituteId: 'inst-1' },
    monthCoverageLeaveAt: leaveAt,
  } as never, res as never);

  assert.equal(res.statusCode, 200);
  assert.equal(archiveWrite?.status, 'LEFT');
  assert.equal(archiveWrite?.batchId, null);
});
