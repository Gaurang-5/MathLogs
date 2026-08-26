-- Additive Migration: Razorpay Recurring AutoPay for Monthly Plans

CREATE TABLE IF NOT EXISTS "PlanSubscription" (
    "id" TEXT NOT NULL,
    "instituteId" TEXT,
    "onboardingLinkId" TEXT,
    "ownerIdentityHash" VARCHAR(128) NOT NULL,
    "providerSubscriptionId" TEXT,
    "providerPlanId" TEXT NOT NULL,
    "plan" "Tier" NOT NULL,
    "billingCycle" "BillingCycle" NOT NULL DEFAULT 'MONTHLY',
    "amountPaise" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'INR',
    "totalCount" INTEGER NOT NULL DEFAULT 120,
    "trialEligible" BOOLEAN NOT NULL DEFAULT false,
    "trialClaimedAt" TIMESTAMP(3),
    "intendedStartAt" TIMESTAMP(3) NOT NULL,
    "trialEndsAt" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'CREATING',
    "providerCreatedAt" TIMESTAMP(3),
    "firstChargedAt" TIMESTAMP(3),
    "lastChargedAt" TIMESTAMP(3),
    "currentPeriodStart" TIMESTAMP(3),
    "currentPeriodEnd" TIMESTAMP(3),
    "nextChargeAt" TIMESTAMP(3),
    "paymentFailedAt" TIMESTAMP(3),
    "graceEndsAt" TIMESTAMP(3),
    "cancelRequestedAt" TIMESTAMP(3),
    "cancelAtPeriodEnd" BOOLEAN NOT NULL DEFAULT false,
    "cancelEffectiveAt" TIMESTAMP(3),
    "endedAt" TIMESTAMP(3),
    "provisioningData" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PlanSubscription_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "PlanSubscription_billingCycle_check" CHECK ("billingCycle" = 'MONTHLY'),
    CONSTRAINT "PlanSubscription_totalCount_check" CHECK ("totalCount" = 120),
    CONSTRAINT "PlanSubscription_amountPaise_check" CHECK ("amountPaise" IN (24900, 49900))
);

CREATE TABLE IF NOT EXISTS "PlanSubscriptionCharge" (
    "id" TEXT NOT NULL,
    "planSubscriptionId" TEXT NOT NULL,
    "providerPaymentId" TEXT NOT NULL,
    "providerInvoiceId" TEXT,
    "amountPaise" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'INR',
    "periodStart" TIMESTAMP(3) NOT NULL,
    "periodEnd" TIMESTAMP(3) NOT NULL,
    "creditedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PlanSubscriptionCharge_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "BillingWebhookEvent" ADD COLUMN IF NOT EXISTS "planSubscriptionId" TEXT;

-- Foreign Keys
DO $$ BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'PlanSubscription_instituteId_fkey'
    ) THEN
        ALTER TABLE "PlanSubscription"
        ADD CONSTRAINT "PlanSubscription_instituteId_fkey"
        FOREIGN KEY ("instituteId") REFERENCES "Institute"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
    END IF;
END $$;

DO $$ BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'PlanSubscriptionCharge_planSubscriptionId_fkey'
    ) THEN
        ALTER TABLE "PlanSubscriptionCharge"
        ADD CONSTRAINT "PlanSubscriptionCharge_planSubscriptionId_fkey"
        FOREIGN KEY ("planSubscriptionId") REFERENCES "PlanSubscription"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
    END IF;
END $$;

DO $$ BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'BillingWebhookEvent_planSubscriptionId_fkey'
    ) THEN
        ALTER TABLE "BillingWebhookEvent"
        ADD CONSTRAINT "BillingWebhookEvent_planSubscriptionId_fkey"
        FOREIGN KEY ("planSubscriptionId") REFERENCES "PlanSubscription"("id") ON DELETE SET NULL ON UPDATE CASCADE;
    END IF;
END $$;

-- Indexes & Unique constraints
CREATE UNIQUE INDEX IF NOT EXISTS "PlanSubscription_providerSubscriptionId_key" ON "PlanSubscription" ("providerSubscriptionId");
CREATE UNIQUE INDEX IF NOT EXISTS "PlanSubscriptionCharge_providerPaymentId_key" ON "PlanSubscriptionCharge" ("providerPaymentId");
CREATE UNIQUE INDEX IF NOT EXISTS "PlanSubscriptionCharge_providerInvoiceId_key" ON "PlanSubscriptionCharge" ("providerInvoiceId");
CREATE UNIQUE INDEX IF NOT EXISTS "PlanSubscriptionCharge_one_period" ON "PlanSubscriptionCharge" ("planSubscriptionId", "periodStart");

CREATE UNIQUE INDEX IF NOT EXISTS "PlanSubscription_one_open_institute"
ON "PlanSubscription" ("instituteId")
WHERE "instituteId" IS NOT NULL AND status IN ('CREATING','CREATED','AUTHENTICATED','ACTIVE','PENDING','HALTED','PROVIDER_UNKNOWN');

CREATE UNIQUE INDEX IF NOT EXISTS "PlanSubscription_one_open_owner"
ON "PlanSubscription" ("ownerIdentityHash")
WHERE "instituteId" IS NULL AND status IN ('CREATING','CREATED','AUTHENTICATED','ACTIVE','PENDING','HALTED','PROVIDER_UNKNOWN');

CREATE INDEX IF NOT EXISTS "PlanSubscription_status_nextChargeAt_idx" ON "PlanSubscription" ("status", "nextChargeAt");
CREATE INDEX IF NOT EXISTS "PlanSubscription_status_graceEndsAt_idx" ON "PlanSubscription" ("status", "graceEndsAt");
CREATE INDEX IF NOT EXISTS "PlanSubscription_onboardingLinkId_idx" ON "PlanSubscription" ("onboardingLinkId");
CREATE INDEX IF NOT EXISTS "PlanSubscription_ownerIdentityHash_createdAt_idx" ON "PlanSubscription" ("ownerIdentityHash", "createdAt");

CREATE INDEX IF NOT EXISTS "PlanSubscriptionCharge_planSubscriptionId_createdAt_idx" ON "PlanSubscriptionCharge" ("planSubscriptionId", "createdAt");
CREATE INDEX IF NOT EXISTS "BillingWebhookEvent_planSubscriptionId_idx" ON "BillingWebhookEvent" ("planSubscriptionId");
