-- CreateTable
CREATE TABLE "AcademicYear" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "startDate" DATETIME,
    "endDate" DATETIME,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "teacherId" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "AcademicYear_teacherId_fkey" FOREIGN KEY ("teacherId") REFERENCES "Admin" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Admin" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "username" TEXT NOT NULL,
    "password" TEXT NOT NULL,
    "currentAcademicYear" TEXT NOT NULL DEFAULT '2024-2025',
    "currentAcademicYearId" TEXT,
    CONSTRAINT "Admin_currentAcademicYearId_fkey" FOREIGN KEY ("currentAcademicYearId") REFERENCES "AcademicYear" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Admin" ("currentAcademicYear", "id", "password", "username") SELECT "currentAcademicYear", "id", "password", "username" FROM "Admin";
DROP TABLE "Admin";
ALTER TABLE "new_Admin" RENAME TO "Admin";
CREATE UNIQUE INDEX "Admin_username_key" ON "Admin"("username");
CREATE TABLE "new_Batch" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "subject" TEXT,
    "className" TEXT,
    "timeSlot" TEXT,
    "feeAmount" REAL NOT NULL DEFAULT 0,
    "academicYear" TEXT,
    "academicYearId" TEXT,
    "whatsappGroupLink" TEXT,
    "isRegistrationOpen" BOOLEAN NOT NULL DEFAULT true,
    "isRegistrationEnded" BOOLEAN NOT NULL DEFAULT false,
    "batchNumber" INTEGER,
    "teacherId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Batch_academicYearId_fkey" FOREIGN KEY ("academicYearId") REFERENCES "AcademicYear" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Batch_teacherId_fkey" FOREIGN KEY ("teacherId") REFERENCES "Admin" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Batch" ("academicYear", "batchNumber", "className", "createdAt", "feeAmount", "id", "isRegistrationEnded", "isRegistrationOpen", "name", "subject", "teacherId", "timeSlot", "updatedAt", "whatsappGroupLink") SELECT "academicYear", "batchNumber", "className", "createdAt", "feeAmount", "id", "isRegistrationEnded", "isRegistrationOpen", "name", "subject", "teacherId", "timeSlot", "updatedAt", "whatsappGroupLink" FROM "Batch";
DROP TABLE "Batch";
ALTER TABLE "new_Batch" RENAME TO "Batch";
CREATE TABLE "new_Student" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "humanId" TEXT,
    "name" TEXT NOT NULL,
    "parentName" TEXT NOT NULL,
    "parentWhatsapp" TEXT NOT NULL,
    "parentEmail" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "batchId" TEXT,
    "academicYearId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "schoolName" TEXT,
    CONSTRAINT "Student_academicYearId_fkey" FOREIGN KEY ("academicYearId") REFERENCES "AcademicYear" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Student_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "Batch" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Student" ("batchId", "createdAt", "humanId", "id", "name", "parentEmail", "parentName", "parentWhatsapp", "schoolName", "status", "updatedAt") SELECT "batchId", "createdAt", "humanId", "id", "name", "parentEmail", "parentName", "parentWhatsapp", "schoolName", "status", "updatedAt" FROM "Student";
DROP TABLE "Student";
ALTER TABLE "new_Student" RENAME TO "Student";
CREATE UNIQUE INDEX "Student_humanId_key" ON "Student"("humanId");
CREATE INDEX "Student_batchId_idx" ON "Student"("batchId");
CREATE INDEX "Student_status_idx" ON "Student"("status");
CREATE INDEX "Student_name_idx" ON "Student"("name");
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
    "academicYear" TEXT,
    "academicYearId" TEXT,
    CONSTRAINT "Test_academicYearId_fkey" FOREIGN KEY ("academicYearId") REFERENCES "AcademicYear" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Test_teacherId_fkey" FOREIGN KEY ("teacherId") REFERENCES "Admin" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Test" ("academicYear", "className", "createdAt", "date", "id", "maxMarks", "name", "subject", "teacherId", "updatedAt") SELECT "academicYear", "className", "createdAt", "date", "id", "maxMarks", "name", "subject", "teacherId", "updatedAt" FROM "Test";
DROP TABLE "Test";
ALTER TABLE "new_Test" RENAME TO "Test";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE UNIQUE INDEX "AcademicYear_teacherId_name_key" ON "AcademicYear"("teacherId", "name");
