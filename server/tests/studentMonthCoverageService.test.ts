import test from 'node:test';
import assert from 'node:assert/strict';
import type { StudentMonthCoverageProfile } from '@prisma/client';
import { MonthCoverageError } from '../src/domain/monthCoverage/types';
import {
  closeStudentFeeProfile,
  confirmStudentFeeProfile,
  createPendingStudentFeeProfile,
  type StudentMonthCoverageDeps,
} from '../src/services/studentMonthCoverageService';

const institute = {
  id: 'inst-1',
  coachingFeeMode: 'MONTH_COVERAGE' as const,
  timezone: 'Asia/Kolkata',
};

function studentFixture(overrides: {
  createdAt?: Date;
  startDate?: Date | null;
  endDate?: Date | null;
} = {}) {
  return {
    id: 'student-1',
    instituteId: 'inst-1',
    batchId: 'batch-1',
    createdAt: overrides.createdAt ?? new Date('2026-06-20T00:00:00.000Z'),
    leftAt: null,
    institute,
    batch: {
      id: 'batch-1',
      instituteId: 'inst-1',
      startDate: overrides.startDate === undefined ? new Date('2026-07-01T00:00:00.000Z') : overrides.startDate,
      endDate: overrides.endDate === undefined ? new Date('2026-12-31T00:00:00.000Z') : overrides.endDate,
    },
  };
}

function profile(input: Partial<StudentMonthCoverageProfile>): StudentMonthCoverageProfile {
  return {
    id: 'profile-1',
    instituteId: 'inst-1',
    batchId: 'batch-1',
    studentId: 'student-1',
    feeStartMonth: null,
    feeEndMonth: null,
    status: 'PENDING_SETUP',
    confirmedAt: null,
    confirmedById: null,
    createdAt: new Date('2026-06-20T00:00:00.000Z'),
    updatedAt: new Date('2026-06-20T00:00:00.000Z'),
    ...input,
  };
}

function depsFor(student = studentFixture()) {
  const writes: Array<Record<string, unknown>> = [];
  const deps: StudentMonthCoverageDeps = {
    findStudent: async () => student,
    createPendingProfile: async (input) => {
      writes.push({ operation: 'pending', ...input });
      return profile({
        feeStartMonth: input.feeStartMonth,
        feeEndMonth: input.feeEndMonth,
        status: input.status,
      });
    },
    activateProfile: async (input) => {
      writes.push({ operation: 'active', ...input });
      return profile({
        feeStartMonth: input.feeStartMonth,
        feeEndMonth: input.feeEndMonth,
        status: 'ACTIVE',
        confirmedAt: input.confirmedAt,
        confirmedById: input.confirmedById,
      });
    },
    closeProfile: async (input) => {
      writes.push({ operation: 'closed', ...input });
      return profile({
        feeStartMonth: '2026-07',
        feeEndMonth: input.feeEndMonth,
        status: 'CLOSED',
      });
    },
    now: () => new Date('2026-07-05T00:00:00.000Z'),
  };
  return { deps, writes };
}

test('confirms a pre-batch student with the batch start fee month', async () => {
  const { deps } = depsFor();

  const result = await confirmStudentFeeProfile({
    instituteId: 'inst-1', studentId: 'student-1', feeStartMonth: '2026-07', actorId: 'teacher-1',
  }, deps);

  assert.equal(result.profile.feeStartMonth, '2026-07');
  assert.equal(result.profile.feeEndMonth, '2026-12');
  assert.equal(result.warning, null);
});

test('confirms a post-start student with the joining fee month', async () => {
  const { deps } = depsFor(studentFixture({ createdAt: new Date('2026-08-15T00:00:00.000Z') }));

  const result = await confirmStudentFeeProfile({
    instituteId: 'inst-1', studentId: 'student-1', feeStartMonth: '2026-08', actorId: 'teacher-1',
  }, deps);

  assert.equal(result.profile.feeStartMonth, '2026-08');
  assert.equal(result.warning, null);
});

test('allows backdating to batch start and reports that it predates joining', async () => {
  const { deps } = depsFor(studentFixture({ createdAt: new Date('2026-08-15T00:00:00.000Z') }));

  const result = await confirmStudentFeeProfile({
    instituteId: 'inst-1', studentId: 'student-1', feeStartMonth: '2026-07', actorId: 'teacher-1',
  }, deps);

  assert.equal(result.warning, 'BACKDATED_BEFORE_JOIN');
});

test('rejects a fee start before the batch start', async () => {
  const { deps } = depsFor();

  await assert.rejects(
    () => confirmStudentFeeProfile({
      instituteId: 'inst-1', studentId: 'student-1', feeStartMonth: '2026-06', actorId: 'teacher-1',
    }, deps),
    (error: unknown) => error instanceof MonthCoverageError && error.code === 'FEE_START_OUT_OF_RANGE',
  );
});

test('rejects profile confirmation for a current-due institute', async () => {
  const student = studentFixture();
  student.institute = { ...student.institute, coachingFeeMode: 'CURRENT_DUE_BASED' };
  const { deps } = depsFor(student);

  await assert.rejects(
    () => confirmStudentFeeProfile({
      instituteId: 'inst-1', studentId: 'student-1', feeStartMonth: '2026-07', actorId: 'teacher-1',
    }, deps),
    (error: unknown) => error instanceof MonthCoverageError && error.code === 'FEE_MODE_MISMATCH',
  );
});

test('rejects profile confirmation without complete batch dates', async () => {
  const { deps } = depsFor(studentFixture({ endDate: null }));

  await assert.rejects(
    () => confirmStudentFeeProfile({
      instituteId: 'inst-1', studentId: 'student-1', feeStartMonth: '2026-07', actorId: 'teacher-1',
    }, deps),
    (error: unknown) => error instanceof MonthCoverageError && error.code === 'BATCH_DATES_REQUIRED',
  );
});

test('self-registered students receive a pending setup profile with no fee period', async () => {
  const { deps, writes } = depsFor();

  const result = await createPendingStudentFeeProfile({ instituteId: 'inst-1', studentId: 'student-1' }, deps);

  assert.equal(result.status, 'PENDING_SETUP');
  assert.equal(result.feeStartMonth, null);
  assert.equal(result.feeEndMonth, null);
  assert.deepEqual(writes, [{
    operation: 'pending', instituteId: 'inst-1', batchId: 'batch-1', studentId: 'student-1',
    feeStartMonth: null, feeEndMonth: null, status: 'PENDING_SETUP',
  }]);
});

test('confirmation activates a profile and records the teacher and confirmation time', async () => {
  const { deps } = depsFor();

  const result = await confirmStudentFeeProfile({
    instituteId: 'inst-1', studentId: 'student-1', feeStartMonth: '2026-07', actorId: 'teacher-1',
  }, deps);

  assert.equal(result.profile.status, 'ACTIVE');
  assert.equal(result.profile.confirmedById, 'teacher-1');
  assert.deepEqual(result.profile.confirmedAt, new Date('2026-07-05T00:00:00.000Z'));
});

test('closing a profile caps the leave month at the batch end', async () => {
  const { deps } = depsFor();

  const result = await closeStudentFeeProfile({
    instituteId: 'inst-1', studentId: 'student-1', leaveAt: new Date('2027-02-04T00:00:00.000Z'),
  }, deps);

  assert.equal(result.feeEndMonth, '2026-12');
  assert.equal(result.status, 'CLOSED');
});

test('does not load a student outside the requested institute', async () => {
  const { deps } = depsFor({ ...studentFixture(), instituteId: 'inst-2' });

  await assert.rejects(
    () => confirmStudentFeeProfile({
      instituteId: 'inst-1', studentId: 'student-1', feeStartMonth: '2026-07', actorId: 'teacher-1',
    }, deps),
    (error: unknown) => error instanceof MonthCoverageError && error.code === 'STUDENT_NOT_FOUND',
  );
});
