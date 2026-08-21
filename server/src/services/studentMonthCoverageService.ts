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
  createPendingProfile(input: PendingProfileWrite): Promise<StudentMonthCoverageProfile>;
  activateProfile(input: ActiveProfileWrite): Promise<StudentMonthCoverageProfile>;
  closeProfile(input: ClosedProfileWrite): Promise<StudentMonthCoverageProfile>;
  now?(): Date;
};

export const prismaStudentMonthCoverageDeps: StudentMonthCoverageDeps = {
  async findStudent(instituteId, studentId) {
    return prisma.student.findFirst({
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

  createPendingProfile(input) {
    return prisma.studentMonthCoverageProfile.upsert({
      where: { studentId: input.studentId },
      create: input,
      update: {},
    });
  },

  activateProfile(input) {
    const { confirmedAt, confirmedById, ...profile } = input;
    return prisma.studentMonthCoverageProfile.upsert({
      where: { studentId: input.studentId },
      create: {
        ...profile,
        status: 'ACTIVE',
        confirmedAt,
        confirmedById,
      },
      update: {
        batchId: input.batchId,
        feeStartMonth: input.feeStartMonth,
        feeEndMonth: input.feeEndMonth,
        status: 'ACTIVE',
        confirmedAt,
        confirmedById,
      },
    });
  },

  closeProfile(input) {
    return prisma.studentMonthCoverageProfile.update({
      where: { studentId: input.studentId },
      data: {
        batchId: input.batchId,
        feeEndMonth: input.feeEndMonth,
        status: 'CLOSED',
      },
    });
  },

  now: () => new Date(),
};

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

export async function createPendingStudentFeeProfile(
  input: CreatePendingStudentFeeProfileInput,
  deps: StudentMonthCoverageDeps = prismaStudentMonthCoverageDeps,
): Promise<StudentMonthCoverageProfile> {
  const { student, batchId } = await loadValidatedStudent(input.instituteId, input.studentId, deps);
  return deps.createPendingProfile({
    instituteId: input.instituteId,
    batchId,
    studentId: student.id,
    feeStartMonth: null,
    feeEndMonth: null,
    status: 'PENDING_SETUP',
  });
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

  const joinedMonth = currentMonthInTimezone(student.createdAt, timezone);
  const warning = compareMonths(input.feeStartMonth, joinedMonth) < 0 ? 'BACKDATED_BEFORE_JOIN' : null;
  const profile = await deps.activateProfile({
    instituteId: input.instituteId,
    batchId,
    studentId: student.id,
    feeStartMonth: input.feeStartMonth,
    feeEndMonth: batchEndMonth,
    confirmedAt: nowFrom(deps),
    confirmedById: input.actorId,
  });

  return { profile, warning };
}

export async function closeStudentFeeProfile(
  input: CloseStudentFeeProfileInput,
  deps: StudentMonthCoverageDeps = prismaStudentMonthCoverageDeps,
): Promise<StudentMonthCoverageProfile> {
  const { student, batchId, timezone, batchEndMonth } = await loadValidatedStudent(input.instituteId, input.studentId, deps);
  const leaveAt = input.leaveAt ?? student.leftAt ?? nowFrom(deps);
  const leaveMonth = currentMonthInTimezone(leaveAt, timezone);
  const feeEndMonth = compareMonths(leaveMonth, batchEndMonth) > 0 ? batchEndMonth : leaveMonth;

  return deps.closeProfile({
    instituteId: input.instituteId,
    batchId,
    studentId: student.id,
    feeEndMonth,
  });
}
