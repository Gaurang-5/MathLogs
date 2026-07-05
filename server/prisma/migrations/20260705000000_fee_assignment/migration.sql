-- CreateTable
CREATE TABLE "FeeInstallmentAssignment" (
    "id" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "installmentId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FeeInstallmentAssignment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "FeeInstallmentAssignment_studentId_idx" ON "FeeInstallmentAssignment"("studentId");

-- CreateIndex
CREATE INDEX "FeeInstallmentAssignment_installmentId_idx" ON "FeeInstallmentAssignment"("installmentId");

-- CreateIndex
CREATE UNIQUE INDEX "FeeInstallmentAssignment_studentId_installmentId_key" ON "FeeInstallmentAssignment"("studentId", "installmentId");

-- AddForeignKey
ALTER TABLE "FeeInstallmentAssignment" ADD CONSTRAINT "FeeInstallmentAssignment_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FeeInstallmentAssignment" ADD CONSTRAINT "FeeInstallmentAssignment_installmentId_fkey" FOREIGN KEY ("installmentId") REFERENCES "FeeInstallment"("id") ON DELETE CASCADE ON UPDATE CASCADE;
