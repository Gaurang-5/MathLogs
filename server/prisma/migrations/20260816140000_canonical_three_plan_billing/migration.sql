-- Canonical billing is additive. Legacy Tier values and all existing business rows remain intact.

ALTER TYPE "Tier" ADD VALUE IF NOT EXISTS 'MARKETPLACE';
ALTER TYPE "Tier" ADD VALUE IF NOT EXISTS 'QUIZ';

CREATE TYPE "BillingCycle" AS ENUM ('MONTHLY', 'YEARLY', 'ONE_TIME');

ALTER TABLE "Institute"
  ADD COLUMN "billingCycle" "BillingCycle",
  ADD COLUMN "trialStartedAt" TIMESTAMP(3),
  ADD COLUMN "trialEndsAt" TIMESTAMP(3),
  ADD COLUMN "trialUsedAt" TIMESTAMP(3),
  ADD COLUMN "marketplaceAccessGrantedAt" TIMESTAMP(3),
  ADD COLUMN "includedQuizCredits" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "includedQuizCreditsExpireAt" TIMESTAMP(3),
  ADD COLUMN "lifetimeQuizCredits" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "quizCreditsRenewAt" TIMESTAMP(3),
  ADD COLUMN "canonicalPlanMigratedAt" TIMESTAMP(3);

CREATE TABLE "BillingPayment" (
  "id" TEXT NOT NULL,
  "instituteId" TEXT NOT NULL,
  "plan" "Tier",
  "creditPackId" TEXT,
  "amountPaise" INTEGER NOT NULL,
  "billingCycle" "BillingCycle",
  "status" TEXT NOT NULL DEFAULT 'PENDING',
  "providerOrderId" TEXT NOT NULL,
  "providerPaymentId" TEXT,
  "providerSignature" TEXT,
  "verifiedAt" TIMESTAMP(3),
  "verificationFailedAt" TIMESTAMP(3),
  "capturedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "BillingPayment_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "PlanTrialClaim" (
  "id" TEXT NOT NULL,
  "instituteId" TEXT NOT NULL,
  "ownerIdentityHash" VARCHAR(128) NOT NULL,
  "plan" "Tier" NOT NULL,
  "claimedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "endsAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "PlanTrialClaim_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "BillingWebhookEvent" (
  "id" TEXT NOT NULL,
  "instituteId" TEXT,
  "providerEventId" TEXT NOT NULL,
  "eventType" TEXT NOT NULL,
  "payload" JSONB NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'RECEIVED',
  "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "processedAt" TIMESTAMP(3),
  "processingError" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "BillingWebhookEvent_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "BillingWebhookEvent_payload_bounded" CHECK (octet_length("payload"::text) <= 32768)
);

CREATE TABLE "PlanNotification" (
  "id" TEXT NOT NULL,
  "instituteId" TEXT NOT NULL,
  "event" TEXT NOT NULL,
  "eventKey" TEXT NOT NULL,
  "channel" TEXT NOT NULL,
  "scheduledAt" TIMESTAMP(3) NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'PENDING',
  "transportJobId" TEXT,
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "lastAttemptAt" TIMESTAMP(3),
  "sentAt" TIMESTAMP(3),
  "failedAt" TIMESTAMP(3),
  "error" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "PlanNotification_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "BillingPayment_providerOrderId_key" ON "BillingPayment"("providerOrderId");
CREATE UNIQUE INDEX "BillingPayment_providerPaymentId_key" ON "BillingPayment"("providerPaymentId");
CREATE INDEX "BillingPayment_instituteId_createdAt_idx" ON "BillingPayment"("instituteId", "createdAt");
CREATE INDEX "BillingPayment_status_createdAt_idx" ON "BillingPayment"("status", "createdAt");
CREATE UNIQUE INDEX "PlanTrialClaim_instituteId_key" ON "PlanTrialClaim"("instituteId");
CREATE UNIQUE INDEX "PlanTrialClaim_ownerIdentityHash_key" ON "PlanTrialClaim"("ownerIdentityHash");
CREATE INDEX "PlanTrialClaim_plan_endsAt_idx" ON "PlanTrialClaim"("plan", "endsAt");
CREATE UNIQUE INDEX "BillingWebhookEvent_providerEventId_key" ON "BillingWebhookEvent"("providerEventId");
CREATE INDEX "BillingWebhookEvent_status_receivedAt_idx" ON "BillingWebhookEvent"("status", "receivedAt");
CREATE INDEX "BillingWebhookEvent_instituteId_receivedAt_idx" ON "BillingWebhookEvent"("instituteId", "receivedAt");
CREATE UNIQUE INDEX "PlanNotification_instituteId_eventKey_channel_key" ON "PlanNotification"("instituteId", "eventKey", "channel");
CREATE INDEX "PlanNotification_status_scheduledAt_idx" ON "PlanNotification"("status", "scheduledAt");

ALTER TABLE "BillingPayment" ADD CONSTRAINT "BillingPayment_instituteId_fkey" FOREIGN KEY ("instituteId") REFERENCES "Institute"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PlanTrialClaim" ADD CONSTRAINT "PlanTrialClaim_instituteId_fkey" FOREIGN KEY ("instituteId") REFERENCES "Institute"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "BillingWebhookEvent" ADD CONSTRAINT "BillingWebhookEvent_instituteId_fkey" FOREIGN KEY ("instituteId") REFERENCES "Institute"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "PlanNotification" ADD CONSTRAINT "PlanNotification_instituteId_fkey" FOREIGN KEY ("instituteId") REFERENCES "Institute"("id") ON DELETE CASCADE ON UPDATE CASCADE;
