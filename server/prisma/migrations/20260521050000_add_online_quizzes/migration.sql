-- CreateTable
CREATE TABLE IF NOT EXISTS "OnlineQuiz" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "topic" TEXT,
    "difficulty" TEXT,
    "timeLimitMins" INTEGER NOT NULL DEFAULT 30,
    "totalMarks" DOUBLE PRECISION NOT NULL,
    "availableFrom" TIMESTAMP(3),
    "availableUntil" TIMESTAMP(3),
    "isFinalized" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "instituteId" TEXT NOT NULL,
    "batchId" TEXT NOT NULL,
    "teacherId" TEXT,

    CONSTRAINT "OnlineQuiz_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "QuizQuestion" (
    "id" TEXT NOT NULL,
    "quizId" TEXT NOT NULL,
    "questionText" TEXT NOT NULL,
    "orderIndex" INTEGER NOT NULL DEFAULT 0,
    "options" JSONB NOT NULL,
    "correctOption" TEXT NOT NULL,
    "marks" DOUBLE PRECISION NOT NULL DEFAULT 1,

    CONSTRAINT "QuizQuestion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "QuizSubmission" (
    "id" TEXT NOT NULL,
    "quizId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "score" DOUBLE PRECISION,
    "autoSavedAnswers" JSONB NOT NULL DEFAULT '{}'::jsonb,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "submittedAt" TIMESTAMP(3),

    CONSTRAINT "QuizSubmission_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "CheatingEvent" (
    "id" TEXT NOT NULL,
    "submissionId" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "metadata" JSONB,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CheatingEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "QuizAnswer" (
    "id" TEXT NOT NULL,
    "submissionId" TEXT NOT NULL,
    "questionId" TEXT NOT NULL,
    "selectedOption" TEXT,
    "isCorrect" BOOLEAN NOT NULL DEFAULT false,
    "marksObtained" DOUBLE PRECISION NOT NULL DEFAULT 0,

    CONSTRAINT "QuizAnswer_pkey" PRIMARY KEY ("id")
);

-- Keep the migration safe for databases that were partially updated before
-- question ordering was added to the Prisma model.
ALTER TABLE "QuizQuestion" ADD COLUMN IF NOT EXISTS "orderIndex" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "QuizSubmission" ADD COLUMN IF NOT EXISTS "autoSavedAnswers" JSONB NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE "OnlineQuiz" ADD COLUMN IF NOT EXISTS "availableFrom" TIMESTAMP(3);
ALTER TABLE "OnlineQuiz" ADD COLUMN IF NOT EXISTS "availableUntil" TIMESTAMP(3);
ALTER TABLE "OnlineQuiz" ADD COLUMN IF NOT EXISTS "isFinalized" BOOLEAN NOT NULL DEFAULT false;

-- CreateIndex
CREATE INDEX IF NOT EXISTS "OnlineQuiz_instituteId_idx" ON "OnlineQuiz"("instituteId");
CREATE INDEX IF NOT EXISTS "OnlineQuiz_batchId_idx" ON "OnlineQuiz"("batchId");
CREATE INDEX IF NOT EXISTS "OnlineQuiz_batchId_createdAt_idx" ON "OnlineQuiz"("batchId", "createdAt");
CREATE INDEX IF NOT EXISTS "OnlineQuiz_batchId_availableFrom_availableUntil_idx" ON "OnlineQuiz"("batchId", "availableFrom", "availableUntil");
CREATE INDEX IF NOT EXISTS "OnlineQuiz_teacherId_instituteId_createdAt_idx" ON "OnlineQuiz"("teacherId", "instituteId", "createdAt");
CREATE INDEX IF NOT EXISTS "QuizQuestion_quizId_idx" ON "QuizQuestion"("quizId");
CREATE INDEX IF NOT EXISTS "QuizQuestion_quizId_orderIndex_idx" ON "QuizQuestion"("quizId", "orderIndex");
CREATE UNIQUE INDEX IF NOT EXISTS "QuizSubmission_quizId_studentId_key" ON "QuizSubmission"("quizId", "studentId");
CREATE INDEX IF NOT EXISTS "QuizSubmission_studentId_idx" ON "QuizSubmission"("studentId");
CREATE INDEX IF NOT EXISTS "QuizSubmission_quizId_idx" ON "QuizSubmission"("quizId");
CREATE UNIQUE INDEX IF NOT EXISTS "QuizAnswer_submissionId_questionId_key" ON "QuizAnswer"("submissionId", "questionId");
CREATE INDEX IF NOT EXISTS "QuizAnswer_submissionId_idx" ON "QuizAnswer"("submissionId");
CREATE INDEX IF NOT EXISTS "CheatingEvent_submissionId_timestamp_idx" ON "CheatingEvent"("submissionId", "timestamp");
CREATE INDEX IF NOT EXISTS "CheatingEvent_eventType_idx" ON "CheatingEvent"("eventType");

-- AddForeignKey
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'OnlineQuiz_instituteId_fkey') THEN
        ALTER TABLE "OnlineQuiz" ADD CONSTRAINT "OnlineQuiz_instituteId_fkey"
        FOREIGN KEY ("instituteId") REFERENCES "Institute"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'OnlineQuiz_batchId_fkey') THEN
        ALTER TABLE "OnlineQuiz" ADD CONSTRAINT "OnlineQuiz_batchId_fkey"
        FOREIGN KEY ("batchId") REFERENCES "Batch"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'OnlineQuiz_teacherId_fkey') THEN
        ALTER TABLE "OnlineQuiz" ADD CONSTRAINT "OnlineQuiz_teacherId_fkey"
        FOREIGN KEY ("teacherId") REFERENCES "Admin"("id") ON DELETE SET NULL ON UPDATE CASCADE;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'QuizQuestion_quizId_fkey') THEN
        ALTER TABLE "QuizQuestion" ADD CONSTRAINT "QuizQuestion_quizId_fkey"
        FOREIGN KEY ("quizId") REFERENCES "OnlineQuiz"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'QuizSubmission_quizId_fkey') THEN
        ALTER TABLE "QuizSubmission" ADD CONSTRAINT "QuizSubmission_quizId_fkey"
        FOREIGN KEY ("quizId") REFERENCES "OnlineQuiz"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'QuizSubmission_studentId_fkey') THEN
        ALTER TABLE "QuizSubmission" ADD CONSTRAINT "QuizSubmission_studentId_fkey"
        FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'QuizAnswer_submissionId_fkey') THEN
        ALTER TABLE "QuizAnswer" ADD CONSTRAINT "QuizAnswer_submissionId_fkey"
        FOREIGN KEY ("submissionId") REFERENCES "QuizSubmission"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'QuizAnswer_questionId_fkey') THEN
        ALTER TABLE "QuizAnswer" ADD CONSTRAINT "QuizAnswer_questionId_fkey"
        FOREIGN KEY ("questionId") REFERENCES "QuizQuestion"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'CheatingEvent_submissionId_fkey') THEN
        ALTER TABLE "CheatingEvent" ADD CONSTRAINT "CheatingEvent_submissionId_fkey"
        FOREIGN KEY ("submissionId") REFERENCES "QuizSubmission"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
END $$;
