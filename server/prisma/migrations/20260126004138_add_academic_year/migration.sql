-- CreateTable
CREATE TABLE "IdCounter" (
    "prefix" TEXT NOT NULL PRIMARY KEY,
    "seq" INTEGER NOT NULL
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Batch" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "subject" TEXT,
    "className" TEXT,
    "timeSlot" TEXT,
    "feeAmount" REAL NOT NULL DEFAULT 0,
    "academicYear" TEXT,
    "whatsappGroupLink" TEXT,
    "isRegistrationOpen" BOOLEAN NOT NULL DEFAULT true,
    "isRegistrationEnded" BOOLEAN NOT NULL DEFAULT false,
    "batchNumber" INTEGER,
    "teacherId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Batch_teacherId_fkey" FOREIGN KEY ("teacherId") REFERENCES "Admin" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Batch" ("className", "createdAt", "feeAmount", "id", "isRegistrationOpen", "name", "subject", "timeSlot", "updatedAt") SELECT "className", "createdAt", "feeAmount", "id", "isRegistrationOpen", "name", "subject", "timeSlot", "updatedAt" FROM "Batch";
DROP TABLE "Batch";
ALTER TABLE "new_Batch" RENAME TO "Batch";
CREATE TABLE "new_Test" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "className" TEXT,
    "date" DATETIME NOT NULL,
    "maxMarks" REAL NOT NULL,
    "teacherId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Test_teacherId_fkey" FOREIGN KEY ("teacherId") REFERENCES "Admin" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Test" ("createdAt", "date", "id", "maxMarks", "name", "subject", "updatedAt") SELECT "createdAt", "date", "id", "maxMarks", "name", "subject", "updatedAt" FROM "Test";
DROP TABLE "Test";
ALTER TABLE "new_Test" RENAME TO "Test";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE INDEX "FeeInstallment_batchId_idx" ON "FeeInstallment"("batchId");

-- CreateIndex
CREATE INDEX "FeePayment_studentId_idx" ON "FeePayment"("studentId");

-- CreateIndex
CREATE INDEX "FeePayment_installmentId_idx" ON "FeePayment"("installmentId");

-- CreateIndex
CREATE INDEX "FeeRecord_studentId_idx" ON "FeeRecord"("studentId");

-- CreateIndex
CREATE INDEX "Mark_testId_idx" ON "Mark"("testId");

-- CreateIndex
CREATE INDEX "Mark_studentId_idx" ON "Mark"("studentId");

-- CreateIndex
CREATE INDEX "Student_batchId_idx" ON "Student"("batchId");

-- CreateIndex
CREATE INDEX "Student_status_idx" ON "Student"("status");

-- CreateIndex
CREATE INDEX "Student_name_idx" ON "Student"("name");
