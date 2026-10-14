import { prisma } from '../prisma';
import { enrollmentLifecycleTemplate, type EnrollmentLifecycleTemplate } from '../utils/whatsapp';

type NotificationStatus = 'QUEUED' | 'ALREADY_QUEUED' | 'FAILED_RETRYABLE';
type StoredJob = { id: string; status: string; eventKey: string | null };
type EnrollmentNotificationRow = {
  id: string; instituteId: string; studentName: string; recipient: string; batchName: string;
  startedAt: Date; endedAt: Date | null; endReason: string | null; feeSummary: string;
  instituteName: string;
};
type NotificationDeps = {
  loadEnrollment(id: string): Promise<EnrollmentNotificationRow | null>;
  findJob(eventKey: string): Promise<StoredJob | null>;
  createJob(input: {
    recipient: string; templateId: string; data: string[]; instituteId: string; eventKey: string;
  }): Promise<StoredJob>;
  requeueJob(id: string): Promise<boolean>;
};

export type EnrollmentNotificationResult = { status: NotificationStatus; jobId?: string; eventKey: string };

function displayDate(date: Date) {
  return new Intl.DateTimeFormat('en-IN', { dateStyle: 'medium', timeZone: 'Asia/Kolkata' }).format(date);
}

export function createEnrollmentNotificationService(deps: NotificationDeps) {
  async function enqueue(input: { enrollmentId: string; type: EnrollmentLifecycleTemplate; eventKey: string }): Promise<EnrollmentNotificationResult> {
    try {
      const existing = await deps.findJob(input.eventKey);
      if (existing) return { status: 'ALREADY_QUEUED', jobId: existing.id, eventKey: input.eventKey };
      const enrollment = await deps.loadEnrollment(input.enrollmentId);
      if (!enrollment) return { status: 'FAILED_RETRYABLE', eventKey: input.eventKey };
      const effectiveDate = displayDate(input.type === 'REMOVED' ? enrollment.endedAt || new Date() : enrollment.startedAt);
      const data = input.type === 'REMOVED'
        ? [enrollment.studentName, enrollment.batchName, effectiveDate, enrollment.endReason || 'Not specified', enrollment.instituteName]
        : [enrollment.studentName, enrollment.batchName, effectiveDate, enrollment.feeSummary, enrollment.instituteName];
      const job = await deps.createJob({
        recipient: enrollment.recipient.replace(/\D/g, '').replace(/^(\d{10})$/, '91$1'),
        templateId: enrollmentLifecycleTemplate(input.type),
        data,
        instituteId: enrollment.instituteId,
        eventKey: input.eventKey,
      });
      return { status: 'QUEUED', jobId: job.id, eventKey: input.eventKey };
    } catch {
      const existing = await deps.findJob(input.eventKey).catch(() => null);
      if (existing) return { status: 'ALREADY_QUEUED', jobId: existing.id, eventKey: input.eventKey };
      return { status: 'FAILED_RETRYABLE', eventKey: input.eventKey };
    }
  }

  return {
    enqueue,
    async retry(input: { eventKey: string }): Promise<EnrollmentNotificationResult> {
      const existing = await deps.findJob(input.eventKey);
      if (!existing) return { status: 'FAILED_RETRYABLE', eventKey: input.eventKey };
      if (existing.status !== 'FAILED') return { status: 'ALREADY_QUEUED', jobId: existing.id, eventKey: input.eventKey };
      const updated = await deps.requeueJob(existing.id);
      return updated
        ? { status: 'QUEUED', jobId: existing.id, eventKey: input.eventKey }
        : { status: 'FAILED_RETRYABLE', jobId: existing.id, eventKey: input.eventKey };
    },
    resend(input: { enrollmentId: string; idempotencyKey: string }) {
      return enqueue({
        enrollmentId: input.enrollmentId,
        type: 'READDED',
        eventKey: `enrollment:${input.enrollmentId}:RESEND:${input.idempotencyKey}`,
      });
    },
  };
}

export const enrollmentNotificationService = createEnrollmentNotificationService({
  async loadEnrollment(id) {
    const row = await prisma.enrollment.findUnique({
      where: { id },
      select: {
        id: true, instituteId: true, startedAt: true, endedAt: true, endReason: true,
        student: { select: { name: true, parentWhatsapp: true } },
        batch: { select: { name: true } },
        institute: { select: { name: true, coachingFeeMode: true } },
        monthCoverageProfile: { select: { feeStartMonth: true } },
        actions: { select: { id: true }, take: 1 },
      },
    });
    if (!row) return null;
    const feeSummary = row.institute.coachingFeeMode === 'MONTH_COVERAGE'
      ? `Fees start ${row.monthCoverageProfile?.feeStartMonth || 'as selected'}`
      : 'Selected installments applied';
    return {
      id: row.id, instituteId: row.instituteId, studentName: row.student.name,
      recipient: row.student.parentWhatsapp, batchName: row.batch.name, startedAt: row.startedAt,
      endedAt: row.endedAt, endReason: row.endReason, feeSummary, instituteName: row.institute.name,
    };
  },
  findJob(eventKey) {
    return prisma.whatsappJob.findUnique({ where: { eventKey }, select: { id: true, status: true, eventKey: true } });
  },
  createJob(input) {
    return prisma.whatsappJob.create({ data: { ...input, status: 'PENDING' }, select: { id: true, status: true, eventKey: true } });
  },
  async requeueJob(id) {
    const result = await prisma.whatsappJob.updateMany({
      where: { id, status: 'FAILED' },
      data: { status: 'PENDING', attempts: 0, error: null },
    });
    return result.count === 1;
  },
});
