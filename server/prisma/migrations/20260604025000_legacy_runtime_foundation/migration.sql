-- These runtime tables existed in deployed databases before their first
-- checked-in trigger/ALTER migrations. Supply their pre-change shapes for fresh
-- deploys at the earliest point where the historical chain references them.
CREATE TABLE IF NOT EXISTS "LeadInquiry" (
  "id" TEXT NOT NULL,
  "instituteId" TEXT NOT NULL,
  "studentName" TEXT NOT NULL,
  "phone" TEXT NOT NULL,
  "subject" TEXT,
  "classGrade" TEXT,
  "message" TEXT,
  "status" TEXT NOT NULL DEFAULT 'NEW',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "LeadInquiry_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "WhatsappJob" (
  "id" TEXT NOT NULL,
  "recipient" TEXT NOT NULL,
  "templateId" TEXT NOT NULL,
  "data" JSONB NOT NULL,
  "status" "JobStatus" NOT NULL DEFAULT 'PENDING',
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "maxAttempts" INTEGER NOT NULL DEFAULT 3,
  "error" TEXT,
  "messageId" TEXT,
  "instituteId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "WhatsappJob_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "RefreshToken" (
  "id" TEXT NOT NULL,
  "token" TEXT NOT NULL,
  "adminId" TEXT NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "RefreshToken_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "LeadInquiry_instituteId_idx" ON "LeadInquiry"("instituteId");
CREATE INDEX IF NOT EXISTS "LeadInquiry_instituteId_status_idx" ON "LeadInquiry"("instituteId", "status");
CREATE INDEX IF NOT EXISTS "LeadInquiry_createdAt_idx" ON "LeadInquiry"("createdAt");
CREATE INDEX IF NOT EXISTS "WhatsappJob_status_idx" ON "WhatsappJob"("status");
CREATE INDEX IF NOT EXISTS "WhatsappJob_createdAt_idx" ON "WhatsappJob"("createdAt");
CREATE INDEX IF NOT EXISTS "idx_whatsapp_queue" ON "WhatsappJob"("status", "attempts", "createdAt");
CREATE UNIQUE INDEX IF NOT EXISTS "RefreshToken_token_key" ON "RefreshToken"("token");
CREATE INDEX IF NOT EXISTS "RefreshToken_adminId_idx" ON "RefreshToken"("adminId");
CREATE INDEX IF NOT EXISTS "RefreshToken_expiresAt_idx" ON "RefreshToken"("expiresAt");

DO $foundation$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'LeadInquiry_instituteId_fkey') THEN
    ALTER TABLE "LeadInquiry" ADD CONSTRAINT "LeadInquiry_instituteId_fkey"
      FOREIGN KEY ("instituteId") REFERENCES "Institute"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'RefreshToken_adminId_fkey') THEN
    ALTER TABLE "RefreshToken" ADD CONSTRAINT "RefreshToken_adminId_fkey"
      FOREIGN KEY ("adminId") REFERENCES "Admin"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END
$foundation$;

-- A later checked-in migration recreates the payment trigger but assumes this
-- historical helper function already exists.
CREATE OR REPLACE FUNCTION trigger_update_balance_fee_payment()
RETURNS TRIGGER AS $payment_trigger$
BEGIN
  IF TG_OP = 'INSERT' OR TG_OP = 'UPDATE' THEN
    PERFORM calculate_student_balance(NEW."studentId");
  ELSIF TG_OP = 'DELETE' THEN
    PERFORM calculate_student_balance(OLD."studentId");
  END IF;
  RETURN NULL;
END;
$payment_trigger$ LANGUAGE plpgsql;
