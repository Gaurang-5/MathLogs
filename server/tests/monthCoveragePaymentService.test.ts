import test from 'node:test';
import assert from 'node:assert/strict';
import { prisma } from '../src/prisma';
import {
  createMonthCoveragePayment,
  previewVoidMonthCoveragePayment,
  previewMonthCoveragePayment,
  prismaMonthCoveragePaymentDeps,
  updateMonthCoveragePayment,
  voidMonthCoveragePayment,
  type CreateMonthCoveragePaymentInput,
  type MonthCoveragePaymentCorrectionDeps,
  type MonthCoveragePaymentCreateDeps,
  type MonthCoveragePaymentDeps,
  type PreviewMonthCoveragePaymentInput,
  type UpdateMonthCoveragePaymentInput,
  type VoidMonthCoveragePaymentInput,
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

function updateInput(overrides: Partial<UpdateMonthCoveragePaymentInput> = {}): UpdateMonthCoveragePaymentInput {
  return {
    instituteId: 'inst-1', actorId: 'teacher-1', paymentId: 'payment-1', studentId: 'student-1',
    amountRupees: 1200, paymentDate: new Date('2026-10-10T00:00:00.000Z'), paymentMethod: 'CASH',
    duration: 'MONTHLY', requestedStartMonth: '2026-10', allowGap: true, note: 'Corrected', reason: 'Wrong period',
    ...overrides,
  };
}

function correctionDeps(options: { failReplacement?: boolean } = {}) {
  const originalPayment = {
    id: 'payment-1', instituteId: 'inst-1', batchId: 'batch-1', studentId: 'student-1', amountPaise: 100000,
    paymentDate: new Date('2026-09-10T00:00:00.000Z'), paymentMethod: 'UPI', duration: 'QUARTERLY' as const,
    note: 'Original', status: 'ACTIVE' as const, idempotencyKey: 'attempt-1', createdById: 'teacher-1',
    coverageMonths: ['2026-07', '2026-08', '2026-09'],
  };
  let state = { payment: { ...originalPayment, coverageMonths: [...originalPayment.coverageMonths] }, audits: [] as Array<Record<string, unknown>> };
  const context = {
    instituteId: 'inst-1', batchId: 'batch-1', studentId: 'student-1', coachingFeeMode: 'MONTH_COVERAGE' as const,
    timezone: 'Asia/Kolkata', profile: { status: 'ACTIVE' as const, feeStartMonth: '2026-07', feeEndMonth: '2026-12' },
  };
  const deps: MonthCoveragePaymentCorrectionDeps = {
    loadStudentContext: async () => context,
    listCoveredMonths: async () => state.payment.status === 'ACTIVE' ? [...state.payment.coverageMonths] : [],
    loadActor: async () => ({ id: 'teacher-1', instituteId: 'inst-1' }),
    findPaymentByIdempotency: async () => state.payment,
    findPaymentById: async () => state.payment,
    runSerializable: async operation => {
      const draft = {
        payment: { ...state.payment, coverageMonths: [...state.payment.coverageMonths] },
        audits: state.audits.map(audit => ({ ...audit })),
      };
      const tx = {
        loadStudentContext: async () => context,
        listCoveredMonths: async () => draft.payment.status === 'ACTIVE' ? [...draft.payment.coverageMonths] : [],
        findPaymentByIdempotency: async () => draft.payment,
        findPaymentById: async () => draft.payment,
        createPayment: async () => draft.payment,
        updatePayment: async (_paymentId: string, data: Record<string, unknown>) => {
          draft.payment = { ...draft.payment, ...data } as typeof draft.payment;
          return draft.payment;
        },
        voidPayment: async (data: { voidedAt: Date; voidedById: string }) => {
          draft.payment = { ...draft.payment, status: 'VOID', ...data } as typeof draft.payment;
          return draft.payment;
        },
        deleteAllocations: async () => { draft.payment.coverageMonths = []; },
        createAllocations: async (data: { coverageMonths: string[] }) => {
          if (options.failReplacement) throw new Error('replacement failed');
          draft.payment.coverageMonths = [...data.coverageMonths];
        },
        createAuditEvent: async (data: Record<string, unknown>) => { draft.audits.push(data); },
      };
      const result = await operation(tx as never);
      state = draft;
      return result;
    },
  };
  return { deps, getState: () => state };
}

test('editing replaces allocations and writes immutable before and after snapshots', async () => {
  const { deps, getState } = correctionDeps();

  const result = await updateMonthCoveragePayment(updateInput(), deps);

  assert.equal(result.payment.amountPaise, 120000);
  assert.deepEqual(result.coverageMonths, ['2026-10']);
  const audit = getState().audits[0] as { action: string; reason: string; before: { coverageMonths: string[] }; after: { coverageMonths: string[] } };
  assert.equal(audit.action, 'UPDATE');
  assert.equal(audit.reason, 'Wrong period');
  assert.deepEqual(audit.before.coverageMonths, ['2026-07', '2026-08', '2026-09']);
  assert.deepEqual(audit.after.coverageMonths, ['2026-10']);
});

test('editing stores a null audit reason when the teacher omits it', async () => {
  const { deps, getState } = correctionDeps();

  await updateMonthCoveragePayment(updateInput({ reason: undefined }), deps);

  assert.equal(getState().audits[0].reason, null);
});

test('void preview returns the exact active months that will reopen', async () => {
  const { deps } = correctionDeps();

  const result = await previewVoidMonthCoveragePayment({ instituteId: 'inst-1', paymentId: 'payment-1' }, deps);

  assert.deepEqual(result.reopenedMonths, ['2026-07', '2026-08', '2026-09']);
  assert.equal(result.amountRupees, 1000);
});

test('voiding preserves the payment, removes active allocations, and writes a void audit', async () => {
  const { deps, getState } = correctionDeps();
  const input: VoidMonthCoveragePaymentInput = {
    instituteId: 'inst-1', actorId: 'teacher-1', paymentId: 'payment-1', reason: 'Duplicate receipt',
    now: new Date('2026-10-12T00:00:00.000Z'),
  };

  const result = await voidMonthCoveragePayment(input, deps);

  assert.equal(result.payment.status, 'VOID');
  assert.deepEqual(getState().payment.coverageMonths, []);
  assert.equal(getState().audits[0].action, 'VOID');
  assert.deepEqual((getState().audits[0].before as { coverageMonths: string[] }).coverageMonths, ['2026-07', '2026-08', '2026-09']);
});

test('a month reopened by voiding becomes available to the next preview', async () => {
  const { deps } = correctionDeps();
  await voidMonthCoveragePayment({
    instituteId: 'inst-1', actorId: 'teacher-1', paymentId: 'payment-1', now: new Date('2026-10-12T00:00:00.000Z'),
  }, deps);

  const preview = await previewMonthCoveragePayment(input({ duration: 'MONTHLY' }), deps);
  assert.deepEqual(preview.coverageMonths, ['2026-07']);
});

test('failed replacement allocation rolls back the original payment and months', async () => {
  const { deps, getState } = correctionDeps({ failReplacement: true });

  await assert.rejects(() => updateMonthCoveragePayment(updateInput(), deps), /replacement failed/);

  assert.equal(getState().payment.amountPaise, 100000);
  assert.deepEqual(getState().payment.coverageMonths, ['2026-07', '2026-08', '2026-09']);
  assert.deepEqual(getState().audits, []);
});
