export type MonthCoverageFeeChoice = {
  mode: 'MONTH_COVERAGE';
  feeStartMonth: string;
};

export type CurrentDueFeeChoice = {
  mode: 'CURRENT_DUE_BASED';
  installmentIds: string[];
};

export type EnrollmentFeeChoice = MonthCoverageFeeChoice | CurrentDueFeeChoice;

export type EnrollExistingStudentCommand = {
  instituteId: string;
  actorId: string;
  studentId: string;
  batchId: string;
  startedAt: Date;
  fee: EnrollmentFeeChoice;
  idempotencyKey: string;
};

export type CreateStudentAndEnrollmentCommand = Omit<
  EnrollExistingStudentCommand,
  'studentId'
> & {
  student: {
    name: string;
    parentName: string;
    parentWhatsapp: string;
    parentEmail?: string | null;
    schoolName?: string | null;
    additionalData?: Record<string, unknown>;
  };
};

export type EndEnrollmentCommand = {
  instituteId: string;
  actorId: string;
  enrollmentId: string;
  endedAt: Date;
  reason: string;
  idempotencyKey: string;
};

export type EnrollmentResult =
  | {
      outcome: 'CREATED' | 'REENROLLED';
      enrollmentId: string;
      notificationEventKey: string;
    }
  | { outcome: 'ALREADY_ENROLLED'; enrollmentId: string }
  | {
      outcome: 'ENDED' | 'ALREADY_ENDED';
      enrollmentId: string;
      notificationEventKey?: string;
    };

export type EnrollmentCandidate = {
  studentId: string;
  humanId: string | null;
  name: string;
  parentName: string;
  parentWhatsapp: string;
  schoolName: string | null;
  currentBatches: Array<{ id: string; name: string }>;
  previousBatches: Array<{ id: string; name: string }>;
  balance: number;
  matchReasons: Array<'HUMAN_ID' | 'PARENT_PHONE' | 'STUDENT_NAME' | 'PARENT_NAME' | 'SCHOOL'>;
};
