import test, { afterEach } from 'node:test';
import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import { createApp } from '../src/index';
import { prisma } from '../src/prisma';
import { MonthCoverageError } from '../src/domain/monthCoverage/types';
import { createMonthCoverageHandlers, type MonthCoverageControllerDeps } from '../src/controllers/monthCoverageController';
import { getPublicStudentFees, studentFeesCache, submitUpiPayment } from '../src/controllers/publicController';
import {
  buildMonthCoverageReminderBody,
  getMonthCoverageTransactionReportRows,
  pendingMonthReportRows,
  transactionMonthReportRows,
} from '../src/services/monthCoverageReportService';
import { deleteMonthCoverageData } from '../src/services/monthCoverageDeletionService';

function response() {
  return {
    statusCode: 200, body: undefined as unknown,
    status(code: number) { this.statusCode = code; return this; },
    json(body: unknown) { this.body = body; return this; },
    send(body: unknown) { this.body = body; return this; },
  };
}

const restores: Array<() => void> = [];
function replaceMethod<T extends object, K extends keyof T>(target: T, key: K, replacement: T[K]) {
  const original = target[key]; target[key] = replacement; restores.push(() => { target[key] = original; });
}
afterEach(() => { while (restores.length > 0) restores.pop()?.(); studentFeesCache.clear(); });

function controllerDeps(overrides: Partial<MonthCoverageControllerDeps> = {}): MonthCoverageControllerDeps {
  return {
    summary: async () => ({ feeMode: 'MONTH_COVERAGE', totals: {}, students: [], recentPayments: [] }) as never,
    preview: async input => ({
      studentId: input.studentId, duration: input.duration, monthCount: 1,
      coverageMonths: ['2026-09'], oldestPendingMonth: '2026-09', gapWarning: null, remainingMonthsAfterPayment: 0,
    }),
    create: async input => ({
      payment: { id: 'payment-1', amountPaise: 100000 }, coverageMonths: ['2026-09'], preview: null, idempotent: false,
    }) as never,
    update: async () => ({ payment: { id: 'payment-1', amountPaise: 100000 }, coverageMonths: ['2026-09'] }) as never,
    voidPreview: async () => ({ paymentId: 'payment-1', amountRupees: 1000, reopenedMonths: ['2026-09'] }),
    voidPayment: async () => ({ payment: { id: 'payment-1', status: 'VOID' }, reopenedMonths: ['2026-09'] }) as never,
    reminders: async () => ({ queued: 0, skipped: 0 }),
    pendingReport: async () => Buffer.from('pdf'),
    transactionReport: async () => Buffer.from('pdf'),
    ...overrides,
  };
}

test('payment create requires one idempotency key before service execution', async () => {
  let calls = 0;
  const handlers = createMonthCoverageHandlers(controllerDeps({ create: async () => { calls += 1; return {} as never; } }));
  const res = response();

  await handlers.createPayment({
    headers: {}, body: { studentId: 'student-1' }, user: { id: 'teacher-1', instituteId: 'inst-1' },
  } as never, res as never);

  assert.equal(res.statusCode, 400);
  assert.deepEqual(res.body, { error: 'IDEMPOTENCY_KEY_REQUIRED' });
  assert.equal(calls, 0);
});

test('payment create forwards teacher input and serializes paise as rupees', async () => {
  let received: Record<string, unknown> | undefined;
  const handlers = createMonthCoverageHandlers(controllerDeps({
    create: async input => { received = input as unknown as Record<string, unknown>; return {
      payment: { id: 'payment-1', amountPaise: 100025, paymentDate: new Date('2026-09-10T00:00:00.000Z') },
      coverageMonths: ['2026-09'], preview: null, idempotent: false,
    } as never; },
  }));
  const res = response();

  await handlers.createPayment({
    headers: { 'idempotency-key': 'attempt-1' },
    body: {
      studentId: 'student-1', amount: 1000.25, paymentDate: '2026-09-10T00:00:00.000Z', paymentMethod: 'UPI',
      duration: 'MONTHLY', requestedStartMonth: null, allowGap: false,
    },
    user: { id: 'teacher-1', instituteId: 'inst-1' },
  } as never, res as never);

  assert.equal(res.statusCode, 201);
  assert.equal(received?.idempotencyKey, 'attempt-1');
  assert.equal(received?.amountRupees, 1000.25);
  assert.equal((res.body as { payment: { amount: number } }).payment.amount, 1000.25);
});

test('overlap and gap errors map to conflict without leaking implementation details', async () => {
  for (const code of ['MONTH_ALREADY_COVERED', 'COVERAGE_GAP_REQUIRES_CONFIRMATION'] as const) {
    const handlers = createMonthCoverageHandlers(controllerDeps({ preview: async () => { throw new MonthCoverageError(code); } }));
    const res = response();
    await handlers.previewPayment({
      body: { studentId: 'student-1', duration: 'MONTHLY' }, user: { id: 'teacher-1', instituteId: 'inst-1' },
    } as never, res as never);
    assert.equal(res.statusCode, 409);
    assert.deepEqual(res.body, { error: code });
  }
});

test('month reminder names overdue months without amount-due claims or parent payment links', () => {
  const body = buildMonthCoverageReminderBody({
    studentName: 'Aarav', batchName: 'Evening Maths', instituteName: 'MathLogs',
    overdueMonths: ['2026-07', '2026-08'],
  });

  assert.match(body, /July and August 2026/);
  assert.doesNotMatch(body, /amount due|balance|₹|Rs\.|\/pay\//i);
});

test('reports show month counts and recognize the complete payment on its collection date', () => {
  const summary = {
    feeMode: 'MONTH_COVERAGE' as const,
    totals: { collectedRupees: 1000, receivedMonths: 1, pendingMonths: 2, overdueMonths: 1, applicableMonths: 3, progressPercent: 33 },
    students: [{
      studentId: 'student-1', name: 'Aarav', batchId: 'batch-1', batchName: 'Evening Maths', setupRequired: false,
      feeStartMonth: '2026-07', feeEndMonth: '2026-09', applicableMonths: 3, receivedMonths: 1,
      pendingMonths: 2, overdueMonths: 1, nextPendingMonth: '2026-08', oldestOverdueMonth: '2026-08', progressPercent: 33,
    }],
    recentPayments: [{
      id: 'payment-1', studentId: 'student-1', studentName: 'Aarav', batchName: 'Evening Maths', amountRupees: 1000,
      paymentDate: '2026-09-10T00:00:00.000Z', duration: 'MONTHLY' as const, coverageMonths: ['2026-07'],
    }],
  };

  assert.deepEqual(pendingMonthReportRows(summary)[0], {
    student: 'Aarav', batch: 'Evening Maths', feeStart: '2026-07', feeEnd: '2026-09',
    received: 1, pending: 2, overdue: 1, oldestOverdueMonth: '2026-08',
  });
  assert.equal(transactionMonthReportRows(summary, 9, 2026)[0].amountRupees, 1000);
});

test('transaction report repository returns every active collection instead of the recent-payment limit', async () => {
  const payments = Array.from({ length: 25 }, (_, index) => ({
    id: `payment-${index}`, studentName: 'Aarav', batchName: 'Evening Maths', amountPaise: 100000,
    paymentDate: new Date(`2026-09-${String(index % 20 + 1).padStart(2, '0')}T00:00:00.000Z`),
    coverageMonths: ['2026-07'],
  }));

  const rows = await getMonthCoverageTransactionReportRows({
    instituteId: 'inst-1', teacherId: 'teacher-1', month: 9, year: 2026,
  }, { loadPayments: async () => payments });

  assert.equal(rows.length, 25);
  assert.equal(rows.reduce((sum, row) => sum + row.amountRupees, 0), 25000);
});

test('all authenticated month coverage routes exist and reject anonymous requests', async () => {
  const app = createApp();
  const server = await new Promise<ReturnType<typeof app.listen>>(resolve => {
    const listening = app.listen(0, () => resolve(listening));
  });
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/month-coverage`;
  const cases: Array<[string, string]> = [
    ['GET', '/summary'], ['GET', '/payments/recent'], ['POST', '/payments/preview'], ['POST', '/payments'],
    ['PUT', '/payments/00000000-0000-0000-0000-000000000001'],
    ['GET', '/payments/00000000-0000-0000-0000-000000000001/void-preview'],
    ['DELETE', '/payments/00000000-0000-0000-0000-000000000001'],
    ['POST', '/reminders'], ['GET', '/reports/pending'], ['GET', '/reports/transactions?month=9&year=2026'],
  ];
  try {
    for (const [method, path] of cases) {
      const result = await fetch(`${base}${path}`, { method, headers: { 'Content-Type': 'application/json' }, body: method === 'GET' ? undefined : '{}' });
      assert.equal(result.status, 401, `${method} ${path}`);
    }
  } finally {
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  }
});

for (const surface of ['fees', 'upi'] as const) {
  test(`parent ${surface} surface is disabled before legacy fee access for month-mode institutes`, async () => {
    replaceMethod(prisma.institute, 'findUnique', (async () => ({
      id: 'inst-1', name: 'MathLogs', config: {}, coachingFeeMode: 'MONTH_COVERAGE',
    }) as never) as typeof prisma.institute.findUnique);
    replaceMethod(prisma.student, 'findMany', (async () => assert.fail('parent fee lookup must not read legacy students')) as typeof prisma.student.findMany);
    replaceMethod(prisma.student, 'findFirst', (async () => assert.fail('parent UPI must not read legacy students')) as typeof prisma.student.findFirst);
    const res = response();

    if (surface === 'fees') {
      await getPublicStudentFees({ params: { slug: 'mathlogs' }, query: { phone: '9876543210' } } as never, res as never);
    } else {
      await submitUpiPayment({ params: { slug: 'mathlogs' }, body: {}, file: undefined } as never, res as never);
    }

    assert.equal(res.statusCode, 403);
    assert.deepEqual(res.body, { error: 'PARENT_PAYMENTS_DISABLED_FOR_MONTH_COVERAGE' });
  });
}

test('institute cleanup removes month audit, allocations, payments, and profiles in dependency order', async () => {
  const operations: string[] = [];
  const delegate = (name: string) => ({
    deleteMany: async ({ where }: { where: { instituteId: string } }) => {
      assert.equal(where.instituteId, 'inst-1');
      operations.push(name);
      return { count: 1 };
    },
  });

  await deleteMonthCoverageData({
    monthCoverageAuditEvent: delegate('audit'),
    monthCoverageAllocation: delegate('allocations'),
    monthCoveragePayment: delegate('payments'),
    studentMonthCoverageProfile: delegate('profiles'),
  } as never, 'inst-1');

  assert.deepEqual(operations, ['audit', 'allocations', 'payments', 'profiles']);
});
