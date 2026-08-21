import type { MonthCoverageDuration } from '../domain/monthCoverage/types';
import { MonthCoverageError } from '../domain/monthCoverage/types';
import { compareMonths, currentMonthInTimezone, enumerateMonths } from '../domain/monthCoverage/calendar';
import { prisma } from '../prisma';

export type MonthCoverageSummaryStudentSource = {
  studentId: string;
  name: string;
  batchId: string;
  batchName: string;
  profileStatus: 'PENDING_SETUP' | 'ACTIVE' | 'CLOSED';
  feeStartMonth: string | null;
  feeEndMonth: string | null;
  allocations: Array<{ coverageMonth: string; paymentStatus: 'ACTIVE' | 'VOID' }>;
  payments: Array<{
    id: string;
    amountPaise: number;
    paymentDate: Date;
    duration: MonthCoverageDuration;
    status: 'ACTIVE' | 'VOID';
    coverageMonths: string[];
  }>;
};

export type MonthCoverageSummaryDeps = {
  loadInstitute(instituteId: string): Promise<{
    id: string;
    coachingFeeMode: 'CURRENT_DUE_BASED' | 'MONTH_COVERAGE';
    timezone: string;
    teacherName: string | null;
  } | null>;
  loadStudents(input: {
    instituteId: string;
    teacherId?: string;
    batchId?: string;
    status?: string;
  }): Promise<MonthCoverageSummaryStudentSource[]>;
  countBatches(instituteId: string, teacherId?: string): Promise<number>;
};

export type StudentMonthMetrics = {
  applicableMonths: number;
  receivedMonths: number;
  pendingMonths: number;
  overdueMonths: number;
  nextPendingMonth: string | null;
  oldestOverdueMonth: string | null;
  progressPercent: number;
};

export type MonthCoverageStudentSummary = StudentMonthMetrics & {
  studentId: string;
  name: string;
  batchId: string;
  batchName: string;
  setupRequired: boolean;
  feeStartMonth: string | null;
  feeEndMonth: string | null;
};

export type MonthCoveragePaymentSummary = {
  id: string;
  studentId: string;
  studentName: string;
  batchName: string;
  amountRupees: number;
  paymentDate: string;
  duration: MonthCoverageDuration;
  coverageMonths: string[];
};

export type MonthCoverageTotals = {
  collectedRupees: number;
  receivedMonths: number;
  pendingMonths: number;
  overdueMonths: number;
  applicableMonths: number;
  progressPercent: number;
};

export type MonthCoverageSummaryResponse = {
  feeMode: 'MONTH_COVERAGE';
  totals: MonthCoverageTotals;
  students: MonthCoverageStudentSummary[];
  recentPayments: MonthCoveragePaymentSummary[];
};

export function summarizeStudent(input: {
  feeStartMonth: string;
  feeEndMonth: string;
  coveredMonths: string[];
  currentMonth: string;
}): StudentMonthMetrics {
  const applicable = enumerateMonths(input.feeStartMonth, input.feeEndMonth);
  const applicableSet = new Set(applicable);
  const covered = new Set(input.coveredMonths.filter(month => applicableSet.has(month)));
  const pending = applicable.filter(month => !covered.has(month));
  const overdue = pending.filter(month => compareMonths(month, input.currentMonth) <= 0);
  return {
    applicableMonths: applicable.length,
    receivedMonths: covered.size,
    pendingMonths: pending.length,
    overdueMonths: overdue.length,
    nextPendingMonth: pending[0] ?? null,
    oldestOverdueMonth: overdue[0] ?? null,
    progressPercent: applicable.length === 0 ? 0 : Math.round((covered.size / applicable.length) * 100),
  };
}

export type MonthCoverageSummaryQuery = {
  instituteId: string;
  teacherId?: string;
  batchId?: string;
  status?: string;
  now: Date;
};

const emptyMetrics: StudentMonthMetrics = {
  applicableMonths: 0,
  receivedMonths: 0,
  pendingMonths: 0,
  overdueMonths: 0,
  nextPendingMonth: null,
  oldestOverdueMonth: null,
  progressPercent: 0,
};

export async function getMonthCoverageSummary(
  query: MonthCoverageSummaryQuery,
  deps: MonthCoverageSummaryDeps = prismaMonthCoverageSummaryDeps,
): Promise<MonthCoverageSummaryResponse> {
  const institute = await deps.loadInstitute(query.instituteId);
  if (!institute || institute.id !== query.instituteId) throw new MonthCoverageError('INSTITUTE_NOT_FOUND');
  if (institute.coachingFeeMode !== 'MONTH_COVERAGE') throw new MonthCoverageError('FEE_MODE_MISMATCH');
  const currentMonth = currentMonthInTimezone(query.now, institute.timezone);
  const sources = await deps.loadStudents(query);

  const students = sources.map(source => {
    const setupRequired = source.profileStatus === 'PENDING_SETUP' || !source.feeStartMonth || !source.feeEndMonth;
    const activeCoveredMonths = source.allocations
      .filter(allocation => allocation.paymentStatus === 'ACTIVE')
      .map(allocation => allocation.coverageMonth);
    const metrics = setupRequired ? emptyMetrics : summarizeStudent({
      feeStartMonth: source.feeStartMonth!,
      feeEndMonth: source.feeEndMonth!,
      coveredMonths: activeCoveredMonths,
      currentMonth,
    });
    return {
      studentId: source.studentId,
      name: source.name,
      batchId: source.batchId,
      batchName: source.batchName,
      setupRequired,
      feeStartMonth: source.feeStartMonth,
      feeEndMonth: source.feeEndMonth,
      ...metrics,
    };
  });

  const countedStudents = students.filter(student => !student.setupRequired);
  const activePayments = sources.flatMap(source => source.payments
    .filter(payment => payment.status === 'ACTIVE')
    .map(payment => ({ source, payment })));
  const totalsBase = countedStudents.reduce((totals, student) => ({
    receivedMonths: totals.receivedMonths + student.receivedMonths,
    pendingMonths: totals.pendingMonths + student.pendingMonths,
    overdueMonths: totals.overdueMonths + student.overdueMonths,
    applicableMonths: totals.applicableMonths + student.applicableMonths,
  }), { receivedMonths: 0, pendingMonths: 0, overdueMonths: 0, applicableMonths: 0 });
  const collectedPaise = activePayments.reduce((sum, entry) => sum + entry.payment.amountPaise, 0);
  const totals: MonthCoverageTotals = {
    collectedRupees: collectedPaise / 100,
    ...totalsBase,
    progressPercent: totalsBase.applicableMonths === 0
      ? 0
      : Math.round((totalsBase.receivedMonths / totalsBase.applicableMonths) * 100),
  };
  const recentPayments = activePayments
    .sort((left, right) => right.payment.paymentDate.getTime() - left.payment.paymentDate.getTime())
    .slice(0, 20)
    .map(({ source, payment }) => ({
      id: payment.id,
      studentId: source.studentId,
      studentName: source.name,
      batchName: source.batchName,
      amountRupees: payment.amountPaise / 100,
      paymentDate: payment.paymentDate.toISOString(),
      duration: payment.duration,
      coverageMonths: [...payment.coverageMonths],
    }));

  return { feeMode: 'MONTH_COVERAGE', totals, students, recentPayments };
}

export async function getMonthCoverageDashboard(
  instituteId: string,
  teacherId: string,
  now: Date,
  deps: MonthCoverageSummaryDeps = prismaMonthCoverageSummaryDeps,
) {
  const summary = await getMonthCoverageSummary({ instituteId, teacherId, now }, deps);
  const institute = await deps.loadInstitute(instituteId);
  const batches = await deps.countBatches(instituteId, teacherId);
  return {
    feeMode: 'MONTH_COVERAGE' as const,
    stats: { batches, students: summary.students.length },
    monthCoverage: summary.totals,
    followUps: summary.students
      .filter(student => !student.setupRequired && student.overdueMonths > 0 && student.oldestOverdueMonth)
      .map(student => ({
        studentId: student.studentId,
        name: student.name,
        batchName: student.batchName,
        overdueMonths: student.overdueMonths,
        oldestOverdueMonth: student.oldestOverdueMonth!,
      })),
    userName: institute?.teacherName ?? '',
  };
}

export const prismaMonthCoverageSummaryDeps: MonthCoverageSummaryDeps = {
  loadInstitute(instituteId) {
    return prisma.institute.findUnique({
      where: { id: instituteId },
      select: { id: true, coachingFeeMode: true, timezone: true, teacherName: true },
    });
  },

  async loadStudents(input) {
    const profileFilter = {
      ...(input.teacherId ? { batch: { teacherId: input.teacherId } } : {}),
      ...(input.status ? { status: input.status as never } : {}),
    };
    const rows = await prisma.student.findMany({
      where: {
        instituteId: input.instituteId,
        ...(input.batchId ? { batchId: input.batchId } : {}),
        ...(input.teacherId || input.status ? { monthCoverageProfile: { is: profileFilter } } : {}),
      },
      select: {
        id: true,
        name: true,
        monthCoverageProfile: {
          select: {
            status: true,
            feeStartMonth: true,
            feeEndMonth: true,
            batch: { select: { id: true, name: true } },
          },
        },
        monthCoverageAllocations: {
          select: { coverageMonth: true, payment: { select: { status: true } } },
        },
        monthCoveragePayments: {
          select: {
            id: true,
            amountPaise: true,
            paymentDate: true,
            duration: true,
            status: true,
            allocations: { select: { coverageMonth: true }, orderBy: { coverageMonth: 'asc' } },
          },
        },
      },
      orderBy: { name: 'asc' },
    });
    return rows.flatMap(row => {
      const profile = row.monthCoverageProfile;
      if (!profile) return [];
      return [{
        studentId: row.id,
        name: row.name,
        batchId: profile.batch.id,
        batchName: profile.batch.name,
        profileStatus: profile.status,
        feeStartMonth: profile.feeStartMonth,
        feeEndMonth: profile.feeEndMonth,
        allocations: row.monthCoverageAllocations.map(allocation => ({
          coverageMonth: allocation.coverageMonth,
          paymentStatus: allocation.payment.status,
        })),
        payments: row.monthCoveragePayments.map(payment => ({
          id: payment.id,
          amountPaise: payment.amountPaise,
          paymentDate: payment.paymentDate,
          duration: payment.duration,
          status: payment.status,
          coverageMonths: payment.allocations.map(allocation => allocation.coverageMonth),
        })),
      }];
    });
  },

  countBatches(instituteId, teacherId) {
    return prisma.batch.count({ where: { instituteId, ...(teacherId ? { teacherId } : {}) } });
  },
};
