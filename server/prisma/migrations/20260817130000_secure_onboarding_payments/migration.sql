ALTER TABLE "Institute" ALTER COLUMN "canonicalPlanMigratedAt" SET DEFAULT CURRENT_TIMESTAMP;

CREATE TABLE "OnboardingPayment" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "providerOrderId" TEXT NOT NULL,
  "providerPaymentId" TEXT,
  "providerSignature" TEXT,
  "amountPaise" INTEGER NOT NULL,
  "currency" TEXT NOT NULL DEFAULT 'INR',
  "plan" "Tier" NOT NULL,
  "billingCycle" "BillingCycle" NOT NULL,
  "onboardingLinkId" TEXT,
  "provisioningData" JSONB NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'PENDING',
  "provisionedInstituteId" TEXT,
  "verifiedAt" TIMESTAMP(3),
  "completedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL
);

CREATE UNIQUE INDEX "OnboardingPayment_providerOrderId_key" ON "OnboardingPayment"("providerOrderId");
CREATE UNIQUE INDEX "OnboardingPayment_providerPaymentId_key" ON "OnboardingPayment"("providerPaymentId");
CREATE INDEX "OnboardingPayment_status_createdAt_idx" ON "OnboardingPayment"("status", "createdAt");

ALTER TABLE "OnboardingPayment" ADD CONSTRAINT "OnboardingPayment_canonical_plan" CHECK ("plan"::text IN ('QUIZ', 'ENTERPRISE'));
ALTER TABLE "OnboardingPayment" ADD CONSTRAINT "OnboardingPayment_canonical_cycle" CHECK ("billingCycle"::text IN ('MONTHLY', 'YEARLY'));
