import type { Prisma } from '@prisma/client';
import { prisma } from '../prisma';
import { normalizeIdentityPhone } from '../domain/enrollments/identity';
import type { EnrollmentResult } from '../domain/enrollments/types';
import { getCourseCode, getInstituteCode } from '../utils/studentIds';
import { applyEnrollmentFees } from './enrollmentFeeService';
import { createEnrollmentService } from './enrollmentService';
import { createIdentityReviewService } from './identityReviewService';
import { enrollmentFeeDepsFor, transactionAdapter } from './prismaEnrollmentService';

function resultFromJson(value: Prisma.JsonValue): EnrollmentResult {
  return value as unknown as EnrollmentResult;
}

export function identityReviewServiceFor(prisma: Prisma.TransactionClient | typeof import('../prisma').prisma) {
return createIdentityReviewService({
  async findCandidates({ instituteId, submittedData }) {
    const phone = normalizeIdentityPhone(submittedData.parentWhatsapp);
    return prisma.student.findMany({
      where: {
        instituteId,
        OR: [
          ...(phone.length >= 7 ? [{ parentWhatsapp: { contains: phone } }] : []),
          {
            name: { equals: submittedData.name.trim(), mode: 'insensitive' },
            parentName: { equals: submittedData.parentName.trim(), mode: 'insensitive' },
          },
        ],
      },
      select: { id: true },
      take: 25,
    });
  },
  async findPendingReview({ instituteId, batchId, submittedData }) {
    const candidates = await prisma.studentIdentityReview.findMany({
      where: { instituteId, batchId, status: 'PENDING' },
      select: { id: true, submittedData: true },
      orderBy: { createdAt: 'desc' },
      take: 20,
    });
    const phone = normalizeIdentityPhone(submittedData.parentWhatsapp);
    return candidates.find(row => {
      const saved = row.submittedData as Record<string, unknown>;
      return (saved.enrollmentIntent as any)?.nonce === submittedData.enrollmentIntent?.nonce
        && normalizeIdentityPhone(String(saved.parentWhatsapp || '')) === phone
        && String(saved.name || '').trim().toLocaleLowerCase() === submittedData.name.trim().toLocaleLowerCase();
    }) || null;
  },
  createReview(input) {
    return prisma.studentIdentityReview.create({
      data: {
        instituteId: input.instituteId,
        batchId: input.batchId,
        submittedData: input.submittedData as unknown as Prisma.InputJsonValue,
        candidateStudentIds: input.candidateStudentIds,
      },
    }) as any;
  },
  findReview(reviewId) {
    return prisma.studentIdentityReview.findUnique({ where: { id: reviewId } }) as any;
  },
  findStudent(studentId, instituteId) {
    return prisma.student.findFirst({ where: { id: studentId, instituteId }, select: { id: true } });
  },
  async markResolved(input) {
    await prisma.studentIdentityReview.update({
      where: { id: input.reviewId },
      data: {
        status: input.status,
        resolvedStudentId: input.studentId,
        resolvedById: input.actorId,
        resolvedAt: new Date(),
      },
    });
  },
  enrollExisting: input => createEnrollmentService({ runTransaction: operation => '$transaction' in prisma ? prisma.$transaction(tx => operation(transactionAdapter(tx))) : operation(transactionAdapter(prisma)) }).enrollExistingStudent(input),
  async createNewAndEnroll(input) {
    const run = async (tx: Prisma.TransactionClient) => {
      const replay = await tx.enrollmentAction.findUnique({
        where: { instituteId_idempotencyKey: { instituteId: input.instituteId, idempotencyKey: input.idempotencyKey } },
      });
      if (replay) return resultFromJson(replay.result);

      const review = await tx.studentIdentityReview.findFirst({
        where: { id: input.review.id, instituteId: input.instituteId, status: 'PENDING' },
      });
      if (!review) throw new Error('IDENTITY_REVIEW_NOT_FOUND');
      const batch = await tx.batch.findFirst({
        where: { id: review.batchId, instituteId: input.instituteId },
        include: { institute: { select: { name: true } } },
      });
      if (!batch?.institute) throw new Error('BATCH_NOT_FOUND');
      const submitted = review.submittedData as Record<string, any>;
      const year = (batch.createdAt || new Date()).getFullYear().toString().slice(-2);
      const prefix = `${getInstituteCode(batch.institute.name)}-${getCourseCode(batch.subject || '')}${year}`;
      const counter = await tx.idCounter.upsert({
        where: { prefix }, update: { seq: { increment: 1 } }, create: { prefix, seq: 1 },
      });
      const student = await tx.student.create({
        data: {
          instituteId: input.instituteId,
          batchId: batch.id,
          status: 'APPROVED',
          humanId: `${prefix}-${counter.seq.toString().padStart(3, '0')}`,
          name: String(submitted.name),
          parentName: String(submitted.parentName),
          parentWhatsapp: normalizeIdentityPhone(String(submitted.parentWhatsapp)),
          parentEmail: submitted.parentEmail || null,
          schoolName: submitted.schoolName || null,
          additionalData: (submitted.additionalData || {}) as Prisma.InputJsonValue,
        },
      });
      const enrollment = await tx.enrollment.create({
        data: {
          instituteId: input.instituteId,
          studentId: student.id,
          batchId: batch.id,
          startedAt: input.startedAt,
          createdById: input.actorId,
        },
      });
      await applyEnrollmentFees(enrollment, input.fee, enrollmentFeeDepsFor(tx));
      const result: EnrollmentResult = {
        outcome: 'CREATED', enrollmentId: enrollment.id,
        notificationEventKey: `enrollment:${enrollment.id}:ADDED`,
      };
      await tx.enrollmentAction.create({
        data: {
          instituteId: input.instituteId,
          enrollmentId: enrollment.id,
          idempotencyKey: input.idempotencyKey,
          action: 'IDENTITY_REVIEW_CREATE_NEW',
          result: result as unknown as Prisma.InputJsonValue,
        },
      });
      await tx.studentIdentityReview.update({
        where: { id: review.id },
        data: {
          status: 'RESOLVED_NEW', resolvedStudentId: student.id,
          resolvedById: input.actorId, resolvedAt: new Date(),
        },
      });
      return result;
    };
    return '$transaction' in prisma ? prisma.$transaction(run) : run(prisma);
  },
});
}

export const prismaIdentityReviewService = identityReviewServiceFor(prisma);
