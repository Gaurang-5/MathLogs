-- Complete the schema for databases created by the historical bootstrap. The
-- marker is created only when the initial baseline runs against an empty DB, so
-- existing installations safely record this migration without replaying legacy
-- schema changes that they already received outside the checked-in chain.
DO $reconciliation$
BEGIN
  IF to_regclass('"_MathLogsFreshBootstrap"') IS NOT NULL THEN
    CREATE TYPE "AttendanceSource" AS ENUM ('KIOSK', 'MANUAL');

    ALTER TYPE "Tier" ADD VALUE 'NO_PLAN';
    ALTER TYPE "Tier" ADD VALUE 'BASIC';

    ALTER TABLE "AcademicYear" DROP CONSTRAINT "AcademicYear_instituteId_fkey";
    ALTER TABLE "AcademicYear" DROP CONSTRAINT "AcademicYear_teacherId_fkey";
    ALTER TABLE "Admin" DROP CONSTRAINT "Admin_currentAcademicYearId_fkey";
    ALTER TABLE "Batch" DROP CONSTRAINT "Batch_academicYearId_fkey";
    ALTER TABLE "Student" DROP CONSTRAINT "Student_academicYearId_fkey";
    ALTER TABLE "Test" DROP CONSTRAINT "Test_academicYearId_fkey";

    DROP INDEX "Batch_teacherId_academicYearId_className_idx";
    DROP INDEX "QuizQuestion_quizId_idx";
    DROP INDEX "Student_humanId_academicYearId_key";
    DROP INDEX "Student_status_academicYearId_idx";
    DROP INDEX "Test_teacherId_academicYearId_idx";

    ALTER TABLE "Admin"
      DROP COLUMN "currentAcademicYear",
      DROP COLUMN "currentAcademicYearId";

    ALTER TABLE "Batch"
      DROP COLUMN "academicYear",
      DROP COLUMN "academicYearId",
      ADD COLUMN "autoSendWelcome" BOOLEAN NOT NULL DEFAULT false;

    ALTER TABLE "Institute"
      ADD COLUMN "aboutUs" TEXT,
      ADD COLUMN "address" TEXT,
      ADD COLUMN "areRegistrationsPaused" BOOLEAN NOT NULL DEFAULT false,
      ADD COLUMN "area" TEXT,
      ADD COLUMN "city" TEXT,
      ADD COLUMN "classesOffered" JSONB,
      ADD COLUMN "googleLastSyncedAt" TIMESTAMP(3),
      ADD COLUMN "googleMapsUrl" TEXT,
      ADD COLUMN "googlePhotos" JSONB,
      ADD COLUMN "googlePlaceId" TEXT,
      ADD COLUMN "googleRating" DOUBLE PRECISION,
      ADD COLUMN "googleReviewCount" INTEGER,
      ADD COLUMN "googleReviews" JSONB,
      ADD COLUMN "isExclusive" BOOLEAN NOT NULL DEFAULT false,
      ADD COLUMN "isPubliclyListed" BOOLEAN NOT NULL DEFAULT false,
      ADD COLUMN "isQuizOnly" BOOLEAN NOT NULL DEFAULT false,
      ADD COLUMN "isVerified" BOOLEAN NOT NULL DEFAULT false,
      ADD COLUMN "logoUrl" TEXT,
      ADD COLUMN "planExpiryDate" TIMESTAMP(3),
      ADD COLUMN "planStartDate" TIMESTAMP(3),
      ADD COLUMN "publicPhone" TEXT,
      ADD COLUMN "quizCredits" INTEGER NOT NULL DEFAULT 0,
      ADD COLUMN "razorpayOrderId" TEXT,
      ADD COLUMN "razorpaySubscriptionId" TEXT,
      ADD COLUMN "slug" TEXT,
      ADD COLUMN "subjectsOffered" JSONB,
      ADD COLUMN "tagline" TEXT,
      ADD COLUMN "websiteConfig" JSONB,
      ADD COLUMN "whatsappPhone" TEXT,
      ALTER COLUMN "config" SET DEFAULT '{"subjects": ["Math", "Science"], "allowedClasses": ["9", "10"], "requiresGrades": true}';

    ALTER TABLE "OnlineQuiz"
      ADD COLUMN "isPublic" BOOLEAN NOT NULL DEFAULT true,
      ADD COLUMN "studentQuestionCount" INTEGER,
      ALTER COLUMN "batchId" DROP NOT NULL;

    ALTER TABLE "QuizQuestion" ADD COLUMN "variantGroup" TEXT;
    ALTER TABLE "QuizSubmission" ADD COLUMN "shuffledQuestions" JSONB;

    ALTER TABLE "Student"
      DROP COLUMN "academicYearId",
      ADD COLUMN "additionalData" JSONB,
      ADD COLUMN "leaveReason" TEXT,
      ADD COLUMN "leftAt" TIMESTAMP(3);

    ALTER TABLE "Test"
      DROP COLUMN "academicYear",
      DROP COLUMN "academicYearId",
      ADD COLUMN "batchId" TEXT,
      ADD COLUMN "isQuiz" BOOLEAN NOT NULL DEFAULT false;

    DROP TABLE "AcademicYear";

    CREATE TABLE "AttendanceRecord" (
      "id" TEXT NOT NULL,
      "studentId" TEXT NOT NULL,
      "batchId" TEXT NOT NULL,
      "instituteId" TEXT NOT NULL,
      "attendanceDate" TIMESTAMP(3) NOT NULL,
      "checkedInAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "photoStorageKey" TEXT,
      "photoUrl" TEXT,
      "photoUrlExpiresAt" TIMESTAMP(3),
      "photoMimeType" TEXT,
      "note" TEXT,
      "source" "AttendanceSource" NOT NULL DEFAULT 'KIOSK',
      "manualMarkedById" TEXT,
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" TIMESTAMP(3) NOT NULL,
      CONSTRAINT "AttendanceRecord_pkey" PRIMARY KEY ("id")
    );

    CREATE TABLE "AttendanceSweepRun" (
      "id" TEXT NOT NULL,
      "batchId" TEXT NOT NULL,
      "instituteId" TEXT NOT NULL,
      "attendanceDate" TIMESTAMP(3) NOT NULL,
      "scheduledFor" TIMESTAMP(3) NOT NULL,
      "status" TEXT NOT NULL DEFAULT 'COMPLETED',
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "completedAt" TIMESTAMP(3),
      CONSTRAINT "AttendanceSweepRun_pkey" PRIMARY KEY ("id")
    );

    CREATE TABLE "AdminOnboardingLink" (
      "id" TEXT NOT NULL,
      "token" TEXT NOT NULL,
      "plan" TEXT NOT NULL,
      "billingCycle" TEXT,
      "maxStudents" INTEGER NOT NULL DEFAULT 100,
      "status" TEXT NOT NULL DEFAULT 'PENDING',
      "instituteId" TEXT,
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" TIMESTAMP(3) NOT NULL,
      "expiresAt" TIMESTAMP(3) NOT NULL,
      "customPriceMonthlyPaise" INTEGER,
      "customPriceYearlyPaise" INTEGER,
      "discountPercent" INTEGER NOT NULL DEFAULT 0,
      "isFreeTrial" BOOLEAN NOT NULL DEFAULT false,
      "trialDays" INTEGER,
      CONSTRAINT "AdminOnboardingLink_pkey" PRIMARY KEY ("id")
    );

    CREATE TABLE "OnboardingLead" (
      "id" TEXT NOT NULL,
      "tuitionName" TEXT,
      "ownerName" TEXT,
      "phone" TEXT NOT NULL,
      "email" TEXT,
      "planId" TEXT,
      "billingCycle" TEXT,
      "step" TEXT NOT NULL DEFAULT 'STEP_1_STARTED',
      "failureReason" TEXT,
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" TIMESTAMP(3) NOT NULL,
      CONSTRAINT "OnboardingLead_pkey" PRIMARY KEY ("id")
    );

    CREATE TABLE "OtpToken" (
      "id" TEXT NOT NULL,
      "identifier" TEXT NOT NULL,
      "otp" TEXT NOT NULL,
      "expiresAt" TIMESTAMP(3) NOT NULL,
      "verified" BOOLEAN NOT NULL DEFAULT false,
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "OtpToken_pkey" PRIMARY KEY ("id")
    );

    CREATE TABLE "SystemAlert" (
      "id" TEXT NOT NULL,
      "title" TEXT NOT NULL,
      "message" TEXT NOT NULL,
      "type" TEXT NOT NULL DEFAULT 'INFO',
      "isActive" BOOLEAN NOT NULL DEFAULT true,
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "expiresAt" TIMESTAMP(3),
      CONSTRAINT "SystemAlert_pkey" PRIMARY KEY ("id")
    );

    CREATE TABLE "StudentLead" (
      "id" TEXT NOT NULL,
      "studentName" TEXT NOT NULL,
      "parentName" TEXT NOT NULL,
      "parentPhone" TEXT NOT NULL,
      "batchInterestId" TEXT,
      "status" TEXT NOT NULL DEFAULT 'NEW',
      "instituteId" TEXT NOT NULL,
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" TIMESTAMP(3) NOT NULL,
      CONSTRAINT "StudentLead_pkey" PRIMARY KEY ("id")
    );

    CREATE TABLE "UpiPaymentVerification" (
      "id" TEXT NOT NULL,
      "studentId" TEXT NOT NULL,
      "instituteId" TEXT NOT NULL,
      "installmentId" TEXT,
      "amount" DOUBLE PRECISION NOT NULL,
      "storageKey" TEXT NOT NULL,
      "status" TEXT NOT NULL DEFAULT 'PENDING',
      "rejectionReason" TEXT,
      "paidByName" TEXT,
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" TIMESTAMP(3) NOT NULL,
      CONSTRAINT "UpiPaymentVerification_pkey" PRIMARY KEY ("id")
    );

    CREATE TABLE "ShortUrl" (
      "id" TEXT NOT NULL,
      "longUrl" TEXT NOT NULL,
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "ShortUrl_pkey" PRIMARY KEY ("id")
    );

    CREATE TABLE "Review" (
      "id" TEXT NOT NULL,
      "instituteId" TEXT NOT NULL,
      "reviewerName" TEXT NOT NULL,
      "reviewerRole" TEXT NOT NULL DEFAULT 'Student',
      "rating" INTEGER NOT NULL,
      "comment" TEXT NOT NULL,
      "status" TEXT NOT NULL DEFAULT 'APPROVED',
      "source" TEXT NOT NULL DEFAULT 'MATHLOGS',
      "googleAuthorUrl" TEXT,
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" TIMESTAMP(3) NOT NULL,
      CONSTRAINT "Review_pkey" PRIMARY KEY ("id")
    );

    CREATE TABLE "_TestBatches" ("A" TEXT NOT NULL, "B" TEXT NOT NULL);
    CREATE TABLE "_OnlineQuizBatches" ("A" TEXT NOT NULL, "B" TEXT NOT NULL);

    CREATE INDEX "AttendanceRecord_batchId_attendanceDate_checkedInAt_idx" ON "AttendanceRecord"("batchId", "attendanceDate", "checkedInAt");
    CREATE INDEX "AttendanceRecord_instituteId_attendanceDate_checkedInAt_idx" ON "AttendanceRecord"("instituteId", "attendanceDate", "checkedInAt");
    CREATE UNIQUE INDEX "AttendanceRecord_studentId_attendanceDate_key" ON "AttendanceRecord"("studentId", "attendanceDate");
    CREATE INDEX "AttendanceSweepRun_scheduledFor_idx" ON "AttendanceSweepRun"("scheduledFor");
    CREATE INDEX "AttendanceSweepRun_instituteId_attendanceDate_idx" ON "AttendanceSweepRun"("instituteId", "attendanceDate");
    CREATE UNIQUE INDEX "AttendanceSweepRun_batchId_attendanceDate_key" ON "AttendanceSweepRun"("batchId", "attendanceDate");
    CREATE UNIQUE INDEX "AdminOnboardingLink_token_key" ON "AdminOnboardingLink"("token");
    CREATE INDEX "AdminOnboardingLink_token_idx" ON "AdminOnboardingLink"("token");
    CREATE INDEX "AdminOnboardingLink_status_idx" ON "AdminOnboardingLink"("status");
    CREATE INDEX "AdminOnboardingLink_createdAt_idx" ON "AdminOnboardingLink"("createdAt");
    CREATE UNIQUE INDEX "OnboardingLead_phone_key" ON "OnboardingLead"("phone");
    CREATE INDEX "OnboardingLead_step_idx" ON "OnboardingLead"("step");
    CREATE INDEX "OnboardingLead_createdAt_idx" ON "OnboardingLead"("createdAt");
    CREATE INDEX "OtpToken_expiresAt_idx" ON "OtpToken"("expiresAt");
    CREATE UNIQUE INDEX "OtpToken_identifier_key" ON "OtpToken"("identifier");
    CREATE INDEX "SystemAlert_isActive_idx" ON "SystemAlert"("isActive");
    CREATE INDEX "StudentLead_instituteId_idx" ON "StudentLead"("instituteId");
    CREATE INDEX "StudentLead_status_idx" ON "StudentLead"("status");
    CREATE INDEX "UpiPaymentVerification_instituteId_status_idx" ON "UpiPaymentVerification"("instituteId", "status");
    CREATE INDEX "UpiPaymentVerification_studentId_idx" ON "UpiPaymentVerification"("studentId");
    CREATE INDEX "Review_instituteId_idx" ON "Review"("instituteId");
    CREATE INDEX "Review_instituteId_status_idx" ON "Review"("instituteId", "status");
    CREATE INDEX "Review_rating_idx" ON "Review"("rating");
    CREATE UNIQUE INDEX "_TestBatches_AB_unique" ON "_TestBatches"("A", "B");
    CREATE INDEX "_TestBatches_B_index" ON "_TestBatches"("B");
    CREATE UNIQUE INDEX "_OnlineQuizBatches_AB_unique" ON "_OnlineQuizBatches"("A", "B");
    CREATE INDEX "_OnlineQuizBatches_B_index" ON "_OnlineQuizBatches"("B");
    CREATE INDEX "Batch_teacherId_className_idx" ON "Batch"("teacherId", "className");
    CREATE INDEX "Batch_instituteId_idx" ON "Batch"("instituteId");
    CREATE UNIQUE INDEX "Institute_slug_key" ON "Institute"("slug");
    CREATE INDEX "QuizQuestion_quizId_variantGroup_idx" ON "QuizQuestion"("quizId", "variantGroup");
    CREATE INDEX "Student_instituteId_status_idx" ON "Student"("instituteId", "status");
    CREATE INDEX "Student_instituteId_createdAt_idx" ON "Student"("instituteId", "createdAt");
    CREATE INDEX "Student_instituteId_parentWhatsapp_idx" ON "Student"("instituteId", "parentWhatsapp");
    CREATE UNIQUE INDEX "Student_humanId_instituteId_key" ON "Student"("humanId", "instituteId");
    CREATE INDEX "Test_teacherId_idx" ON "Test"("teacherId");
    CREATE INDEX "Test_instituteId_idx" ON "Test"("instituteId");
    CREATE INDEX "Test_batchId_idx" ON "Test"("batchId");

    ALTER TABLE "Test" ADD CONSTRAINT "Test_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "Batch"("id") ON DELETE SET NULL ON UPDATE CASCADE;
    ALTER TABLE "AttendanceRecord" ADD CONSTRAINT "AttendanceRecord_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    ALTER TABLE "AttendanceRecord" ADD CONSTRAINT "AttendanceRecord_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "Batch"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    ALTER TABLE "AttendanceRecord" ADD CONSTRAINT "AttendanceRecord_instituteId_fkey" FOREIGN KEY ("instituteId") REFERENCES "Institute"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    ALTER TABLE "AttendanceRecord" ADD CONSTRAINT "AttendanceRecord_manualMarkedById_fkey" FOREIGN KEY ("manualMarkedById") REFERENCES "Admin"("id") ON DELETE SET NULL ON UPDATE CASCADE;
    ALTER TABLE "AttendanceSweepRun" ADD CONSTRAINT "AttendanceSweepRun_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "Batch"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    ALTER TABLE "AttendanceSweepRun" ADD CONSTRAINT "AttendanceSweepRun_instituteId_fkey" FOREIGN KEY ("instituteId") REFERENCES "Institute"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    ALTER TABLE "StudentLead" ADD CONSTRAINT "StudentLead_instituteId_fkey" FOREIGN KEY ("instituteId") REFERENCES "Institute"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
    ALTER TABLE "StudentLead" ADD CONSTRAINT "StudentLead_batchInterestId_fkey" FOREIGN KEY ("batchInterestId") REFERENCES "Batch"("id") ON DELETE SET NULL ON UPDATE CASCADE;
    ALTER TABLE "UpiPaymentVerification" ADD CONSTRAINT "UpiPaymentVerification_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    ALTER TABLE "UpiPaymentVerification" ADD CONSTRAINT "UpiPaymentVerification_instituteId_fkey" FOREIGN KEY ("instituteId") REFERENCES "Institute"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    ALTER TABLE "UpiPaymentVerification" ADD CONSTRAINT "UpiPaymentVerification_installmentId_fkey" FOREIGN KEY ("installmentId") REFERENCES "FeeInstallment"("id") ON DELETE SET NULL ON UPDATE CASCADE;
    ALTER TABLE "Review" ADD CONSTRAINT "Review_instituteId_fkey" FOREIGN KEY ("instituteId") REFERENCES "Institute"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    ALTER TABLE "_TestBatches" ADD CONSTRAINT "_TestBatches_A_fkey" FOREIGN KEY ("A") REFERENCES "Batch"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    ALTER TABLE "_TestBatches" ADD CONSTRAINT "_TestBatches_B_fkey" FOREIGN KEY ("B") REFERENCES "Test"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    ALTER TABLE "_OnlineQuizBatches" ADD CONSTRAINT "_OnlineQuizBatches_A_fkey" FOREIGN KEY ("A") REFERENCES "Batch"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    ALTER TABLE "_OnlineQuizBatches" ADD CONSTRAINT "_OnlineQuizBatches_B_fkey" FOREIGN KEY ("B") REFERENCES "OnlineQuiz"("id") ON DELETE CASCADE ON UPDATE CASCADE;

    ALTER INDEX "WhatsappJob_superAdminEntityType_superAdminEntityId_createdAt_i"
      RENAME TO "WhatsappJob_superAdminEntityType_superAdminEntityId_created_idx";

    DROP TABLE "_MathLogsFreshBootstrap";
  END IF;
END
$reconciliation$;
