-- DropIndex
DROP INDEX "FeePayment_studentId_installmentId_key";

-- CreateIndex
CREATE INDEX "FeePayment_studentId_installmentId_idx" ON "FeePayment"("studentId", "installmentId");
