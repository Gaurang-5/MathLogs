import test, { afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { prisma } from '../src/prisma';
import { getDashboardSummary } from '../src/controllers/dashboardController';
import {
  getMonthCoverageDashboard,
  getMonthCoverageSummary,
  summarizeStudent,
  type MonthCoverageSummaryDeps,
  type MonthCoverageSummaryStudentSource,
} from '../src/services/monthCoverageSummaryService';

const restores: Array<() => void> = [];
function replaceMethod<T extends object, K extends keyof T>(target: T, key: K, replacement: T[K]) {
  const original = target[key];
  target[key] = replacement;
  restores.push(() => { target[key] = original; });
}
afterEach(() => { while (restores.length > 0) restores.pop()?.(); });

function response() {
  return {
    statusCode: 200, body: undefined as unknown,
    status(code: number) { this.statusCode = code; return this; },
    json(body: unknown) { this.body = body; return this; },
  };
}

test('future uncovered months are pending but not overdue', () => {
  const result = summarizeStudent({
    feeStartMonth: '2026-07', feeEndMonth: '2026-12',
    coveredMonths: ['2026-07', '2026-08'], currentMonth: '2026-09',
  });

  assert.deepEqual(result, {
    applicableMonths: 6, receivedMonths: 2, pendingMonths: 4,
    overdueMonths: 1, nextPendingMonth: '2026-09', oldestOverdueMonth: '2026-09', progressPercent: 33,
  });
});

function source(overrides: Partial<MonthCoverageSummaryStudentSource> = {}): MonthCoverageSummaryStudentSource {
  return {
    studentId: 'student-1', name: 'Aarav', batchId: 'batch-1', batchName: 'Evening Maths',
    profileStatus: 'ACTIVE', feeStartMonth: '2026-07', feeEndMonth: '2026-12',
    allocations: [
      { coverageMonth: '2026-07', paymentStatus: 'ACTIVE' },
      { coverageMonth: '2026-08', paymentStatus: 'ACTIVE' },
    ],
    payments: [{
      id: 'payment-1', amountPaise: 100025, paymentDate: new Date('2026-09-10T00:00:00.000Z'),
      duration: 'QUARTERLY', status: 'ACTIVE', coverageMonths: ['2026-07', '2026-08'],
    }],
    ...overrides,
  };
}

function depsFor(students: MonthCoverageSummaryStudentSource[]): MonthCoverageSummaryDeps {
  return {
    loadInstitute: async () => ({ id: 'inst-1', coachingFeeMode: 'MONTH_COVERAGE', timezone: 'Asia/Kolkata', teacherName: 'Gaurang' }),
    loadStudents: async () => students,
    countBatches: async () => 2,
  };
}

test('pending setup students are visible but excluded from aggregate denominators', async () => {
  const pending = source({
    studentId: 'student-2', name: 'Meera', profileStatus: 'PENDING_SETUP',
    feeStartMonth: null, feeEndMonth: null, allocations: [], payments: [],
  });

  const result = await getMonthCoverageSummary({ instituteId: 'inst-1', now: new Date('2026-09-10T00:00:00.000Z') }, depsFor([source(), pending]));

  assert.equal(result.students.length, 2);
  assert.equal(result.students[1].setupRequired, true);
  assert.deepEqual(result.totals, {
    collectedRupees: 1000.25, receivedMonths: 2, pendingMonths: 4,
    overdueMonths: 1, applicableMonths: 6, progressPercent: 33,
  });
});

test('voided payments and allocations are excluded and student months stay distinct', async () => {
  const result = await getMonthCoverageSummary({ instituteId: 'inst-1', now: new Date('2026-09-10T00:00:00.000Z') }, depsFor([
    source({
      allocations: [
        { coverageMonth: '2026-07', paymentStatus: 'ACTIVE' },
        { coverageMonth: '2026-07', paymentStatus: 'ACTIVE' },
        { coverageMonth: '2026-08', paymentStatus: 'VOID' },
      ],
      payments: [
        { id: 'payment-active', amountPaise: 50000, paymentDate: new Date('2026-09-01T00:00:00.000Z'), duration: 'MONTHLY', status: 'ACTIVE', coverageMonths: ['2026-07'] },
        { id: 'payment-void', amountPaise: 99999, paymentDate: new Date('2026-09-02T00:00:00.000Z'), duration: 'MONTHLY', status: 'VOID', coverageMonths: ['2026-08'] },
      ],
    }),
  ]));

  assert.equal(result.totals.receivedMonths, 1);
  assert.equal(result.totals.collectedRupees, 500);
  assert.deepEqual(result.recentPayments.map(payment => payment.id), ['payment-active']);
});

test('closed profiles count only through their stored fee end month', async () => {
  const result = await getMonthCoverageSummary({ instituteId: 'inst-1', now: new Date('2026-11-10T00:00:00.000Z') }, depsFor([
    source({ profileStatus: 'CLOSED', feeEndMonth: '2026-09' }),
  ]));

  assert.equal(result.totals.applicableMonths, 3);
  assert.equal(result.totals.pendingMonths, 1);
  assert.equal(result.totals.overdueMonths, 1);
});

test('dashboard returns month totals and oldest overdue follow-ups without legacy finances', async () => {
  const result = await getMonthCoverageDashboard('inst-1', 'teacher-1', new Date('2026-09-10T00:00:00.000Z'), depsFor([source()]));

  assert.equal(result.feeMode, 'MONTH_COVERAGE');
  assert.deepEqual(result.stats, { batches: 2, students: 1 });
  assert.equal(result.monthCoverage.collectedRupees, 1000.25);
  assert.deepEqual(result.followUps, [{
    studentId: 'student-1', name: 'Aarav', batchName: 'Evening Maths', overdueMonths: 1, oldestOverdueMonth: '2026-09',
  }]);
  assert.equal(result.userName, 'Gaurang');
  assert.equal('finances' in result, false);
});

test('dashboard controller dispatches month mode without querying legacy fee SQL', async () => {
  replaceMethod(prisma.institute, 'findUnique', (async () => ({
    id: 'inst-1', coachingFeeMode: 'MONTH_COVERAGE', timezone: 'Asia/Kolkata', teacherName: 'Gaurang',
  }) as never) as typeof prisma.institute.findUnique);
  replaceMethod(prisma.student, 'findMany', (async () => [{
    id: 'student-1', name: 'Aarav',
    monthCoverageProfile: {
      status: 'ACTIVE', feeStartMonth: '2026-07', feeEndMonth: '2026-12',
      batch: { id: 'batch-1', name: 'Evening Maths' },
    },
    monthCoverageAllocations: [{ coverageMonth: '2026-07', payment: { status: 'ACTIVE' } }],
    monthCoveragePayments: [],
  }] as never) as typeof prisma.student.findMany);
  replaceMethod(prisma.batch, 'count', (async () => 1) as typeof prisma.batch.count);
  replaceMethod(prisma, '$queryRaw', (async () => assert.fail('month dashboard must not query legacy fee tables')) as typeof prisma.$queryRaw);
  const res = response();

  await getDashboardSummary({
    user: { id: 'teacher-1', instituteId: 'inst-1', username: 'teacher' },
  } as never, res as never);

  assert.equal(res.statusCode, 200);
  assert.equal((res.body as { feeMode: string }).feeMode, 'MONTH_COVERAGE');
  assert.equal('finances' in (res.body as Record<string, unknown>), false);
});
