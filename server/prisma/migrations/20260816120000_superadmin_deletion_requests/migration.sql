CREATE TABLE "SuperAdminDeletionRequest" (
  "id" TEXT NOT NULL,
  "instituteId" TEXT,
  "requestedById" TEXT NOT NULL,
  "reason" TEXT NOT NULL,
  "instituteName" TEXT NOT NULL,
  "previousInstituteStatus" TEXT NOT NULL,
  "previousRegistrationsPaused" BOOLEAN NOT NULL DEFAULT false,
  "status" TEXT NOT NULL DEFAULT 'SCHEDULED',
  "eligibleAt" TIMESTAMP(3) NOT NULL,
  "cancelledAt" TIMESTAMP(3),
  "completedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "SuperAdminDeletionRequest_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "SuperAdminDeletionRequest_status_eligibleAt_idx" ON "SuperAdminDeletionRequest"("status", "eligibleAt");
CREATE INDEX "SuperAdminDeletionRequest_instituteId_createdAt_idx" ON "SuperAdminDeletionRequest"("instituteId", "createdAt");
ALTER TABLE "SuperAdminDeletionRequest" ADD CONSTRAINT "SuperAdminDeletionRequest_instituteId_fkey" FOREIGN KEY ("instituteId") REFERENCES "Institute"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "SuperAdminDeletionRequest" ADD CONSTRAINT "SuperAdminDeletionRequest_requestedById_fkey" FOREIGN KEY ("requestedById") REFERENCES "Admin"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
