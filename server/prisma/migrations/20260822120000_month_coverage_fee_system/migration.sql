-- CreateEnum
CREATE TYPE "CoachingFeeMode" AS ENUM ('CURRENT_DUE_BASED', 'MONTH_COVERAGE');

-- CreateEnum
CREATE TYPE "MonthCoverageDuration" AS ENUM ('MONTHLY', 'QUARTERLY', 'HALF_YEARLY', 'YEARLY');

-- CreateEnum
CREATE TYPE "MonthCoveragePaymentStatus" AS ENUM ('ACTIVE', 'VOID');

-- CreateEnum
CREATE TYPE "MonthCoverageProfileStatus" AS ENUM ('PENDING_SETUP', 'ACTIVE', 'CLOSED');

-- AlterTable
ALTER TABLE "Institute"
  ADD COLUMN "coachingFeeMode" "CoachingFeeMode" NOT NULL DEFAULT 'CURRENT_DUE_BASED',
  ADD COLUMN "coachingFeeModeSelectedAt" TIMESTAMP(3),
  ADD COLUMN "timezone" TEXT NOT NULL DEFAULT 'Asia/Kolkata';

ALTER TABLE "Batch"
  ADD COLUMN "startDate" TIMESTAMP(3),
  ADD COLUMN "endDate" TIMESTAMP(3);

UPDATE "Institute"
SET "coachingFeeMode" = 'CURRENT_DUE_BASED',
    "coachingFeeModeSelectedAt" = COALESCE("coachingFeeModeSelectedAt", NOW());

-- CreateTable
CREATE TABLE "StudentMonthCoverageProfile" (
  "id" TEXT NOT NULL,
  "instituteId" TEXT NOT NULL,
  "batchId" TEXT NOT NULL,
  "studentId" TEXT NOT NULL,
  "feeStartMonth" VARCHAR(7),
  "feeEndMonth" VARCHAR(7),
  "status" "MonthCoverageProfileStatus" NOT NULL DEFAULT 'PENDING_SETUP',
  "confirmedAt" TIMESTAMP(3),
  "confirmedById" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "StudentMonthCoverageProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MonthCoveragePayment" (
  "id" TEXT NOT NULL,
  "instituteId" TEXT NOT NULL,
  "batchId" TEXT NOT NULL,
  "studentId" TEXT NOT NULL,
  "amountPaise" INTEGER NOT NULL,
  "paymentDate" TIMESTAMP(3) NOT NULL,
  "paymentMethod" VARCHAR(32) NOT NULL,
  "duration" "MonthCoverageDuration" NOT NULL,
  "note" TEXT,
  "status" "MonthCoveragePaymentStatus" NOT NULL DEFAULT 'ACTIVE',
  "idempotencyKey" TEXT NOT NULL,
  "createdById" TEXT NOT NULL,
  "voidedAt" TIMESTAMP(3),
  "voidedById" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "MonthCoveragePayment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MonthCoverageAllocation" (
  "id" TEXT NOT NULL,
  "instituteId" TEXT NOT NULL,
  "batchId" TEXT NOT NULL,
  "studentId" TEXT NOT NULL,
  "paymentId" TEXT NOT NULL,
  "coverageMonth" VARCHAR(7) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "MonthCoverageAllocation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MonthCoverageAuditEvent" (
  "id" TEXT NOT NULL,
  "instituteId" TEXT NOT NULL,
  "paymentId" TEXT NOT NULL,
  "actorId" TEXT NOT NULL,
  "action" VARCHAR(16) NOT NULL,
  "reason" TEXT,
  "before" JSONB,
  "after" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "MonthCoverageAuditEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "StudentMonthCoverageProfile_studentId_key" ON "StudentMonthCoverageProfile"("studentId");
CREATE INDEX "StudentMonthCoverageProfile_instituteId_status_idx" ON "StudentMonthCoverageProfile"("instituteId", "status");
CREATE INDEX "StudentMonthCoverageProfile_batchId_status_idx" ON "StudentMonthCoverageProfile"("batchId", "status");
CREATE UNIQUE INDEX "MonthCoveragePayment_instituteId_idempotencyKey_key" ON "MonthCoveragePayment"("instituteId", "idempotencyKey");
CREATE INDEX "MonthCoveragePayment_studentId_paymentDate_idx" ON "MonthCoveragePayment"("studentId", "paymentDate");
CREATE INDEX "MonthCoveragePayment_instituteId_status_paymentDate_idx" ON "MonthCoveragePayment"("instituteId", "status", "paymentDate");
CREATE UNIQUE INDEX "MonthCoverageAllocation_studentId_coverageMonth_key" ON "MonthCoverageAllocation"("studentId", "coverageMonth");
CREATE INDEX "MonthCoverageAllocation_instituteId_coverageMonth_idx" ON "MonthCoverageAllocation"("instituteId", "coverageMonth");
CREATE INDEX "MonthCoverageAllocation_batchId_coverageMonth_idx" ON "MonthCoverageAllocation"("batchId", "coverageMonth");
CREATE INDEX "MonthCoverageAllocation_paymentId_idx" ON "MonthCoverageAllocation"("paymentId");
CREATE INDEX "MonthCoverageAuditEvent_paymentId_createdAt_idx" ON "MonthCoverageAuditEvent"("paymentId", "createdAt");
CREATE INDEX "MonthCoverageAuditEvent_instituteId_createdAt_idx" ON "MonthCoverageAuditEvent"("instituteId", "createdAt");

-- AddForeignKey
ALTER TABLE "StudentMonthCoverageProfile" ADD CONSTRAINT "StudentMonthCoverageProfile_instituteId_fkey" FOREIGN KEY ("instituteId") REFERENCES "Institute"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "StudentMonthCoverageProfile" ADD CONSTRAINT "StudentMonthCoverageProfile_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "Batch"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "StudentMonthCoverageProfile" ADD CONSTRAINT "StudentMonthCoverageProfile_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "StudentMonthCoverageProfile" ADD CONSTRAINT "StudentMonthCoverageProfile_confirmedById_fkey" FOREIGN KEY ("confirmedById") REFERENCES "Admin"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "MonthCoveragePayment" ADD CONSTRAINT "MonthCoveragePayment_instituteId_fkey" FOREIGN KEY ("instituteId") REFERENCES "Institute"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MonthCoveragePayment" ADD CONSTRAINT "MonthCoveragePayment_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "Batch"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MonthCoveragePayment" ADD CONSTRAINT "MonthCoveragePayment_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MonthCoveragePayment" ADD CONSTRAINT "MonthCoveragePayment_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "Admin"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "MonthCoveragePayment" ADD CONSTRAINT "MonthCoveragePayment_voidedById_fkey" FOREIGN KEY ("voidedById") REFERENCES "Admin"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "MonthCoverageAllocation" ADD CONSTRAINT "MonthCoverageAllocation_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "MonthCoveragePayment"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MonthCoverageAllocation" ADD CONSTRAINT "MonthCoverageAllocation_instituteId_fkey" FOREIGN KEY ("instituteId") REFERENCES "Institute"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MonthCoverageAllocation" ADD CONSTRAINT "MonthCoverageAllocation_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "Batch"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MonthCoverageAllocation" ADD CONSTRAINT "MonthCoverageAllocation_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MonthCoverageAuditEvent" ADD CONSTRAINT "MonthCoverageAuditEvent_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "MonthCoveragePayment"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MonthCoverageAuditEvent" ADD CONSTRAINT "MonthCoverageAuditEvent_instituteId_fkey" FOREIGN KEY ("instituteId") REFERENCES "Institute"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MonthCoverageAuditEvent" ADD CONSTRAINT "MonthCoverageAuditEvent_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "Admin"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
