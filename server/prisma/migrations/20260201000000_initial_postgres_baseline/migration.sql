-- The repository's original migration history started with ALTER statements and
-- therefore could not be deployed to an empty PostgreSQL database. This baseline
-- recreates the schema immediately before the first historical migration.
--
-- Existing installations already contain these tables. The sentinel guard lets
-- Prisma record this newly-added historical migration without recreating objects.
DO $baseline$
BEGIN
  IF to_regclass('"Admin"') IS NULL THEN
    -- A private marker scopes the later legacy-schema reconciliation to fresh
    -- installations. Existing databases skip both the baseline and that repair.
    CREATE TABLE "_MathLogsFreshBootstrap" (
      "id" INTEGER NOT NULL,
      CONSTRAINT "_MathLogsFreshBootstrap_pkey" PRIMARY KEY ("id")
    );
    INSERT INTO "_MathLogsFreshBootstrap" ("id") VALUES (1);

    CREATE TYPE "Tier" AS ENUM ('FREE', 'PRO', 'ENTERPRISE');
    CREATE TYPE "JobStatus" AS ENUM ('PENDING', 'PROCESSING', 'COMPLETED', 'FAILED');

    CREATE TABLE "Institute" (
      "id" TEXT NOT NULL,
      "name" TEXT NOT NULL,
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" TIMESTAMP(3) NOT NULL,
      "teacherName" TEXT,
      "phoneNumber" TEXT,
      "email" TEXT,
      "config" JSONB DEFAULT '{"allowedClasses": ["9", "10"], "subjects": ["Math", "Science"]}',
      "plan" "Tier" NOT NULL DEFAULT 'FREE',
      "status" TEXT NOT NULL DEFAULT 'ACTIVE',
      "suspensionReason" TEXT,
      CONSTRAINT "Institute_pkey" PRIMARY KEY ("id")
    );

    CREATE TABLE "InviteToken" (
      "id" TEXT NOT NULL,
      "token" TEXT NOT NULL,
      "instituteId" TEXT NOT NULL,
      "isUsed" BOOLEAN NOT NULL DEFAULT false,
      "expiresAt" TIMESTAMP(3) NOT NULL,
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "InviteToken_pkey" PRIMARY KEY ("id")
    );

    CREATE TABLE "Admin" (
      "id" TEXT NOT NULL,
      "username" TEXT NOT NULL,
      "password" TEXT NOT NULL,
      "passwordVersion" INTEGER NOT NULL DEFAULT 1,
      "currentAcademicYear" TEXT NOT NULL DEFAULT '2024-2025',
      "role" TEXT NOT NULL DEFAULT 'INSTITUTE_ADMIN',
      "instituteId" TEXT,
      "currentAcademicYearId" TEXT,
      CONSTRAINT "Admin_pkey" PRIMARY KEY ("id")
    );

    CREATE TABLE "AcademicYear" (
      "id" TEXT NOT NULL,
      "name" TEXT NOT NULL,
      "startDate" TIMESTAMP(3),
      "endDate" TIMESTAMP(3),
      "isDefault" BOOLEAN NOT NULL DEFAULT false,
      "instituteId" TEXT,
      "teacherId" TEXT NOT NULL,
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" TIMESTAMP(3) NOT NULL,
      CONSTRAINT "AcademicYear_pkey" PRIMARY KEY ("id")
    );

    CREATE TABLE "Batch" (
      "id" TEXT NOT NULL,
      "name" TEXT NOT NULL,
      "subject" TEXT,
      "className" TEXT,
      "timeSlot" TEXT,
      "feeAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
      "academicYear" TEXT,
      "academicYearId" TEXT,
      "instituteId" TEXT,
      "whatsappGroupLink" TEXT,
      "isRegistrationOpen" BOOLEAN NOT NULL DEFAULT true,
      "isRegistrationEnded" BOOLEAN NOT NULL DEFAULT false,
      "batchNumber" INTEGER,
      "teacherId" TEXT,
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" TIMESTAMP(3) NOT NULL,
      CONSTRAINT "Batch_pkey" PRIMARY KEY ("id")
    );

    CREATE TABLE "Student" (
      "id" TEXT NOT NULL,
      "humanId" TEXT,
      "name" TEXT NOT NULL,
      "parentName" TEXT NOT NULL,
      "parentWhatsapp" TEXT NOT NULL,
      "parentEmail" TEXT,
      "status" TEXT NOT NULL DEFAULT 'PENDING',
      "batchId" TEXT,
      "academicYearId" TEXT,
      "instituteId" TEXT,
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" TIMESTAMP(3) NOT NULL,
      "schoolName" TEXT,
      CONSTRAINT "Student_pkey" PRIMARY KEY ("id")
    );

    CREATE TABLE "FeeRecord" (
      "id" TEXT NOT NULL,
      "amount" DOUBLE PRECISION NOT NULL,
      "date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "status" TEXT NOT NULL DEFAULT 'PAID',
      "studentId" TEXT NOT NULL,
      CONSTRAINT "FeeRecord_pkey" PRIMARY KEY ("id")
    );

    CREATE TABLE "Test" (
      "id" TEXT NOT NULL,
      "name" TEXT NOT NULL,
      "subject" TEXT NOT NULL,
      "className" TEXT,
      "date" TIMESTAMP(3) NOT NULL,
      "maxMarks" DOUBLE PRECISION NOT NULL,
      "instituteId" TEXT,
      "teacherId" TEXT,
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" TIMESTAMP(3) NOT NULL,
      "academicYear" TEXT,
      "academicYearId" TEXT,
      CONSTRAINT "Test_pkey" PRIMARY KEY ("id")
    );

    CREATE TABLE "Mark" (
      "id" TEXT NOT NULL,
      "score" DOUBLE PRECISION NOT NULL,
      "studentId" TEXT NOT NULL,
      "testId" TEXT NOT NULL,
      CONSTRAINT "Mark_pkey" PRIMARY KEY ("id")
    );

    CREATE TABLE "FeeInstallment" (
      "id" TEXT NOT NULL,
      "name" TEXT NOT NULL,
      "amount" DOUBLE PRECISION NOT NULL,
      "batchId" TEXT NOT NULL,
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "FeeInstallment_pkey" PRIMARY KEY ("id")
    );

    CREATE TABLE "FeePayment" (
      "id" TEXT NOT NULL,
      "date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "amountPaid" DOUBLE PRECISION NOT NULL,
      "studentId" TEXT NOT NULL,
      "installmentId" TEXT NOT NULL,
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "FeePayment_pkey" PRIMARY KEY ("id")
    );

    CREATE TABLE "StudentBalance" (
      "studentId" TEXT NOT NULL,
      "totalFee" DOUBLE PRECISION NOT NULL DEFAULT 0,
      "totalPaid" DOUBLE PRECISION NOT NULL DEFAULT 0,
      "balance" DOUBLE PRECISION NOT NULL DEFAULT 0,
      "lastPaymentDate" TIMESTAMP(3),
      "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "StudentBalance_pkey" PRIMARY KEY ("studentId")
    );

    CREATE TABLE "IdCounter" (
      "prefix" TEXT NOT NULL,
      "seq" INTEGER NOT NULL,
      CONSTRAINT "IdCounter_pkey" PRIMARY KEY ("prefix")
    );

    CREATE TABLE "EmailJob" (
      "id" TEXT NOT NULL,
      "recipient" TEXT NOT NULL,
      "subject" TEXT NOT NULL,
      "body" TEXT NOT NULL,
      "status" "JobStatus" NOT NULL DEFAULT 'PENDING',
      "attempts" INTEGER NOT NULL DEFAULT 0,
      "maxAttempts" INTEGER NOT NULL DEFAULT 3,
      "error" TEXT,
      "options" JSONB,
      "instituteId" TEXT,
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" TIMESTAMP(3) NOT NULL,
      CONSTRAINT "EmailJob_pkey" PRIMARY KEY ("id")
    );

    CREATE UNIQUE INDEX "InviteToken_token_key" ON "InviteToken"("token");
    CREATE UNIQUE INDEX "Admin_username_key" ON "Admin"("username");
    CREATE UNIQUE INDEX "AcademicYear_teacherId_name_key" ON "AcademicYear"("teacherId", "name");
    CREATE INDEX "Batch_teacherId_academicYearId_className_idx" ON "Batch"("teacherId", "academicYearId", "className");
    CREATE INDEX "Student_batchId_idx" ON "Student"("batchId");
    CREATE INDEX "Student_status_idx" ON "Student"("status");
    CREATE INDEX "Student_name_idx" ON "Student"("name");
    CREATE INDEX "Student_status_academicYearId_idx" ON "Student"("status", "academicYearId");
    CREATE INDEX "Student_batchId_status_idx" ON "Student"("batchId", "status");
    CREATE INDEX "Student_createdAt_idx" ON "Student"("createdAt");
    CREATE UNIQUE INDEX "Student_humanId_academicYearId_key" ON "Student"("humanId", "academicYearId");
    CREATE UNIQUE INDEX "Student_name_parentWhatsapp_batchId_key" ON "Student"("name", "parentWhatsapp", "batchId");
    CREATE INDEX "FeeRecord_studentId_idx" ON "FeeRecord"("studentId");
    CREATE INDEX "FeeRecord_date_idx" ON "FeeRecord"("date");
    CREATE INDEX "Test_teacherId_academicYearId_idx" ON "Test"("teacherId", "academicYearId");
    CREATE INDEX "Test_date_idx" ON "Test"("date");
    CREATE INDEX "Mark_testId_idx" ON "Mark"("testId");
    CREATE INDEX "Mark_studentId_idx" ON "Mark"("studentId");
    CREATE UNIQUE INDEX "Mark_studentId_testId_key" ON "Mark"("studentId", "testId");
    CREATE INDEX "FeeInstallment_batchId_idx" ON "FeeInstallment"("batchId");
    CREATE INDEX "FeePayment_studentId_idx" ON "FeePayment"("studentId");
    CREATE INDEX "FeePayment_installmentId_idx" ON "FeePayment"("installmentId");
    CREATE INDEX "FeePayment_studentId_installmentId_idx" ON "FeePayment"("studentId", "installmentId");
    CREATE INDEX "FeePayment_date_idx" ON "FeePayment"("date");
    CREATE INDEX "idx_balance_desc" ON "StudentBalance"("balance");
    CREATE INDEX "StudentBalance_updatedAt_idx" ON "StudentBalance"("updatedAt");
    CREATE INDEX "EmailJob_status_idx" ON "EmailJob"("status");
    CREATE INDEX "EmailJob_createdAt_idx" ON "EmailJob"("createdAt");

    ALTER TABLE "InviteToken" ADD CONSTRAINT "InviteToken_instituteId_fkey" FOREIGN KEY ("instituteId") REFERENCES "Institute"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
    ALTER TABLE "Admin" ADD CONSTRAINT "Admin_instituteId_fkey" FOREIGN KEY ("instituteId") REFERENCES "Institute"("id") ON DELETE SET NULL ON UPDATE CASCADE;
    ALTER TABLE "Admin" ADD CONSTRAINT "Admin_currentAcademicYearId_fkey" FOREIGN KEY ("currentAcademicYearId") REFERENCES "AcademicYear"("id") ON DELETE SET NULL ON UPDATE CASCADE;
    ALTER TABLE "AcademicYear" ADD CONSTRAINT "AcademicYear_instituteId_fkey" FOREIGN KEY ("instituteId") REFERENCES "Institute"("id") ON DELETE SET NULL ON UPDATE CASCADE;
    ALTER TABLE "AcademicYear" ADD CONSTRAINT "AcademicYear_teacherId_fkey" FOREIGN KEY ("teacherId") REFERENCES "Admin"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
    ALTER TABLE "Batch" ADD CONSTRAINT "Batch_academicYearId_fkey" FOREIGN KEY ("academicYearId") REFERENCES "AcademicYear"("id") ON DELETE SET NULL ON UPDATE CASCADE;
    ALTER TABLE "Batch" ADD CONSTRAINT "Batch_instituteId_fkey" FOREIGN KEY ("instituteId") REFERENCES "Institute"("id") ON DELETE SET NULL ON UPDATE CASCADE;
    ALTER TABLE "Batch" ADD CONSTRAINT "Batch_teacherId_fkey" FOREIGN KEY ("teacherId") REFERENCES "Admin"("id") ON DELETE SET NULL ON UPDATE CASCADE;
    ALTER TABLE "Student" ADD CONSTRAINT "Student_academicYearId_fkey" FOREIGN KEY ("academicYearId") REFERENCES "AcademicYear"("id") ON DELETE SET NULL ON UPDATE CASCADE;
    ALTER TABLE "Student" ADD CONSTRAINT "Student_instituteId_fkey" FOREIGN KEY ("instituteId") REFERENCES "Institute"("id") ON DELETE SET NULL ON UPDATE CASCADE;
    ALTER TABLE "Student" ADD CONSTRAINT "Student_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "Batch"("id") ON DELETE SET NULL ON UPDATE CASCADE;
    ALTER TABLE "FeeRecord" ADD CONSTRAINT "FeeRecord_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
    ALTER TABLE "Test" ADD CONSTRAINT "Test_instituteId_fkey" FOREIGN KEY ("instituteId") REFERENCES "Institute"("id") ON DELETE SET NULL ON UPDATE CASCADE;
    ALTER TABLE "Test" ADD CONSTRAINT "Test_academicYearId_fkey" FOREIGN KEY ("academicYearId") REFERENCES "AcademicYear"("id") ON DELETE SET NULL ON UPDATE CASCADE;
    ALTER TABLE "Test" ADD CONSTRAINT "Test_teacherId_fkey" FOREIGN KEY ("teacherId") REFERENCES "Admin"("id") ON DELETE SET NULL ON UPDATE CASCADE;
    ALTER TABLE "Mark" ADD CONSTRAINT "Mark_testId_fkey" FOREIGN KEY ("testId") REFERENCES "Test"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
    ALTER TABLE "Mark" ADD CONSTRAINT "Mark_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
    ALTER TABLE "FeeInstallment" ADD CONSTRAINT "FeeInstallment_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "Batch"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    ALTER TABLE "FeePayment" ADD CONSTRAINT "FeePayment_installmentId_fkey" FOREIGN KEY ("installmentId") REFERENCES "FeeInstallment"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    ALTER TABLE "FeePayment" ADD CONSTRAINT "FeePayment_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    ALTER TABLE "StudentBalance" ADD CONSTRAINT "StudentBalance_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END
$baseline$;
