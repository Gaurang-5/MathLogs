import type {
  EndEnrollmentCommand,
  EnrollExistingStudentCommand,
  EnrollmentFeeChoice,
  EnrollmentResult,
} from '../domain/enrollments/types';

type EnrollmentRow = {
  id: string;
  instituteId: string;
  studentId: string;
  batchId: string;
  status: 'ACTIVE' | 'ENDED';
};

type HistoryCounts = {
  enrollments: number;
  marks: number;
  quizzes: number;
  fees: number;
  operational: number;
};

export type EnrollmentServiceTx = {
  findAction(instituteId: string, idempotencyKey: string): Promise<EnrollmentResult | null>;
  saveAction(instituteId: string, idempotencyKey: string, action: string, result: EnrollmentResult, enrollmentId?: string): Promise<void>;
  findStudent(id: string, instituteId: string): Promise<{ id: string; instituteId: string } | null>;
  findBatch(id: string, instituteId: string): Promise<{ id: string; instituteId: string } | null>;
  findActiveEnrollment(studentId: string, batchId: string): Promise<EnrollmentRow | null>;
  hasEndedEnrollment(studentId: string, batchId: string): Promise<boolean>;
  createEnrollment(input: {
    instituteId: string; studentId: string; batchId: string; startedAt: Date; createdById: string;
  }): Promise<EnrollmentRow>;
  applyFees(enrollment: EnrollmentRow, fee: EnrollmentFeeChoice): Promise<void>;
  findEnrollment(id: string): Promise<EnrollmentRow | null>;
  endEnrollment(id: string, input: { endedAt: Date; endReason: string; endedById: string }): Promise<EnrollmentRow>;
  closeMonthCoverageProfile(enrollmentId: string, endedAt: Date): Promise<void>;
  historyCounts(instituteId: string, studentId: string): Promise<HistoryCounts>;
  auditAndDeleteStudent(input: {
    instituteId: string; studentId: string; actorId: string; reason: string;
  }): Promise<void>;
};

export type EnrollmentServiceDeps = {
  runTransaction<T>(operation: (tx: EnrollmentServiceTx) => Promise<T>): Promise<T>;
};

export type DeletionEligibility = {
  eligible: boolean;
  blockers: string[];
};

function notificationKey(enrollmentId: string, type: 'ADDED' | 'READDED' | 'REMOVED') {
  return `enrollment:${enrollmentId}:${type}`;
}

export function createEnrollmentService(deps: EnrollmentServiceDeps) {
  return {
    enrollExistingStudent(command: EnrollExistingStudentCommand): Promise<EnrollmentResult> {
      return deps.runTransaction(async tx => {
        const previous = await tx.findAction(command.instituteId, command.idempotencyKey);
        if (previous) return previous;

        const [student, batch] = await Promise.all([
          tx.findStudent(command.studentId, command.instituteId),
          tx.findBatch(command.batchId, command.instituteId),
        ]);
        if (!student) throw new Error('STUDENT_NOT_FOUND');
        if (!batch) throw new Error('BATCH_NOT_FOUND');

        const active = await tx.findActiveEnrollment(command.studentId, command.batchId);
        if (active) {
          const result: EnrollmentResult = { outcome: 'ALREADY_ENROLLED', enrollmentId: active.id };
          await tx.saveAction(command.instituteId, command.idempotencyKey, 'ENROLL', result, active.id);
          return result;
        }

        const rejoining = await tx.hasEndedEnrollment(command.studentId, command.batchId);
        const enrollment = await tx.createEnrollment({
          instituteId: command.instituteId,
          studentId: command.studentId,
          batchId: command.batchId,
          startedAt: command.startedAt,
          createdById: command.actorId,
        });
        await tx.applyFees(enrollment, command.fee);

        const outcome = rejoining ? 'REENROLLED' : 'CREATED';
        const result: EnrollmentResult = {
          outcome,
          enrollmentId: enrollment.id,
          notificationEventKey: notificationKey(enrollment.id, rejoining ? 'READDED' : 'ADDED'),
        };
        await tx.saveAction(command.instituteId, command.idempotencyKey, 'ENROLL', result, enrollment.id);
        return result;
      });
    },

    endEnrollment(command: EndEnrollmentCommand): Promise<EnrollmentResult> {
      return deps.runTransaction(async tx => {
        const reason = command.reason.trim();
        if (reason.length < 3) throw new Error('END_REASON_REQUIRED');
        const previous = await tx.findAction(command.instituteId, command.idempotencyKey);
        if (previous) return previous;

        const enrollment = await tx.findEnrollment(command.enrollmentId);
        if (!enrollment || enrollment.instituteId !== command.instituteId) throw new Error('ENROLLMENT_NOT_FOUND');
        if (enrollment.status === 'ENDED') {
          const result: EnrollmentResult = { outcome: 'ALREADY_ENDED', enrollmentId: enrollment.id };
          await tx.saveAction(command.instituteId, command.idempotencyKey, 'END', result, enrollment.id);
          return result;
        }

        await tx.endEnrollment(enrollment.id, {
          endedAt: command.endedAt,
          endReason: reason,
          endedById: command.actorId,
        });
        await tx.closeMonthCoverageProfile(enrollment.id, command.endedAt);
        const result: EnrollmentResult = {
          outcome: 'ENDED',
          enrollmentId: enrollment.id,
          notificationEventKey: notificationKey(enrollment.id, 'REMOVED'),
        };
        await tx.saveAction(command.instituteId, command.idempotencyKey, 'END', result, enrollment.id);
        return result;
      });
    },

    getPermanentDeletionEligibility(input: { instituteId: string; studentId: string }): Promise<DeletionEligibility> {
      return deps.runTransaction(async tx => {
        const student = await tx.findStudent(input.studentId, input.instituteId);
        if (!student) throw new Error('STUDENT_NOT_FOUND');
        const counts = await tx.historyCounts(input.instituteId, input.studentId);
        const blockers: string[] = [];
        if (counts.enrollments > 0) blockers.push('ENROLLMENT_HISTORY');
        if (counts.marks > 0) blockers.push('ACADEMIC_HISTORY');
        if (counts.quizzes > 0) blockers.push('QUIZ_HISTORY');
        if (counts.fees > 0) blockers.push('FINANCIAL_HISTORY');
        if (counts.operational > 0) blockers.push('OPERATIONAL_HISTORY');
        return { eligible: blockers.length === 0, blockers };
      });
    },

    deleteEmptyStudent(input: { instituteId: string; studentId: string; actorId: string; reason: string }): Promise<void> {
      return deps.runTransaction(async tx => {
        const counts = await tx.historyCounts(input.instituteId, input.studentId);
        if (Object.values(counts).some(count => count > 0)) throw new Error('STUDENT_NOT_EMPTY');
        if (input.reason.trim().length < 3) throw new Error('DELETION_REASON_REQUIRED');
        await tx.auditAndDeleteStudent({ ...input, reason: input.reason.trim() });
      });
    },
  };
}
