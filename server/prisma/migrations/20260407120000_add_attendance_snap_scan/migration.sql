-- CreateEnum
CREATE TYPE "AttendanceSource" AS ENUM ('KIOSK', 'MANUAL');

-- CreateTable
CREATE TABLE "AttendanceRecord" (
    "id" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "batchId" TEXT NOT NULL,
    "instituteId" TEXT NOT NULL,
    "academicYearId" TEXT,
    "attendanceDate" TIMESTAMP(3) NOT NULL,
    "checkedInAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "photoUrl" TEXT,
    "photoMimeType" TEXT,
    "note" TEXT,
    "source" "AttendanceSource" NOT NULL DEFAULT 'KIOSK',
    "manualMarkedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AttendanceRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AttendanceSweepRun" (
    "id" TEXT NOT NULL,
    "batchId" TEXT NOT NULL,
    "instituteId" TEXT NOT NULL,
    "academicYearId" TEXT,
    "attendanceDate" TIMESTAMP(3) NOT NULL,
    "scheduledFor" TIMESTAMP(3) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'COMPLETED',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "AttendanceSweepRun_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "AttendanceRecord_studentId_attendanceDate_key" ON "AttendanceRecord"("studentId", "attendanceDate");

-- CreateIndex
CREATE INDEX "AttendanceRecord_batchId_attendanceDate_checkedInAt_idx" ON "AttendanceRecord"("batchId", "attendanceDate", "checkedInAt");

-- CreateIndex
CREATE INDEX "AttendanceRecord_instituteId_attendanceDate_checkedInAt_idx" ON "AttendanceRecord"("instituteId", "attendanceDate", "checkedInAt");

-- CreateIndex
CREATE UNIQUE INDEX "AttendanceSweepRun_batchId_attendanceDate_key" ON "AttendanceSweepRun"("batchId", "attendanceDate");

-- CreateIndex
CREATE INDEX "AttendanceSweepRun_scheduledFor_idx" ON "AttendanceSweepRun"("scheduledFor");

-- CreateIndex
CREATE INDEX "AttendanceSweepRun_instituteId_attendanceDate_idx" ON "AttendanceSweepRun"("instituteId", "attendanceDate");

-- AddForeignKey
ALTER TABLE "AttendanceRecord" ADD CONSTRAINT "AttendanceRecord_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AttendanceRecord" ADD CONSTRAINT "AttendanceRecord_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "Batch"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AttendanceRecord" ADD CONSTRAINT "AttendanceRecord_instituteId_fkey" FOREIGN KEY ("instituteId") REFERENCES "Institute"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AttendanceRecord" ADD CONSTRAINT "AttendanceRecord_academicYearId_fkey" FOREIGN KEY ("academicYearId") REFERENCES "AcademicYear"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AttendanceRecord" ADD CONSTRAINT "AttendanceRecord_manualMarkedById_fkey" FOREIGN KEY ("manualMarkedById") REFERENCES "Admin"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AttendanceSweepRun" ADD CONSTRAINT "AttendanceSweepRun_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "Batch"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AttendanceSweepRun" ADD CONSTRAINT "AttendanceSweepRun_instituteId_fkey" FOREIGN KEY ("instituteId") REFERENCES "Institute"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AttendanceSweepRun" ADD CONSTRAINT "AttendanceSweepRun_academicYearId_fkey" FOREIGN KEY ("academicYearId") REFERENCES "AcademicYear"("id") ON DELETE SET NULL ON UPDATE CASCADE;
