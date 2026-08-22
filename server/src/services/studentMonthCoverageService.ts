import type { StudentMonthCoverageProfile } from '@prisma/client';
import { prisma } from '../prisma';
import {
  compareMonths,
  currentMonthInTimezone,
  validateFeePeriod,
} from '../domain/monthCoverage/calendar';
import { MonthCoverageError } from '../domain/monthCoverage/types';

export type StudentMonthCoverageStudent = {
  id: string;
  instituteId: string | null;
  batchId: string | null;
  createdAt: Date;
  leftAt: Date | null;
  institute: {
    id: string;
    coachingFeeMode: 'CURRENT_DUE_BASED' | 'MONTH_COVERAGE';
    timezone: string;
  } | null;
  batch: {
    id: string;
    instituteId: string | null;
    startDate: Date | null;
    endDate: Date | null;
  } | null;
};

type PendingProfileWrite = {
  instituteId: string;
  batchId: string;
  studentId: string;
  feeStartMonth: null;
  feeEndMonth: null;
  status: 'PENDING_SETUP';
};

type ActiveProfileWrite = {
  instituteId: string;
  batchId: string;
  studentId: string;
  feeStartMonth: string;
  feeEndMonth: string;
  confirmedAt: Date;
  confirmedById: string;
};

type ClosedProfileWrite = {
  instituteId: string;
  batchId: string;
  studentId: string;
  feeEndMonth: string;
};

export type StudentMonthCoverageDeps = {
  findStudent(instituteId: string, studentId: string): Promise<StudentMonthCoverageStudent | null>;
  findActor(instituteId: string, actorId: string): Promise<{ id: string; instituteId: string | null } | null>;
  findProfile(studentId: string): Promise<StudentMonthCoverageProfile | null>;
  createPendingProfile(input: PendingProfileWrite): Promise<StudentMonthCoverageProfile>;
  activateProfile(input: ActiveProfileWrite): Promise<StudentMonthCoverageProfile>;
  closeProfile(input: ClosedProfileWrite): Promise<StudentMonthCoverageProfile | null>;
  now?(): Date;
};

type StudentMonthCoveragePrismaClient = Pick<typeof prisma, 'student' | 'admin' | 'studentMonthCoverageProfile'>;

export function studentMonthCoverageDepsFor(client: StudentMonthCoveragePrismaClient): StudentMonthCoverageDeps {
  return {
    async findStudent(instituteId, studentId) {
      return client.student.findFirst({
        where: {
          id: studentId,
          instituteId,
          batch: { is: { instituteId } },
        },
        select: {
          id: true,
          instituteId: true,
          batchId: true,
          createdAt: true,
          leftAt: true,
          institute: {
            select: { id: true, coachingFeeMode: true, timezone: true },
          },
          batch: {
            select: { id: true, instituteId: true, startDate: true, endDate: true },
          },
        },
      });
    },

    async findActor(instituteId, actorId) {
      return client.admin.findFirst({
        where: { id: actorId, instituteId },
        select: { id: true, instituteId: true },
      });
    },

    findProfile(studentId) {
      return client.studentMonthCoverageProfile.findUnique({ where: { studentId } });
    },

    createPendingProfile(input) {
      return client.studentMonthCoverageProfile.create({ data: input });
    },

    async activateProfile(input) {
      const updated = await client.studentMonthCoverageProfile.updateMany({
        where: {
          studentId: input.studentId,
          instituteId: input.instituteId,
          batchId: input.batchId,
        },
        data: {
          feeStartMonth: input.feeStartMonth,
          feeEndMonth: input.feeEndMonth,
          status: 'ACTIVE',
          confirmedAt: input.confirmedAt,
          confirmedById: input.confirmedById,
        },
      });
      if (updated.count === 1) {
        const profile = await client.studentMonthCoverageProfile.findFirst({
          where: {
            studentId: input.studentId,
            instituteId: input.instituteId,
            batchId: input.batchId,
          },
        });
        if (profile) return profile;
        throw new MonthCoverageError('PROFILE_NOT_FOUND');
      }

      return client.studentMonthCoverageProfile.create({
        data: {
          ...input,
          status: 'ACTIVE',
        },
      });
    },

    async closeProfile(input) {
      const updated = await client.studentMonthCoverageProfile.updateMany({
        where: {
          studentId: input.studentId,
          instituteId: input.instituteId,
          batchId: input.batchId,
        },
        data: {
          feeEndMonth: input.feeEndMonth,
          status: 'CLOSED',
        },
      });
      if (updated.count !== 1) return null;
      return client.studentMonthCoverageProfile.findFirst({
        where: {
          studentId: input.studentId,
          instituteId: input.instituteId,
          batchId: input.batchId,
        },
      });
    },

    now: () => new Date(),
  };
}

export const prismaStudentMonthCoverageDeps = studentMonthCoverageDepsFor(prisma);

export type CreatePendingStudentFeeProfileInput = {
  instituteId: string;
  studentId: string;
};

export type ConfirmStudentFeeProfileInput = {
  instituteId: string;
  studentId: string;
  feeStartMonth: string;
  actorId: string;
};

export type ActivateStudentFeeProfileAutomaticallyInput = {
  instituteId: string;
  studentId: string;
  actorId: string;
};

export type CloseStudentFeeProfileInput = {
  instituteId: string;
  studentId: string;
  leaveAt?: Date;
};

type ValidatedStudentContext = {
  student: StudentMonthCoverageStudent;
  batchId: string;
  timezone: string;
  batchStartMonth: string;
  batchEndMonth: string;
};

function nowFrom(deps: StudentMonthCoverageDeps): Date {
  return (deps.now ?? (() => new Date()))();
}

function validateStudentContext(
  student: StudentMonthCoverageStudent | null,
  instituteId: string,
): ValidatedStudentContext {
  if (!student || student.instituteId !== instituteId) throw new MonthCoverageError('STUDENT_NOT_FOUND');
  if (!student.institute || student.institute.id !== instituteId) throw new MonthCoverageError('INSTITUTE_NOT_FOUND');
  if (student.institute.coachingFeeMode !== 'MONTH_COVERAGE') throw new MonthCoverageError('FEE_MODE_MISMATCH');
  if (!student.batch || student.batch.instituteId !== instituteId) throw new MonthCoverageError('BATCH_NOT_FOUND');
  if (!student.batch.startDate || !student.batch.endDate) throw new MonthCoverageError('BATCH_DATES_REQUIRED');
  if (student.batch.startDate.getTime() > student.batch.endDate.getTime()) {
    throw new MonthCoverageError('INVALID_BATCH_DATE_RANGE');
  }

  const batchStartMonth = currentMonthInTimezone(student.batch.startDate, student.institute.timezone);
  const batchEndMonth = currentMonthInTimezone(student.batch.endDate, student.institute.timezone);
  validateFeePeriod(batchStartMonth, batchEndMonth);
  return {
    student,
    batchId: student.batch.id,
    timezone: student.institute.timezone,
    batchStartMonth,
    batchEndMonth,
  };
}

async function loadValidatedStudent(
  instituteId: string,
  studentId: string,
  deps: StudentMonthCoverageDeps,
): Promise<ValidatedStudentContext> {
  return validateStudentContext(await deps.findStudent(instituteId, studentId), instituteId);
}

function assertProfileContext(
  profile: StudentMonthCoverageProfile,
  context: Pick<ValidatedStudentContext, 'batchId'>,
  instituteId: string,
  studentId: string,
): void {
  if (
    profile.instituteId !== instituteId
    || profile.batchId !== context.batchId
    || profile.studentId !== studentId
  ) {
    throw new MonthCoverageError('PROFILE_CONTEXT_MISMATCH');
  }
}

async function loadProfileInContext(
  context: Pick<ValidatedStudentContext, 'batchId'>,
  instituteId: string,
  studentId: string,
  deps: StudentMonthCoverageDeps,
): Promise<StudentMonthCoverageProfile | null> {
  const profile = await deps.findProfile(studentId);
  if (profile) assertProfileContext(profile, context, instituteId, studentId);
  return profile;
}

function isUniqueProfileConflict(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === 'P2002';
}

export async function createPendingStudentFeeProfile(
  input: CreatePendingStudentFeeProfileInput,
  deps: StudentMonthCoverageDeps = prismaStudentMonthCoverageDeps,
): Promise<StudentMonthCoverageProfile> {
  const { student, batchId } = await loadValidatedStudent(input.instituteId, input.studentId, deps);
  const existing = await loadProfileInContext({ batchId }, input.instituteId, student.id, deps);
  if (existing) return existing;
  const profileWrite: PendingProfileWrite = {
    instituteId: input.instituteId,
    batchId,
    studentId: student.id,
    feeStartMonth: null,
    feeEndMonth: null,
    status: 'PENDING_SETUP',
  };

  try {
    const profile = await deps.createPendingProfile(profileWrite);
    assertProfileContext(profile, { batchId }, input.instituteId, student.id);
    return profile;
  } catch (error) {
    if (!isUniqueProfileConflict(error)) throw error;
    const concurrentProfile = await loadProfileInContext({ batchId }, input.instituteId, student.id, deps);
    if (!concurrentProfile) throw error;
    return concurrentProfile;
  }
}

export async function confirmStudentFeeProfile(
  input: ConfirmStudentFeeProfileInput,
  deps: StudentMonthCoverageDeps = prismaStudentMonthCoverageDeps,
): Promise<{ profile: StudentMonthCoverageProfile; warning: 'BACKDATED_BEFORE_JOIN' | null }> {
  const { student, batchId, timezone, batchStartMonth, batchEndMonth } = await loadValidatedStudent(
    input.instituteId,
    input.studentId,
    deps,
  );

  if (compareMonths(input.feeStartMonth, batchStartMonth) < 0 || compareMonths(input.feeStartMonth, batchEndMonth) > 0) {
    throw new MonthCoverageError('FEE_START_OUT_OF_RANGE');
  }

  const actor = await deps.findActor(input.instituteId, input.actorId);
  if (!actor || actor.id !== input.actorId || actor.instituteId !== input.instituteId) {
    throw new MonthCoverageError('ACTOR_NOT_AUTHORIZED');
  }
  await loadProfileInContext({ batchId }, input.instituteId, student.id, deps);

  const joinedMonth = currentMonthInTimezone(student.createdAt, timezone);
  const warning = compareMonths(input.feeStartMonth, joinedMonth) < 0 ? 'BACKDATED_BEFORE_JOIN' : null;
  const profileWrite: ActiveProfileWrite = {
    instituteId: input.instituteId,
    batchId,
    studentId: student.id,
    feeStartMonth: input.feeStartMonth,
    feeEndMonth: batchEndMonth,
    confirmedAt: nowFrom(deps),
    confirmedById: input.actorId,
  };
  let profile: StudentMonthCoverageProfile;
  try {
    profile = await deps.activateProfile(profileWrite);
  } catch (error) {
    if (!isUniqueProfileConflict(error)) throw error;
    const concurrentProfile = await loadProfileInContext({ batchId }, input.instituteId, student.id, deps);
    if (!concurrentProfile) throw error;
    profile = await deps.activateProfile(profileWrite);
  }
  assertProfileContext(profile, { batchId }, input.instituteId, student.id);

  return { profile, warning };
}

export async function activateStudentFeeProfileAutomatically(
  input: ActivateStudentFeeProfileAutomaticallyInput,
  deps: StudentMonthCoverageDeps = prismaStudentMonthCoverageDeps,
): Promise<{ profile: StudentMonthCoverageProfile; warning: 'BACKDATED_BEFORE_JOIN' | null }> {
  const context = await loadValidatedStudent(input.instituteId, input.studentId, deps);
  const joinedMonth = currentMonthInTimezone(context.student.createdAt, context.timezone);
  const feeStartMonth = compareMonths(joinedMonth, context.batchStartMonth) < 0
    ? context.batchStartMonth
    : joinedMonth;

  return confirmStudentFeeProfile({ ...input, feeStartMonth }, deps);
}

export async function closeStudentFeeProfile(
  input: CloseStudentFeeProfileInput,
  deps: StudentMonthCoverageDeps = prismaStudentMonthCoverageDeps,
): Promise<StudentMonthCoverageProfile> {
  const { student, batchId, timezone, batchEndMonth } = await loadValidatedStudent(input.instituteId, input.studentId, deps);
  const existing = await loadProfileInContext({ batchId }, input.instituteId, student.id, deps);
  if (!existing) throw new MonthCoverageError('PROFILE_NOT_FOUND');
  const leaveAt = input.leaveAt ?? student.leftAt ?? nowFrom(deps);
  const leaveMonth = currentMonthInTimezone(leaveAt, timezone);
  const feeEndMonth = compareMonths(leaveMonth, batchEndMonth) > 0 ? batchEndMonth : leaveMonth;

  const profile = await deps.closeProfile({
    instituteId: input.instituteId,
    batchId,
    studentId: student.id,
    feeEndMonth,
  });
  if (!profile) throw new MonthCoverageError('PROFILE_NOT_FOUND');
  assertProfileContext(profile, { batchId }, input.instituteId, student.id);
  return profile;
}
