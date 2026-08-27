import type { Prisma } from '@prisma/client';
import { prisma } from '../prisma';
import { currentMonthInTimezone } from '../domain/monthCoverage/calendar';
import type { EnrollmentFeeChoice, EnrollmentResult } from '../domain/enrollments/types';
import { createEnrollmentService, type EnrollmentServiceTx } from './enrollmentService';
import { applyEnrollmentFees, type EnrollmentFeeDeps } from './enrollmentFeeService';

function feeDeps(tx: Prisma.TransactionClient): EnrollmentFeeDeps {
  return {
    async loadContext(context) {
      const [student, batch] = await Promise.all([
        tx.student.findFirst({ where: { id: context.studentId, instituteId: context.instituteId }, select: { id: true } }),
        tx.batch.findFirst({
          where: { id: context.batchId, instituteId: context.instituteId },
          select: {
            startDate: true,
            endDate: true,
            institute: { select: { coachingFeeMode: true, timezone: true } },
            feeInstallments: { select: { id: true, amount: true } },
          },
        }),
      ]);
      if (!student || !batch?.institute) return null;
      return {
        feeMode: batch.institute.coachingFeeMode,
        batchStartMonth: batch.startDate ? currentMonthInTimezone(batch.startDate, batch.institute.timezone) : null,
        batchEndMonth: batch.endDate ? currentMonthInTimezone(batch.endDate, batch.institute.timezone) : null,
        installments: batch.feeInstallments,
      };
    },
    async createMonthProfile(input) {
      const batch = await tx.batch.findUnique({
        where: { id: input.batchId },
        select: { endDate: true, institute: { select: { timezone: true } } },
      });
      if (!batch?.endDate || !batch.institute) throw new Error('BATCH_DATES_REQUIRED');
      await tx.studentMonthCoverageProfile.create({
        data: {
          enrollmentId: input.enrollmentId,
          instituteId: input.instituteId,
          batchId: input.batchId,
          studentId: input.studentId,
          feeStartMonth: input.feeStartMonth,
          feeEndMonth: currentMonthInTimezone(batch.endDate, batch.institute.timezone),
          status: 'ACTIVE',
          confirmedAt: new Date(),
        },
      });
    },
    async assignInstallments(studentId, installmentIds) {
      if (installmentIds.length === 0) return [];
      await tx.feeInstallmentAssignment.createMany({
        data: installmentIds.map(installmentId => ({ studentId, installmentId })),
        skipDuplicates: true,
      });
      return installmentIds;
    },
  };
}

function transactionAdapter(tx: Prisma.TransactionClient): EnrollmentServiceTx {
  return {
    async findAction(instituteId, idempotencyKey) {
      const row = await tx.enrollmentAction.findUnique({
        where: { instituteId_idempotencyKey: { instituteId, idempotencyKey } },
        select: { result: true },
      });
      return row?.result as EnrollmentResult | null;
    },
    async saveAction(instituteId, idempotencyKey, action, result, enrollmentId) {
      await tx.enrollmentAction.create({
        data: {
          instituteId,
          idempotencyKey,
          action,
          result: result as unknown as Prisma.InputJsonValue,
          enrollmentId,
        },
      });
    },
    findStudent(id, instituteId) {
      return tx.student.findFirst({ where: { id, instituteId }, select: { id: true, instituteId: true } }) as any;
    },
    findBatch(id, instituteId) {
      return tx.batch.findFirst({ where: { id, instituteId }, select: { id: true, instituteId: true } }) as any;
    },
    findActiveEnrollment(studentId, batchId) {
      return tx.enrollment.findFirst({ where: { studentId, batchId, status: 'ACTIVE' } }) as any;
    },
    async hasEndedEnrollment(studentId, batchId) {
      return (await tx.enrollment.count({ where: { studentId, batchId, status: 'ENDED' } })) > 0;
    },
    createEnrollment(input) {
      return tx.enrollment.create({ data: input }) as any;
    },
    async applyFees(enrollment, choice: EnrollmentFeeChoice) {
      await applyEnrollmentFees(enrollment, choice, feeDeps(tx));
    },
    findEnrollment(id) {
      return tx.enrollment.findUnique({ where: { id } }) as any;
    },
    endEnrollment(id, input) {
      return tx.enrollment.update({ where: { id }, data: { status: 'ENDED', ...input } }) as any;
    },
    async closeMonthCoverageProfile(enrollmentId, endedAt) {
      const profile = await tx.studentMonthCoverageProfile.findUnique({
        where: { enrollmentId },
        select: { institute: { select: { timezone: true } } },
      });
      if (!profile) return;
      await tx.studentMonthCoverageProfile.update({
        where: { enrollmentId },
        data: {
          status: 'CLOSED',
          feeEndMonth: currentMonthInTimezone(endedAt, profile.institute.timezone),
        },
      });
    },
    async historyCounts(instituteId, studentId) {
      const [enrollments, marks, quizzes, feeRecords, feePayments, feeAssignments, monthPayments, upi] = await Promise.all([
        tx.enrollment.count({ where: { instituteId, studentId } }),
        tx.mark.count({ where: { studentId } }),
        tx.quizSubmission.count({ where: { studentId } }),
        tx.feeRecord.count({ where: { studentId } }),
        tx.feePayment.count({ where: { studentId } }),
        tx.feeInstallmentAssignment.count({ where: { studentId } }),
        tx.monthCoveragePayment.count({ where: { studentId } }),
        tx.upiPaymentVerification.count({ where: { studentId } }),
      ]);
      return {
        enrollments,
        marks,
        quizzes,
        fees: feeRecords + feePayments + feeAssignments + monthPayments,
        operational: upi,
      };
    },
    async auditAndDeleteStudent(input) {
      const student = await tx.student.findFirst({ where: { id: input.studentId, instituteId: input.instituteId } });
      if (!student) throw new Error('STUDENT_NOT_FOUND');
      await tx.studentDeletionAudit.create({
        data: {
          instituteId: input.instituteId,
          studentId: input.studentId,
          actorAdminId: input.actorId,
          reason: input.reason,
          snapshot: student as unknown as Prisma.InputJsonValue,
        },
      });
      await tx.student.delete({ where: { id: input.studentId } });
    },
  };
}

export const prismaEnrollmentService = createEnrollmentService({
  runTransaction: operation => prisma.$transaction(tx => operation(transactionAdapter(tx))),
});
