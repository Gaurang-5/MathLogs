import { randomUUID } from 'node:crypto';
import { prisma } from '../src/prisma';
import {
  buildEnrollmentBackfillPlan,
  type EnrollmentEvidence,
} from '../src/domain/enrollments/backfill';

async function main() {
  const students = await prisma.student.findMany({
    where: { instituteId: { not: null } },
    select: {
      id: true,
      instituteId: true,
      batchId: true,
      status: true,
      createdAt: true,
      leftAt: true,
      monthCoverageProfile: { select: { batchId: true, instituteId: true } },
      feeInstallments: { select: { batchId: true, batch: { select: { instituteId: true } } } },
      feePayments: { select: { installment: { select: { batchId: true, batch: { select: { instituteId: true } } } } } },
      marks: {
        select: {
          test: {
            select: {
              batchId: true,
              instituteId: true,
              batches: { select: { id: true, instituteId: true } },
            },
          },
        },
      },
    },
  });

  const evidenceByStudent: Record<string, EnrollmentEvidence[]> = {};
  for (const student of students) {
    const evidence: EnrollmentEvidence[] = [];
    if (student.monthCoverageProfile) {
      evidence.push({
        batchId: student.monthCoverageProfile.batchId,
        instituteId: student.monthCoverageProfile.instituteId,
        kind: 'MONTH_PROFILE',
      });
    }
    for (const installment of student.feeInstallments) {
      if (installment.batch.instituteId) evidence.push({ batchId: installment.batchId, instituteId: installment.batch.instituteId, kind: 'INSTALLMENT' });
    }
    for (const payment of student.feePayments) {
      const installment = payment.installment;
      if (installment.batch.instituteId) evidence.push({ batchId: installment.batchId, instituteId: installment.batch.instituteId, kind: 'PAYMENT' });
    }
    for (const mark of student.marks) {
      const testBatches = mark.test.batches.length > 0
        ? mark.test.batches
        : mark.test.batchId && mark.test.instituteId
          ? [{ id: mark.test.batchId, instituteId: mark.test.instituteId }]
          : [];
      for (const batch of testBatches) {
        if (batch.instituteId) evidence.push({ batchId: batch.id, instituteId: batch.instituteId, kind: 'TEST' });
      }
    }
    evidenceByStudent[student.id] = evidence;
  }

  const plan = buildEnrollmentBackfillPlan({
    students: students.map(student => ({
      id: student.id,
      instituteId: student.instituteId!,
      batchId: student.batchId,
      status: student.status,
      createdAt: student.createdAt,
      leftAt: student.leftAt,
    })),
    evidenceByStudent,
  });

  let created = 0;
  let feeRowsLinked = 0;
  const duplicateActiveConflicts: string[] = [];

  for (const planned of plan.enrollments) {
    const existing = await prisma.enrollment.findFirst({
      where: {
        studentId: planned.studentId,
        batchId: planned.batchId,
        status: planned.status,
        startedAt: planned.startedAt,
      },
    });
    if (existing) continue;

    try {
      const enrollment = await prisma.enrollment.create({
        data: {
          id: randomUUID(),
          instituteId: planned.instituteId,
          studentId: planned.studentId,
          batchId: planned.batchId,
          status: planned.status,
          startedAt: planned.startedAt,
          endedAt: planned.endedAt,
          endReason: planned.endReason,
        },
      });
      created += 1;

      const [profile, payments, allocations] = await prisma.$transaction([
        prisma.studentMonthCoverageProfile.updateMany({
          where: { studentId: planned.studentId, batchId: planned.batchId, enrollmentId: null },
          data: { enrollmentId: enrollment.id },
        }),
        prisma.monthCoveragePayment.updateMany({
          where: { studentId: planned.studentId, batchId: planned.batchId, enrollmentId: null },
          data: { enrollmentId: enrollment.id },
        }),
        prisma.monthCoverageAllocation.updateMany({
          where: { studentId: planned.studentId, batchId: planned.batchId, enrollmentId: null },
          data: { enrollmentId: enrollment.id },
        }),
      ]);
      feeRowsLinked += profile.count + payments.count + allocations.count;
    } catch (error: any) {
      if (error?.code === 'P2002' && planned.status === 'ACTIVE') {
        duplicateActiveConflicts.push(planned.studentId);
        continue;
      }
      throw error;
    }
  }

  const report = {
    sourceStudents: students.length,
    plannedEnrollments: plan.enrollments.length,
    created,
    feeRowsLinked,
    unresolved: plan.unresolved,
    crossTenantRows: plan.crossTenantRows,
    duplicateActiveConflicts,
  };
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  if (report.unresolved.length || report.crossTenantRows.length || duplicateActiveConflicts.length) {
    process.exitCode = 2;
  }
}

main()
  .catch(error => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
