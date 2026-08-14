-- Durable Superadmin billing and onboarding operations. All tables are additive.

CREATE TABLE "SuperAdminBillingOperation" (
    "id" TEXT NOT NULL,
    "instituteId" TEXT,
    "actorAdminId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "request" JSONB NOT NULL,
    "result" JSONB,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "effectiveAt" TIMESTAMP(3),
    "appliedAt" TIMESTAMP(3),
    "error" TEXT,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "maxAttempts" INTEGER NOT NULL DEFAULT 3,
    "lastAttemptAt" TIMESTAMP(3),
    "nextAttemptAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SuperAdminBillingOperation_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "SuperAdminOnboardingOperation" (
    "id" TEXT NOT NULL,
    "actorAdminId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "requestHash" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "result" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SuperAdminOnboardingOperation_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "SuperAdminOnboardingRow" (
    "id" TEXT NOT NULL,
    "operationId" TEXT NOT NULL,
    "rowNumber" INTEGER NOT NULL,
    "requestHash" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "instituteId" TEXT,
    "result" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SuperAdminOnboardingRow_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "SuperAdminBillingOperation_idempotencyKey_key" ON "SuperAdminBillingOperation"("idempotencyKey");
CREATE INDEX "SuperAdminBillingOperation_instituteId_createdAt_idx" ON "SuperAdminBillingOperation"("instituteId", "createdAt");
CREATE INDEX "SuperAdminBillingOperation_status_effectiveAt_idx" ON "SuperAdminBillingOperation"("status", "effectiveAt");
CREATE INDEX "SuperAdminBillingOperation_actorAdminId_createdAt_idx" ON "SuperAdminBillingOperation"("actorAdminId", "createdAt");
CREATE UNIQUE INDEX "SuperAdminOnboardingOperation_idempotencyKey_key" ON "SuperAdminOnboardingOperation"("idempotencyKey");
CREATE INDEX "SuperAdminOnboardingOperation_actorAdminId_createdAt_idx" ON "SuperAdminOnboardingOperation"("actorAdminId", "createdAt");
CREATE UNIQUE INDEX "SuperAdminOnboardingRow_operationId_rowNumber_key" ON "SuperAdminOnboardingRow"("operationId", "rowNumber");
CREATE INDEX "SuperAdminOnboardingRow_status_updatedAt_idx" ON "SuperAdminOnboardingRow"("status", "updatedAt");

ALTER TABLE "SuperAdminBillingOperation" ADD CONSTRAINT "SuperAdminBillingOperation_instituteId_fkey" FOREIGN KEY ("instituteId") REFERENCES "Institute"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "SuperAdminBillingOperation" ADD CONSTRAINT "SuperAdminBillingOperation_actorAdminId_fkey" FOREIGN KEY ("actorAdminId") REFERENCES "Admin"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SuperAdminOnboardingOperation" ADD CONSTRAINT "SuperAdminOnboardingOperation_actorAdminId_fkey" FOREIGN KEY ("actorAdminId") REFERENCES "Admin"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SuperAdminOnboardingRow" ADD CONSTRAINT "SuperAdminOnboardingRow_operationId_fkey" FOREIGN KEY ("operationId") REFERENCES "SuperAdminOnboardingOperation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
