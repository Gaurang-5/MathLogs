-- Durable marketplace linkage lives on the queue job so worker completion can
-- repair a claim/lead even when the entity-side job ID was not persisted.
ALTER TABLE "WhatsappJob"
  ADD COLUMN "marketplaceEntityType" TEXT,
  ADD COLUMN "marketplaceEntityId" TEXT;

CREATE INDEX "idx_whatsapp_marketplace_entity"
ON "WhatsappJob"("marketplaceEntityType", "marketplaceEntityId", "createdAt");
