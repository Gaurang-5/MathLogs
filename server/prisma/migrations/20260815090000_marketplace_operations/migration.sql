-- Pre-deployment ownership backfill counts:
-- SELECT COUNT(*) FROM "Institute" i WHERE EXISTS (SELECT 1 FROM "Admin" a WHERE a."instituteId" = i.id);
-- SELECT COUNT(*) FROM "Institute" i WHERE NOT EXISTS (SELECT 1 FROM "Admin" a WHERE a."instituteId" = i.id);

-- AlterTable
ALTER TABLE "Institute"
    ADD COLUMN "ownershipStatus" TEXT NOT NULL DEFAULT 'UNCLAIMED',
    ADD COLUMN "claimedPhone" TEXT,
    ADD COLUMN "claimedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "LeadInquiry"
    ADD COLUMN "deliveryStatus" TEXT NOT NULL DEFAULT 'HELD',
    ADD COLUMN "destinationPhone" TEXT,
    ADD COLUMN "notificationJobId" TEXT,
    ADD COLUMN "notificationSentAt" TIMESTAMP(3),
    ADD COLUMN "notificationError" TEXT,
    ADD COLUMN "notificationRetryCount" INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN "releasedAt" TIMESTAMP(3),
    ADD COLUMN "possibleDuplicate" BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN "duplicateOfId" TEXT;

-- CreateTable
CREATE TABLE "MarketplaceClaim" (
    "id" TEXT NOT NULL,
    "instituteId" TEXT NOT NULL,
    "claimantName" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "normalizedPhone" TEXT NOT NULL,
    "notes" TEXT,
    "status" TEXT NOT NULL DEFAULT 'NEW',
    "contactedAt" TIMESTAMP(3),
    "decidedAt" TIMESTAMP(3),
    "decidedByAdminId" TEXT,
    "communicationStatus" TEXT NOT NULL DEFAULT 'NOT_SENT',
    "communicationError" TEXT,
    "communicationRetryCount" INTEGER NOT NULL DEFAULT 0,
    "whatsappJobId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MarketplaceClaim_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MarketplaceAuditLog" (
    "id" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "actorAdminId" TEXT,
    "instituteId" TEXT,
    "before" JSONB,
    "after" JSONB,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MarketplaceAuditLog_pkey" PRIMARY KEY ("id")
);

-- Backfill existing owner accounts before releasing their existing inquiries.
UPDATE "Institute" i
SET "ownershipStatus" = 'CLAIMED',
    "claimedPhone" = i."phoneNumber"
WHERE EXISTS (
    SELECT 1 FROM "Admin" a WHERE a."instituteId" = i.id
);

UPDATE "LeadInquiry" li
SET "deliveryStatus" = 'DELIVERED'
WHERE EXISTS (
    SELECT 1 FROM "Admin" a WHERE a."instituteId" = li."instituteId"
);

-- CreateIndex
CREATE INDEX "MarketplaceClaim_status_createdAt_idx" ON "MarketplaceClaim"("status", "createdAt");

-- CreateIndex
CREATE INDEX "MarketplaceClaim_instituteId_createdAt_idx" ON "MarketplaceClaim"("instituteId", "createdAt");

-- CreateIndex
CREATE INDEX "MarketplaceClaim_instituteId_normalizedPhone_status_idx" ON "MarketplaceClaim"("instituteId", "normalizedPhone", "status");

-- CreateIndex
CREATE INDEX "MarketplaceAuditLog_entityType_entityId_createdAt_idx" ON "MarketplaceAuditLog"("entityType", "entityId", "createdAt");

-- CreateIndex
CREATE INDEX "MarketplaceAuditLog_instituteId_createdAt_idx" ON "MarketplaceAuditLog"("instituteId", "createdAt");

-- CreateIndex
CREATE INDEX "MarketplaceAuditLog_createdAt_idx" ON "MarketplaceAuditLog"("createdAt");

-- AddForeignKey
ALTER TABLE "MarketplaceClaim" ADD CONSTRAINT "MarketplaceClaim_instituteId_fkey" FOREIGN KEY ("instituteId") REFERENCES "Institute"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MarketplaceClaim" ADD CONSTRAINT "MarketplaceClaim_decidedByAdminId_fkey" FOREIGN KEY ("decidedByAdminId") REFERENCES "Admin"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MarketplaceAuditLog" ADD CONSTRAINT "MarketplaceAuditLog_actorAdminId_fkey" FOREIGN KEY ("actorAdminId") REFERENCES "Admin"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MarketplaceAuditLog" ADD CONSTRAINT "MarketplaceAuditLog_instituteId_fkey" FOREIGN KEY ("instituteId") REFERENCES "Institute"("id") ON DELETE SET NULL ON UPDATE CASCADE;
