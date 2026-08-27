import type { Request, Response } from 'express';
import { prisma } from '../prisma';
import { previewEnrollmentFees } from '../services/enrollmentFeeService';
import { searchEnrollmentCandidates } from '../services/enrollmentQueryService';
import { enrollmentFeeDepsFor, prismaEnrollmentService } from '../services/prismaEnrollmentService';
import { enrollmentNotificationService } from '../services/enrollmentNotificationService';
import type { EnrollmentResult } from '../domain/enrollments/types';

function failure(res: Response, error: unknown) {
  const code = error instanceof Error ? error.message : 'ENROLLMENT_OPERATION_FAILED';
  const notFound = ['STUDENT_NOT_FOUND', 'BATCH_NOT_FOUND', 'ENROLLMENT_NOT_FOUND', 'ENROLLMENT_FEE_CONTEXT_NOT_FOUND'];
  const conflict = ['ALREADY_ENROLLED', 'STUDENT_NOT_EMPTY'];
  const status = notFound.includes(code) ? 404 : conflict.includes(code) ? 409 : 400;
  return res.status(status).json({ success: false, error: code });
}

async function requireBatch(instituteId: string, batchId: string) {
  const batch = await prisma.batch.findFirst({
    where: { id: batchId, instituteId },
    select: { id: true },
  });
  if (!batch) throw new Error('BATCH_NOT_FOUND');
}

async function enqueueResultNotification(result: EnrollmentResult) {
  if (!('notificationEventKey' in result) || !result.notificationEventKey) return undefined;
  const parts = result.notificationEventKey.split(':');
  const type = parts[parts.length - 1] as 'ADDED' | 'READDED' | 'REMOVED';
  return enrollmentNotificationService.enqueue({
    enrollmentId: result.enrollmentId,
    type,
    eventKey: result.notificationEventKey,
  });
}

async function requireEnrollment(instituteId: string, enrollmentId: string) {
  const enrollment = await prisma.enrollment.findFirst({
    where: { id: enrollmentId, instituteId }, select: { id: true },
  });
  if (!enrollment) throw new Error('ENROLLMENT_NOT_FOUND');
  return enrollment;
}

export async function searchEnrollmentCandidatesController(req: Request, res: Response) {
  try {
    const batchId = String(req.params.batchId);
    await requireBatch(req.user.instituteId, batchId);
    const data = await searchEnrollmentCandidates({
      instituteId: req.user.instituteId,
      batchId,
      query: String(req.query.q || ''),
    }, prisma as any);
    return res.json({ success: true, data });
  } catch (error) {
    return failure(res, error);
  }
}

export async function previewEnrollmentFeesController(req: Request, res: Response) {
  try {
    const batchId = String(req.params.batchId);
    await requireBatch(req.user.instituteId, batchId);
    const data = await previewEnrollmentFees({
      instituteId: req.user.instituteId,
      studentId: req.body.studentId,
      batchId,
    }, req.body.fee, enrollmentFeeDepsFor(prisma));
    return res.json({ success: true, data });
  } catch (error) {
    return failure(res, error);
  }
}

export async function enrollExistingStudentController(req: Request, res: Response) {
  try {
    const data = await prismaEnrollmentService.enrollExistingStudent({
      instituteId: req.user.instituteId,
      actorId: req.user.id,
      studentId: req.body.studentId,
      batchId: String(req.params.batchId),
      startedAt: new Date(req.body.startedAt),
      fee: req.body.fee,
      idempotencyKey: req.body.idempotencyKey,
    });
    const notification = await enqueueResultNotification(data);
    return res.status(data.outcome === 'ALREADY_ENROLLED' ? 200 : 201).json({ success: true, data: { ...data, notification } });
  } catch (error) {
    return failure(res, error);
  }
}

export async function endEnrollmentController(req: Request, res: Response) {
  try {
    const enrollment = await prisma.enrollment.findFirst({
      where: {
        id: String(req.params.enrollmentId),
        batchId: String(req.params.batchId),
        instituteId: req.user.instituteId,
      },
      select: { id: true },
    });
    if (!enrollment) throw new Error('ENROLLMENT_NOT_FOUND');
    const data = await prismaEnrollmentService.endEnrollment({
      instituteId: req.user.instituteId,
      actorId: req.user.id,
      enrollmentId: enrollment.id,
      endedAt: req.body.endedAt ? new Date(req.body.endedAt) : new Date(),
      reason: req.body.reason,
      idempotencyKey: req.body.idempotencyKey,
    });
    const notification = await enqueueResultNotification(data);
    return res.json({ success: true, data: { ...data, notification } });
  } catch (error) {
    return failure(res, error);
  }
}

export async function retryEnrollmentNotificationController(req: Request, res: Response) {
  try {
    const enrollmentId = String(req.params.enrollmentId);
    await requireEnrollment(req.user.instituteId, enrollmentId);
    if (!req.body.eventKey.startsWith(`enrollment:${enrollmentId}:`)) {
      return res.status(400).json({ success: false, error: 'NOTIFICATION_EVENT_MISMATCH' });
    }
    const data = await enrollmentNotificationService.retry({ eventKey: req.body.eventKey });
    return res.json({ success: true, data });
  } catch (error) {
    return failure(res, error);
  }
}

export async function resendEnrollmentNotificationController(req: Request, res: Response) {
  try {
    const enrollmentId = String(req.params.enrollmentId);
    await requireEnrollment(req.user.instituteId, enrollmentId);
    const data = await enrollmentNotificationService.resend({
      enrollmentId,
      idempotencyKey: req.body.idempotencyKey,
    });
    return res.json({ success: true, data });
  } catch (error) {
    return failure(res, error);
  }
}

export async function getDeletionEligibilityController(req: Request, res: Response) {
  try {
    const data = await prismaEnrollmentService.getPermanentDeletionEligibility({
      instituteId: req.user.instituteId,
      studentId: String(req.params.studentId),
    });
    return res.json({ success: true, data });
  } catch (error) {
    return failure(res, error);
  }
}

export async function deleteEmptyStudentController(req: Request, res: Response) {
  try {
    const studentId = String(req.params.studentId);
    const student = await prisma.student.findFirst({
      where: { id: studentId, instituteId: req.user.instituteId },
      select: { humanId: true, name: true },
    });
    if (!student) throw new Error('STUDENT_NOT_FOUND');
    const expected = `DELETE ${student.humanId || student.name}`;
    if (req.body.confirmation !== expected) {
      return res.status(400).json({ success: false, error: 'DELETION_CONFIRMATION_MISMATCH', expected });
    }
    await prismaEnrollmentService.deleteEmptyStudent({
      instituteId: req.user.instituteId,
      actorId: req.user.id,
      studentId,
      reason: req.body.reason,
    });
    return res.status(204).send();
  } catch (error) {
    return failure(res, error);
  }
}
