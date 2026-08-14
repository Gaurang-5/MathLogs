ALTER TABLE "MarketplaceClaim"
  ADD COLUMN "email" TEXT,
  ADD COLUMN "proofNote" TEXT,
  ADD COLUMN "verificationNote" TEXT,
  ADD COLUMN "rejectionReason" TEXT,
  ADD COLUMN "communicationSentAt" TIMESTAMP(3);
