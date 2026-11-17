CREATE TABLE "StickerResearchCapture" (
    "id" TEXT NOT NULL,
    "instituteId" TEXT NOT NULL,
    "instituteName" TEXT NOT NULL,
    "teacherId" TEXT NOT NULL,
    "teacherName" TEXT NOT NULL,
    "studentId" TEXT,
    "studentHumanId" TEXT,
    "studentName" TEXT,
    "testId" TEXT,
    "testName" TEXT,
    "maxMarks" DOUBLE PRECISION,
    "batchId" TEXT,
    "batchName" TEXT,
    "storageKey" TEXT NOT NULL,
    "imageSha256" TEXT NOT NULL,
    "contentType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "captureSource" TEXT NOT NULL,
    "clientPlatform" TEXT NOT NULL,
    "ocrScore" TEXT,
    "ocrStatus" TEXT NOT NULL,
    "ocrReason" TEXT,
    "ocrElapsedMs" INTEGER NOT NULL,
    "cacheHit" BOOLEAN NOT NULL DEFAULT false,
    "identitySource" TEXT,
    "finalScore" DOUBLE PRECISION,
    "reviewDurationMs" INTEGER,
    "wasCorrected" BOOLEAN,
    "wasOverwrite" BOOLEAN,
    "outcome" TEXT NOT NULL DEFAULT 'CAPTURED',
    "consentReference" TEXT NOT NULL,
    "retentionUntil" TIMESTAMP(3) NOT NULL,
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StickerResearchCapture_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "StickerResearchCapture_storageKey_key" ON "StickerResearchCapture"("storageKey");
CREATE INDEX "StickerResearchCapture_instituteId_createdAt_idx" ON "StickerResearchCapture"("instituteId", "createdAt");
CREATE INDEX "StickerResearchCapture_teacherId_createdAt_idx" ON "StickerResearchCapture"("teacherId", "createdAt");
CREATE INDEX "StickerResearchCapture_studentId_createdAt_idx" ON "StickerResearchCapture"("studentId", "createdAt");
CREATE INDEX "StickerResearchCapture_testId_createdAt_idx" ON "StickerResearchCapture"("testId", "createdAt");
CREATE INDEX "StickerResearchCapture_outcome_createdAt_idx" ON "StickerResearchCapture"("outcome", "createdAt");
CREATE INDEX "StickerResearchCapture_retentionUntil_idx" ON "StickerResearchCapture"("retentionUntil");
