CREATE TABLE "StickerResearchCapture" (
    "id" TEXT NOT NULL,
    "instituteId" TEXT NOT NULL,
    "instituteName" TEXT NOT NULL,
    "teacherId" TEXT NOT NULL,
    "teacherName" TEXT NOT NULL,
    "testId" TEXT NOT NULL,
    "testName" TEXT NOT NULL,
    "maxMarks" DOUBLE PRECISION NOT NULL,
    "storageKey" TEXT NOT NULL,
    "imageSha256" TEXT NOT NULL,
    "contentType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "imageWidth" INTEGER,
    "imageHeight" INTEGER,
    "qrCount" INTEGER,
    "captureSource" TEXT NOT NULL,
    "clientPlatform" TEXT NOT NULL,
    "outcome" TEXT NOT NULL DEFAULT 'CAPTURED',
    "consentReference" TEXT NOT NULL,
    "retentionUntil" TIMESTAMP(3) NOT NULL,
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "StickerResearchCapture_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "StickerResearchOcrAttempt" (
    "id" TEXT NOT NULL,
    "captureId" TEXT NOT NULL,
    "mode" TEXT NOT NULL,
    "targets" JSONB,
    "inputSha256" TEXT NOT NULL,
    "contentType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "result" JSONB NOT NULL,
    "status" TEXT NOT NULL,
    "reason" TEXT,
    "elapsedMs" INTEGER NOT NULL,
    "cacheHit" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "StickerResearchOcrAttempt_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "StickerResearchItem" (
    "id" TEXT NOT NULL,
    "captureId" TEXT NOT NULL,
    "stickerIndex" INTEGER NOT NULL,
    "studentId" TEXT NOT NULL,
    "studentHumanId" TEXT,
    "studentName" TEXT NOT NULL,
    "batchId" TEXT,
    "batchName" TEXT,
    "qrHumanId" TEXT,
    "qrMatched" BOOLEAN,
    "qrX" DOUBLE PRECISION,
    "qrY" DOUBLE PRECISION,
    "identitySource" TEXT NOT NULL,
    "ocrScore" TEXT,
    "finalScore" DOUBLE PRECISION NOT NULL,
    "reviewDurationMs" INTEGER,
    "wasCorrected" BOOLEAN,
    "wasOverwrite" BOOLEAN NOT NULL,
    "outcome" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "StickerResearchItem_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "StickerResearchCapture_storageKey_key" ON "StickerResearchCapture"("storageKey");
CREATE INDEX "StickerResearchCapture_instituteId_createdAt_idx" ON "StickerResearchCapture"("instituteId", "createdAt");
CREATE INDEX "StickerResearchCapture_teacherId_createdAt_idx" ON "StickerResearchCapture"("teacherId", "createdAt");
CREATE INDEX "StickerResearchCapture_testId_createdAt_idx" ON "StickerResearchCapture"("testId", "createdAt");
CREATE INDEX "StickerResearchCapture_outcome_createdAt_idx" ON "StickerResearchCapture"("outcome", "createdAt");
CREATE INDEX "StickerResearchCapture_retentionUntil_idx" ON "StickerResearchCapture"("retentionUntil");
CREATE INDEX "StickerResearchOcrAttempt_captureId_createdAt_idx" ON "StickerResearchOcrAttempt"("captureId", "createdAt");
CREATE INDEX "StickerResearchOcrAttempt_status_createdAt_idx" ON "StickerResearchOcrAttempt"("status", "createdAt");
CREATE UNIQUE INDEX "StickerResearchItem_captureId_stickerIndex_key" ON "StickerResearchItem"("captureId", "stickerIndex");
CREATE INDEX "StickerResearchItem_studentId_createdAt_idx" ON "StickerResearchItem"("studentId", "createdAt");
CREATE INDEX "StickerResearchItem_outcome_createdAt_idx" ON "StickerResearchItem"("outcome", "createdAt");
ALTER TABLE "StickerResearchOcrAttempt" ADD CONSTRAINT "StickerResearchOcrAttempt_captureId_fkey" FOREIGN KEY ("captureId") REFERENCES "StickerResearchCapture"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "StickerResearchItem" ADD CONSTRAINT "StickerResearchItem_captureId_fkey" FOREIGN KEY ("captureId") REFERENCES "StickerResearchCapture"("id") ON DELETE CASCADE ON UPDATE CASCADE;
