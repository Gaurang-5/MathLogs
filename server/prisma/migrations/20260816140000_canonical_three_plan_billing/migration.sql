-- Canonical billing is additive, transactional, and safe to re-run after an interrupted attempt.
BEGIN;

DO $enum$
BEGIN
  BEGIN ALTER TYPE "Tier" ADD VALUE 'MARKETPLACE'; EXCEPTION WHEN duplicate_object THEN NULL; END;
  BEGIN ALTER TYPE "Tier" ADD VALUE 'QUIZ'; EXCEPTION WHEN duplicate_object THEN NULL; END;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'BillingCycle' AND typnamespace = current_schema()::regnamespace) THEN
    CREATE TYPE "BillingCycle" AS ENUM ('MONTHLY', 'YEARLY', 'ONE_TIME');
  END IF;
END $enum$;

ALTER TABLE "Institute"
  ADD COLUMN IF NOT EXISTS "billingCycle" "BillingCycle",
  ADD COLUMN IF NOT EXISTS "trialStartedAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "trialEndsAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "trialUsedAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "marketplaceAccessGrantedAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "includedQuizCredits" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "includedQuizCreditsExpireAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "lifetimeQuizCredits" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "quizCreditsRenewAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "canonicalPlanMigratedAt" TIMESTAMP(3);

CREATE TABLE IF NOT EXISTS "BillingPayment" (
  "id" TEXT NOT NULL PRIMARY KEY, "instituteId" TEXT NOT NULL, "plan" "Tier", "creditPackId" TEXT,
  "amountPaise" INTEGER NOT NULL, "billingCycle" "BillingCycle", "status" TEXT NOT NULL DEFAULT 'PENDING',
  "providerOrderId" TEXT NOT NULL, "providerPaymentId" TEXT, "providerSignature" TEXT,
  "verifiedAt" TIMESTAMP(3), "verificationFailedAt" TIMESTAMP(3), "capturedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL
);
CREATE TABLE IF NOT EXISTS "PlanTrialClaim" (
  "id" TEXT NOT NULL PRIMARY KEY, "instituteId" TEXT NOT NULL, "ownerIdentityHash" VARCHAR(128) NOT NULL,
  "plan" "Tier" NOT NULL, "claimedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "endsAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL
);
CREATE TABLE IF NOT EXISTS "BillingWebhookEvent" (
  "id" TEXT NOT NULL PRIMARY KEY, "instituteId" TEXT, "providerEventId" TEXT NOT NULL, "eventType" TEXT NOT NULL,
  "payload" JSONB NOT NULL, "status" TEXT NOT NULL DEFAULT 'RECEIVED', "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "processedAt" TIMESTAMP(3), "processingError" TEXT, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL
);
CREATE TABLE IF NOT EXISTS "PlanNotification" (
  "id" TEXT NOT NULL PRIMARY KEY, "instituteId" TEXT NOT NULL, "event" TEXT NOT NULL, "eventKey" TEXT NOT NULL,
  "channel" TEXT NOT NULL, "scheduledAt" TIMESTAMP(3) NOT NULL, "status" TEXT NOT NULL DEFAULT 'PENDING',
  "transportJobId" TEXT, "attempts" INTEGER NOT NULL DEFAULT 0, "lastAttemptAt" TIMESTAMP(3), "sentAt" TIMESTAMP(3),
  "failedAt" TIMESTAMP(3), "error" TEXT, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS "BillingPayment_providerOrderId_key" ON "BillingPayment"("providerOrderId");
CREATE UNIQUE INDEX IF NOT EXISTS "BillingPayment_providerPaymentId_key" ON "BillingPayment"("providerPaymentId");
CREATE INDEX IF NOT EXISTS "BillingPayment_instituteId_createdAt_idx" ON "BillingPayment"("instituteId", "createdAt");
CREATE INDEX IF NOT EXISTS "BillingPayment_status_createdAt_idx" ON "BillingPayment"("status", "createdAt");
CREATE UNIQUE INDEX IF NOT EXISTS "PlanTrialClaim_instituteId_key" ON "PlanTrialClaim"("instituteId");
CREATE UNIQUE INDEX IF NOT EXISTS "PlanTrialClaim_ownerIdentityHash_key" ON "PlanTrialClaim"("ownerIdentityHash");
CREATE INDEX IF NOT EXISTS "PlanTrialClaim_plan_endsAt_idx" ON "PlanTrialClaim"("plan", "endsAt");
CREATE UNIQUE INDEX IF NOT EXISTS "BillingWebhookEvent_providerEventId_key" ON "BillingWebhookEvent"("providerEventId");
CREATE INDEX IF NOT EXISTS "BillingWebhookEvent_status_receivedAt_idx" ON "BillingWebhookEvent"("status", "receivedAt");
CREATE INDEX IF NOT EXISTS "BillingWebhookEvent_instituteId_receivedAt_idx" ON "BillingWebhookEvent"("instituteId", "receivedAt");
CREATE UNIQUE INDEX IF NOT EXISTS "PlanNotification_instituteId_eventKey_channel_key" ON "PlanNotification"("instituteId", "eventKey", "channel");
CREATE INDEX IF NOT EXISTS "PlanNotification_status_scheduledAt_idx" ON "PlanNotification"("status", "scheduledAt");

DO $constraints$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'BillingPayment_plan_or_credit_pack' AND conrelid = '"BillingPayment"'::regclass) THEN
    ALTER TABLE "BillingPayment" ADD CONSTRAINT "BillingPayment_plan_or_credit_pack" CHECK (
      (("plan" IS NOT NULL)::integer + ("creditPackId" IS NOT NULL)::integer) = 1
      AND ("plan" IS NULL OR "plan"::text IN ('MARKETPLACE', 'QUIZ', 'ENTERPRISE'))
    );
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'PlanTrialClaim_canonical_plan' AND conrelid = '"PlanTrialClaim"'::regclass) THEN
    ALTER TABLE "PlanTrialClaim" ADD CONSTRAINT "PlanTrialClaim_canonical_plan" CHECK (
      "plan"::text IN ('QUIZ', 'ENTERPRISE')
    );
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'BillingWebhookEvent_payload_bounded' AND conrelid = '"BillingWebhookEvent"'::regclass) THEN
    ALTER TABLE "BillingWebhookEvent" ADD CONSTRAINT "BillingWebhookEvent_payload_bounded" CHECK (octet_length("payload"::text) <= 32768);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'BillingPayment_instituteId_fkey' AND conrelid = '"BillingPayment"'::regclass) THEN
    ALTER TABLE "BillingPayment" ADD CONSTRAINT "BillingPayment_instituteId_fkey" FOREIGN KEY ("instituteId") REFERENCES "Institute"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'PlanTrialClaim_instituteId_fkey' AND conrelid = '"PlanTrialClaim"'::regclass) THEN
    ALTER TABLE "PlanTrialClaim" ADD CONSTRAINT "PlanTrialClaim_instituteId_fkey" FOREIGN KEY ("instituteId") REFERENCES "Institute"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'BillingWebhookEvent_instituteId_fkey' AND conrelid = '"BillingWebhookEvent"'::regclass) THEN
    ALTER TABLE "BillingWebhookEvent" ADD CONSTRAINT "BillingWebhookEvent_instituteId_fkey" FOREIGN KEY ("instituteId") REFERENCES "Institute"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'PlanNotification_instituteId_fkey' AND conrelid = '"PlanNotification"'::regclass) THEN
    ALTER TABLE "PlanNotification" ADD CONSTRAINT "PlanNotification_instituteId_fkey" FOREIGN KEY ("instituteId") REFERENCES "Institute"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $constraints$;

COMMIT;
