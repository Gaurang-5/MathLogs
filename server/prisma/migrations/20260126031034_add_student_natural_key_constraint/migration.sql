/*
  Warnings:

  - A unique constraint covering the columns `[name,parentWhatsapp,batchId]` on the table `Student` will be added. If there are existing duplicate values, this will fail.

*/
-- CreateIndex
CREATE UNIQUE INDEX "Student_name_parentWhatsapp_batchId_key" ON "Student"("name", "parentWhatsapp", "batchId");
