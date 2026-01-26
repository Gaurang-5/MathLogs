/*
  Warnings:

  - A unique constraint covering the columns `[humanId,academicYearId]` on the table `Student` will be added. If there are existing duplicate values, this will fail.

*/
-- DropIndex
DROP INDEX "Student_humanId_key";

-- CreateIndex
CREATE UNIQUE INDEX "Student_humanId_academicYearId_key" ON "Student"("humanId", "academicYearId");
