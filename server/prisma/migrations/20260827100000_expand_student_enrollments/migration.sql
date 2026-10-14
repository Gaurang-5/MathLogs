CREATE TYPE "EnrollmentStatus" AS ENUM ('ACTIVE', 'ENDED');
CREATE TYPE "IdentityReviewStatus" AS ENUM ('PENDING', 'RESOLVED_EXISTING', 'RESOLVED_NEW', 'REJECTED');

ALTER TABLE "InviteToken" ADD COLUMN "enrollmentIntent" JSONB;
ALTER TABLE "WhatsappJob" ADD COLUMN "eventKey" TEXT;
ALTER TABLE "StudentMonthCoverageProfile" ADD COLUMN "enrollmentId" TEXT;
ALTER TABLE "MonthCoveragePayment" ADD COLUMN "enrollmentId" TEXT;
ALTER TABLE "MonthCoverageAllocation" ADD COLUMN "enrollmentId" TEXT;

CREATE TABLE "Enrollment" (
  "id" TEXT NOT NULL,
  "instituteId" TEXT NOT NULL,
  "studentId" TEXT NOT NULL,
  "batchId" TEXT NOT NULL,
  "status" "EnrollmentStatus" NOT NULL DEFAULT 'ACTIVE',
  "startedAt" TIMESTAMP(3) NOT NULL,
  "endedAt" TIMESTAMP(3),
  "endReason" TEXT,
  "createdById" TEXT,
  "endedById" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Enrollment_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "StudentIdentityReview" (
  "id" TEXT NOT NULL,
  "instituteId" TEXT NOT NULL,
  "batchId" TEXT NOT NULL,
  "submittedData" JSONB NOT NULL,
  "candidateStudentIds" JSONB NOT NULL,
  "status" "IdentityReviewStatus" NOT NULL DEFAULT 'PENDING',
  "resolvedStudentId" TEXT,
  "resolvedById" TEXT,
  "resolvedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "StudentIdentityReview_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "EnrollmentAction" (
  "id" TEXT NOT NULL,
  "instituteId" TEXT NOT NULL,
  "enrollmentId" TEXT,
  "idempotencyKey" TEXT NOT NULL,
  "action" TEXT NOT NULL,
  "result" JSONB NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "EnrollmentAction_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "StudentDeletionAudit" (
  "id" TEXT NOT NULL,
  "instituteId" TEXT NOT NULL,
  "studentId" TEXT NOT NULL,
  "actorAdminId" TEXT NOT NULL,
  "reason" TEXT NOT NULL,
  "snapshot" JSONB NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "StudentDeletionAudit_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Enrollment_one_active_student_batch"
  ON "Enrollment"("studentId", "batchId")
  WHERE "status" = 'ACTIVE';
CREATE INDEX "Enrollment_instituteId_status_idx" ON "Enrollment"("instituteId", "status");
CREATE INDEX "Enrollment_studentId_status_idx" ON "Enrollment"("studentId", "status");
CREATE INDEX "Enrollment_batchId_status_idx" ON "Enrollment"("batchId", "status");
CREATE INDEX "Enrollment_studentId_batchId_startedAt_idx" ON "Enrollment"("studentId", "batchId", "startedAt");

CREATE INDEX "StudentIdentityReview_instituteId_status_createdAt_idx"
  ON "StudentIdentityReview"("instituteId", "status", "createdAt");
CREATE INDEX "StudentIdentityReview_batchId_status_idx" ON "StudentIdentityReview"("batchId", "status");
CREATE UNIQUE INDEX "EnrollmentAction_instituteId_idempotencyKey_key"
  ON "EnrollmentAction"("instituteId", "idempotencyKey");
CREATE INDEX "EnrollmentAction_enrollmentId_createdAt_idx" ON "EnrollmentAction"("enrollmentId", "createdAt");
CREATE INDEX "StudentDeletionAudit_instituteId_createdAt_idx" ON "StudentDeletionAudit"("instituteId", "createdAt");
CREATE INDEX "StudentDeletionAudit_studentId_createdAt_idx" ON "StudentDeletionAudit"("studentId", "createdAt");
CREATE UNIQUE INDEX "WhatsappJob_eventKey_key" ON "WhatsappJob"("eventKey");
CREATE UNIQUE INDEX "StudentMonthCoverageProfile_enrollmentId_key" ON "StudentMonthCoverageProfile"("enrollmentId");
CREATE INDEX "MonthCoveragePayment_enrollmentId_paymentDate_idx" ON "MonthCoveragePayment"("enrollmentId", "paymentDate");
CREATE INDEX "MonthCoverageAllocation_enrollmentId_coverageMonth_idx" ON "MonthCoverageAllocation"("enrollmentId", "coverageMonth");

ALTER TABLE "Enrollment" ADD CONSTRAINT "Enrollment_instituteId_fkey"
  FOREIGN KEY ("instituteId") REFERENCES "Institute"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Enrollment" ADD CONSTRAINT "Enrollment_studentId_fkey"
  FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Enrollment" ADD CONSTRAINT "Enrollment_batchId_fkey"
  FOREIGN KEY ("batchId") REFERENCES "Batch"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Enrollment" ADD CONSTRAINT "Enrollment_createdById_fkey"
  FOREIGN KEY ("createdById") REFERENCES "Admin"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Enrollment" ADD CONSTRAINT "Enrollment_endedById_fkey"
  FOREIGN KEY ("endedById") REFERENCES "Admin"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "StudentIdentityReview" ADD CONSTRAINT "StudentIdentityReview_instituteId_fkey"
  FOREIGN KEY ("instituteId") REFERENCES "Institute"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "StudentIdentityReview" ADD CONSTRAINT "StudentIdentityReview_batchId_fkey"
  FOREIGN KEY ("batchId") REFERENCES "Batch"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "StudentIdentityReview" ADD CONSTRAINT "StudentIdentityReview_resolvedStudentId_fkey"
  FOREIGN KEY ("resolvedStudentId") REFERENCES "Student"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "StudentIdentityReview" ADD CONSTRAINT "StudentIdentityReview_resolvedById_fkey"
  FOREIGN KEY ("resolvedById") REFERENCES "Admin"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "EnrollmentAction" ADD CONSTRAINT "EnrollmentAction_instituteId_fkey"
  FOREIGN KEY ("instituteId") REFERENCES "Institute"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "EnrollmentAction" ADD CONSTRAINT "EnrollmentAction_enrollmentId_fkey"
  FOREIGN KEY ("enrollmentId") REFERENCES "Enrollment"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "StudentDeletionAudit" ADD CONSTRAINT "StudentDeletionAudit_instituteId_fkey"
  FOREIGN KEY ("instituteId") REFERENCES "Institute"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "StudentDeletionAudit" ADD CONSTRAINT "StudentDeletionAudit_actorAdminId_fkey"
  FOREIGN KEY ("actorAdminId") REFERENCES "Admin"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "StudentMonthCoverageProfile" ADD CONSTRAINT "StudentMonthCoverageProfile_enrollmentId_fkey"
  FOREIGN KEY ("enrollmentId") REFERENCES "Enrollment"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MonthCoveragePayment" ADD CONSTRAINT "MonthCoveragePayment_enrollmentId_fkey"
  FOREIGN KEY ("enrollmentId") REFERENCES "Enrollment"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MonthCoverageAllocation" ADD CONSTRAINT "MonthCoverageAllocation_enrollmentId_fkey"
  FOREIGN KEY ("enrollmentId") REFERENCES "Enrollment"("id") ON DELETE CASCADE ON UPDATE CASCADE;
