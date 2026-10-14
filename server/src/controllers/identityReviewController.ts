import type { Request, Response } from 'express';
import { prisma } from '../prisma';
import { identityReviewServiceFor } from '../services/prismaIdentityReviewService';
import { enrollmentNotificationService } from '../services/enrollmentNotificationService';

function fail(res: Response, error: unknown) {
  const code = error instanceof Error ? error.message : 'IDENTITY_REVIEW_OPERATION_FAILED';
  return res.status(code.includes('NOT_FOUND') ? 404 : code.includes('RESOLVED') ? 409 : 400)
    .json({ success: false, error: code });
}

export async function listIdentityReviews(req: Request, res: Response) {
  const rows = await prisma.studentIdentityReview.findMany({
    where: { instituteId: req.user.instituteId, status: 'PENDING' },
    include: {
      batch: { select: { id: true, name: true, startDate: true, endDate: true, feeInstallments: { select: { id: true, name: true, amount: true, studentId: true } } } },
      institute: { select: { coachingFeeMode: true } },
    },
    orderBy: { createdAt: 'asc' },
  });
  const candidateIds = [...new Set(rows.flatMap(row => row.candidateStudentIds as string[]))];
  const students = await prisma.student.findMany({
    where: { instituteId: req.user.instituteId, id: { in: candidateIds } },
    select: { id: true, humanId: true, name: true, parentName: true, parentWhatsapp: true, schoolName: true },
  });
  const byId = new Map(students.map(student => [student.id, student]));
  return res.json({
    success: true,
    data: rows.map(row => ({ ...row, candidates: (row.candidateStudentIds as string[]).map(id => byId.get(id)).filter(Boolean) })),
  });
}

export async function resolveIdentityReview(req: Request, res: Response) {
  try {
    const common = {
      instituteId: req.user.instituteId,
      reviewId: String(req.params.id),
      actorId: req.user.id,
      startedAt: new Date(req.body.startedAt),
      fee: req.body.fee,
      idempotencyKey: req.body.idempotencyKey,
    };
    const data = await prisma.$transaction(async tx => {
      const service = identityReviewServiceFor(tx);
      return req.body.action === 'USE_EXISTING'
        ? service.resolveWithExisting({ ...common, studentId: req.body.studentId })
        : service.resolveAsNew(common);
    }, { isolationLevel: 'Serializable' });
    const eventKey = 'notificationEventKey' in data ? data.notificationEventKey : undefined;
    const parts = eventKey?.split(':') || [];
    const type = eventKey ? parts[parts.length - 1] as 'ADDED' | 'READDED' : null;
    const notification = type && eventKey
      ? await enrollmentNotificationService.enqueue({ enrollmentId: data.enrollmentId, type, eventKey })
      : undefined;
    return res.json({ success: true, data: { ...data, notification } });
  } catch (error) {
    return fail(res, error);
  }
}
