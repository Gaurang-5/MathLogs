import type { EnrollmentFeeChoice, EnrollmentResult } from '../domain/enrollments/types';

type SubmittedStudentData = {
  name: string;
  parentName: string;
  parentWhatsapp: string;
  parentEmail?: string | null;
  schoolName?: string | null;
  additionalData?: Record<string, unknown>;
  enrollmentIntent?: { fee: EnrollmentFeeChoice; nonce: string };
};

type ReviewRow = {
  id: string;
  instituteId: string;
  batchId: string;
  status: 'PENDING' | 'RESOLVED_EXISTING' | 'RESOLVED_NEW' | 'REJECTED';
  submittedData: unknown;
};

type IdentityReviewDeps = {
  findCandidates(input: { instituteId: string; submittedData: SubmittedStudentData }): Promise<Array<{ id: string }>>;
  findPendingReview(input: { instituteId: string; batchId: string; submittedData: SubmittedStudentData }): Promise<{ id: string } | null>;
  createReview(input: {
    instituteId: string; batchId: string; submittedData: SubmittedStudentData; candidateStudentIds: string[];
  }): Promise<ReviewRow>;
  findReview(reviewId: string): Promise<ReviewRow | null>;
  findStudent(studentId: string, instituteId: string): Promise<{ id: string } | null>;
  markResolved(input: { reviewId: string; studentId: string; actorId: string; status: 'RESOLVED_EXISTING' }): Promise<void>;
  createNewAndEnroll?(input: {
    review: ReviewRow; instituteId: string; actorId: string; startedAt: Date;
    fee: EnrollmentFeeChoice; idempotencyKey: string;
  }): Promise<EnrollmentResult>;
  enrollExisting(input: {
    instituteId: string; actorId: string; studentId: string; batchId: string; startedAt: Date;
    fee: EnrollmentFeeChoice; idempotencyKey: string;
  }): Promise<EnrollmentResult>;
};

export function createIdentityReviewService(deps: IdentityReviewDeps) {
  return {
    async reviewPublicRegistration(input: {
      instituteId: string; batchId: string; submittedData: SubmittedStudentData;
    }): Promise<{ code: 'NO_CREDIBLE_MATCH' } | { code: 'IDENTITY_REVIEW_REQUIRED'; reviewId: string }> {
      const candidates = await deps.findCandidates({ instituteId: input.instituteId, submittedData: input.submittedData });
      if (candidates.length === 0) return { code: 'NO_CREDIBLE_MATCH' };
      const pending = await deps.findPendingReview(input);
      if (pending) return { code: 'IDENTITY_REVIEW_REQUIRED', reviewId: pending.id };
      const review = await deps.createReview({
        ...input,
        candidateStudentIds: candidates.map(candidate => candidate.id),
      });
      return { code: 'IDENTITY_REVIEW_REQUIRED', reviewId: review.id };
    },

    async resolveWithExisting(input: {
      instituteId: string; reviewId: string; studentId: string; actorId: string; startedAt: Date;
      fee: EnrollmentFeeChoice; idempotencyKey: string;
    }): Promise<EnrollmentResult> {
      const review = await deps.findReview(input.reviewId);
      if (!review || review.instituteId !== input.instituteId) throw new Error('IDENTITY_REVIEW_NOT_FOUND');
      if (review.status !== 'PENDING') throw new Error('IDENTITY_REVIEW_ALREADY_RESOLVED');
      const student = await deps.findStudent(input.studentId, input.instituteId);
      if (!student) throw new Error('STUDENT_NOT_FOUND');
      const savedIntent = (review.submittedData as SubmittedStudentData).enrollmentIntent;
      const result = await deps.enrollExisting({
        instituteId: input.instituteId,
        actorId: input.actorId,
        studentId: input.studentId,
        batchId: review.batchId,
        startedAt: input.startedAt,
        fee: savedIntent?.fee || input.fee,
        idempotencyKey: input.idempotencyKey,
      });
      await deps.markResolved({ reviewId: review.id, studentId: student.id, actorId: input.actorId, status: 'RESOLVED_EXISTING' });
      return result;
    },

    async resolveAsNew(input: {
      instituteId: string; reviewId: string; actorId: string; startedAt: Date;
      fee: EnrollmentFeeChoice; idempotencyKey: string;
    }): Promise<EnrollmentResult> {
      const review = await deps.findReview(input.reviewId);
      if (!review || review.instituteId !== input.instituteId) throw new Error('IDENTITY_REVIEW_NOT_FOUND');
      if (review.status !== 'PENDING') throw new Error('IDENTITY_REVIEW_ALREADY_RESOLVED');
      if (!deps.createNewAndEnroll) throw new Error('CREATE_NEW_NOT_SUPPORTED');
      return deps.createNewAndEnroll({ ...input, fee: (review.submittedData as SubmittedStudentData).enrollmentIntent?.fee || input.fee, review });
    },
  };
}
