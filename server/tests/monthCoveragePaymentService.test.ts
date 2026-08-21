import test from 'node:test';
import assert from 'node:assert/strict';
import { prisma } from '../src/prisma';
import {
  createMonthCoveragePayment,
  previewMonthCoveragePayment,
  prismaMonthCoveragePaymentDeps,
  type CreateMonthCoveragePaymentInput,
  type MonthCoveragePaymentCreateDeps,
  type MonthCoveragePaymentDeps,
  type PreviewMonthCoveragePaymentInput,
} from '../src/services/monthCoveragePaymentService';

function input(overrides: Partial<PreviewMonthCoveragePaymentInput> = {}): PreviewMonthCoveragePaymentInput {
  return {
    instituteId: 'inst-1',
    studentId: 'student-1',
    duration: 'QUARTERLY',
    requestedStartMonth: null,
    allowGap: false,
    now: new Date('2026-09-10T00:00:00.000Z'),
    ...overrides,
  };
}

function fakeDeps(options: {
  feeStartMonth?: string;
  feeEndMonth?: string;
  covered?: string[];
  instituteId?: string;
  status?: 'PENDING_SETUP' | 'ACTIVE' | 'CLOSED';
} = {}): MonthCoveragePaymentDeps {
  return {
    loadStudentContext: async () => ({
      instituteId: options.instituteId ?? 'inst-1',
      batchId: 'batch-1',
      studentId: 'student-1',
      coachingFeeMode: 'MONTH_COVERAGE',
      timezone: 'Asia/Kolkata',
      profile: {
        status: options.status ?? 'ACTIVE',
        feeStartMonth: options.feeStartMonth ?? '2026-07',
        feeEndMonth: options.feeEndMonth ?? '2026-10',
      },
    }),
    listCoveredMonths: async () => options.covered ?? [],
  };
}

test('quarterly preview chooses the oldest three uncovered months', async () => {
  const result = await previewMonthCoveragePayment(input(), fakeDeps());

  assert.deepEqual(result.coverageMonths, ['2026-07', '2026-08', '2026-09']);
  assert.equal(result.oldestPendingMonth, '2026-07');
  assert.equal(result.gapWarning, null);
  assert.equal(result.remainingMonthsAfterPayment, 1);
});

test('automatic preview counts the oldest uncovered months even when coverage has a gap', async () => {
  const result = await previewMonthCoveragePayment(input(), fakeDeps({
    feeEndMonth: '2026-11',
    covered: ['2026-08'],
  }));

  assert.deepEqual(result.coverageMonths, ['2026-07', '2026-09', '2026-10']);
  assert.equal(result.oldestPendingMonth, '2026-07');
  assert.equal(result.gapWarning, null);
  assert.equal(result.remainingMonthsAfterPayment, 1);
});

test('edited start blocks an already covered month', async () => {
  await assert.rejects(
    () => previewMonthCoveragePayment(input({ requestedStartMonth: '2026-09' }), fakeDeps({ covered: ['2026-09'] })),
    /MONTH_ALREADY_COVERED/,
  );
});

test('preview rejects a duration longer than the remaining applicable months', async () => {
  await assert.rejects(
    () => previewMonthCoveragePayment(input({ duration: 'HALF_YEARLY' }), fakeDeps()),
    /INSUFFICIENT_REMAINING_MONTHS/,
  );
});

test('edited start must stay inside the student fee period', async () => {
  await assert.rejects(
    () => previewMonthCoveragePayment(input({ duration: 'MONTHLY', requestedStartMonth: '2026-06' }), fakeDeps()),
    /COVERAGE_START_OUT_OF_RANGE/,
  );
});

test('edited start rejects a skipped oldest month unless the teacher allows the gap', async () => {
  await assert.rejects(
    () => previewMonthCoveragePayment(input({ duration: 'MONTHLY', requestedStartMonth: '2026-09' }), fakeDeps()),
    /COVERAGE_GAP_REQUIRES_CONFIRMATION/,
  );

  const allowed = await previewMonthCoveragePayment(
    input({ duration: 'MONTHLY', requestedStartMonth: '2026-09', allowGap: true }),
    fakeDeps(),
  );
  assert.deepEqual(allowed.coverageMonths, ['2026-09']);
  assert.deepEqual(allowed.gapWarning, { skippedMonths: ['2026-07', '2026-08'] });
});

test('preview rejects foreign and pending-setup student contexts', async () => {
  await assert.rejects(
    () => previewMonthCoveragePayment(input(), fakeDeps({ instituteId: 'inst-2' })),
    /STUDENT_NOT_FOUND/,
  );
  await assert.rejects(
    () => previewMonthCoveragePayment(input(), fakeDeps({ status: 'PENDING_SETUP' })),
    /PROFILE_NOT_ACTIVE/,
  );
});

function createInput(overrides: Partial<CreateMonthCoveragePaymentInput> = {}): CreateMonthCoveragePaymentInput {
  return {
    instituteId: 'inst-1',
    actorId: 'teacher-1',
    studentId: 'student-1',
    amountRupees: 1000.25,
    paymentDate: new Date('2026-09-10T00:00:00.000Z'),
    paymentMethod: 'UPI',
    duration: 'QUARTERLY',
    requestedStartMonth: null,
    allowGap: false,
    note: 'September collection',
    idempotencyKey: 'payment-attempt-1',
    ...overrides,
  };
}

function createDeps(options: { uniqueAllocationConflict?: boolean; concurrentIdempotencyConflict?: boolean } = {}) {
  const writes: Array<{ operation: string; data: unknown }> = [];
  let existing: Awaited<ReturnType<MonthCoveragePaymentCreateDeps['findPaymentByIdempotency']>> = null;
  let transactionCalls = 0;
  const previewDeps = fakeDeps();
  const deps: MonthCoveragePaymentCreateDeps = {
    ...previewDeps,
    loadActor: async () => ({ id: 'teacher-1', instituteId: 'inst-1' }),
    findPaymentByIdempotency: async () => existing,
    runSerializable: async operation => {
      transactionCalls += 1;
      return operation({
        ...previewDeps,
        findPaymentByIdempotency: async () => existing,
        createPayment: async data => {
          if (options.concurrentIdempotencyConflict) {
            existing = {
              id: 'payment-winner', instituteId: data.instituteId, batchId: data.batchId, studentId: data.studentId,
              amountPaise: data.amountPaise, paymentDate: data.paymentDate, paymentMethod: data.paymentMethod,
              duration: data.duration, note: data.note, status: 'ACTIVE', idempotencyKey: data.idempotencyKey,
              createdById: data.createdById, coverageMonths: ['2026-07', '2026-08', '2026-09'],
            };
            throw { code: 'P2002', meta: { target: ['instituteId', 'idempotencyKey'] } };
          }
          writes.push({ operation: 'payment', data });
          existing = {
            id: 'payment-1',
            instituteId: data.instituteId,
            batchId: data.batchId,
            studentId: data.studentId,
            amountPaise: data.amountPaise,
            paymentDate: data.paymentDate,
            paymentMethod: data.paymentMethod,
            duration: data.duration,
            note: data.note,
            status: 'ACTIVE',
            idempotencyKey: data.idempotencyKey,
            createdById: data.createdById,
          };
          return existing;
        },
        createAllocations: async data => {
          if (options.uniqueAllocationConflict) throw { code: 'P2002', meta: { target: ['studentId', 'coverageMonth'] } };
          writes.push({ operation: 'allocations', data });
        },
        createAuditEvent: async data => { writes.push({ operation: 'audit', data }); },
      });
    },
  };
  return { deps, writes, transactionCalls: () => transactionCalls };
}

test('create converts rupees to paise and writes payment allocations and audit atomically', async () => {
  const { deps, writes, transactionCalls } = createDeps();

  const result = await createMonthCoveragePayment(createInput(), deps);

  assert.equal(transactionCalls(), 1);
  assert.equal(result.idempotent, false);
  assert.equal(result.payment.amountPaise, 100025);
  assert.deepEqual(result.coverageMonths, ['2026-07', '2026-08', '2026-09']);
  assert.deepEqual(writes.map(write => write.operation), ['payment', 'allocations', 'audit']);
  assert.deepEqual((writes[1].data as { coverageMonths: string[] }).coverageMonths, ['2026-07', '2026-08', '2026-09']);
  assert.equal((writes[2].data as { action: string }).action, 'CREATE');
});

test('reusing an institute idempotency key returns the original payment without a second transaction', async () => {
  const { deps, writes, transactionCalls } = createDeps();

  const first = await createMonthCoveragePayment(createInput(), deps);
  const second = await createMonthCoveragePayment(createInput(), deps);

  assert.equal(first.payment.id, second.payment.id);
  assert.equal(second.idempotent, true);
  assert.equal(transactionCalls(), 1);
  assert.deepEqual(writes.map(write => write.operation), ['payment', 'allocations', 'audit']);
});

test('a concurrent idempotency-key winner is reloaded after the unique conflict', async () => {
  const { deps, writes, transactionCalls } = createDeps({ concurrentIdempotencyConflict: true });

  const result = await createMonthCoveragePayment(createInput(), deps);

  assert.equal(result.payment.id, 'payment-winner');
  assert.equal(result.idempotent, true);
  assert.deepEqual(result.coverageMonths, ['2026-07', '2026-08', '2026-09']);
  assert.equal(transactionCalls(), 1);
  assert.deepEqual(writes, []);
});

test('allocation uniqueness conflicts map to a stable already-covered error', async () => {
  const { deps } = createDeps({ uniqueAllocationConflict: true });

  await assert.rejects(() => createMonthCoveragePayment(createInput(), deps), /MONTH_ALREADY_COVERED/);
});

test('cross-institute students fail before starting a write transaction', async () => {
  const { deps, writes, transactionCalls } = createDeps();
  deps.loadStudentContext = async () => ({
    instituteId: 'inst-2', batchId: 'batch-2', studentId: 'student-1', coachingFeeMode: 'MONTH_COVERAGE',
    timezone: 'Asia/Kolkata', profile: { status: 'ACTIVE', feeStartMonth: '2026-07', feeEndMonth: '2026-10' },
  });

  await assert.rejects(() => createMonthCoveragePayment(createInput(), deps), /STUDENT_NOT_FOUND/);
  assert.equal(transactionCalls(), 0);
  assert.deepEqual(writes, []);
});

test('the Prisma repository executes payment work at serializable isolation', async () => {
  const originalTransaction = prisma.$transaction;
  let isolationLevel: string | undefined;
  prisma.$transaction = (async (operation: (tx: typeof prisma) => Promise<unknown>, options?: { isolationLevel?: string }) => {
    isolationLevel = options?.isolationLevel;
    return operation(prisma);
  }) as typeof prisma.$transaction;

  try {
    const result = await prismaMonthCoveragePaymentDeps.runSerializable(async () => 'committed');
    assert.equal(result, 'committed');
    assert.equal(isolationLevel, 'Serializable');
  } finally {
    prisma.$transaction = originalTransaction;
  }
});
