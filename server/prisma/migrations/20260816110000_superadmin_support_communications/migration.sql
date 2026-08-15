-- Support, targeted communication, consent, and durable job linkage.

ALTER TABLE "EmailJob" ADD COLUMN "superAdminEntityType" TEXT, ADD COLUMN "superAdminEntityId" TEXT;
ALTER TABLE "WhatsappJob" ADD COLUMN "superAdminEntityType" TEXT, ADD COLUMN "superAdminEntityId" TEXT;

CREATE TABLE "SupportTicket" (
  "id" TEXT NOT NULL, "reference" TEXT NOT NULL, "instituteId" TEXT NOT NULL, "category" TEXT NOT NULL,
  "subject" TEXT NOT NULL, "description" TEXT NOT NULL, "priority" TEXT NOT NULL DEFAULT 'NORMAL',
  "status" TEXT NOT NULL DEFAULT 'NEW', "resolvedAt" TIMESTAMP(3), "closedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "SupportTicket_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "SupportMessage" (
  "id" TEXT NOT NULL, "ticketId" TEXT NOT NULL, "authorAdminId" TEXT, "visibility" TEXT NOT NULL,
  "body" TEXT NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "SupportMessage_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "SupportAttachment" (
  "id" TEXT NOT NULL, "ticketId" TEXT NOT NULL, "storageKey" TEXT NOT NULL, "fileName" TEXT NOT NULL,
  "contentType" TEXT NOT NULL, "sizeBytes" INTEGER NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "SupportAttachment_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "InternalCase" (
  "id" TEXT NOT NULL, "instituteId" TEXT NOT NULL, "title" TEXT NOT NULL, "category" TEXT NOT NULL,
  "priority" TEXT NOT NULL DEFAULT 'NORMAL', "status" TEXT NOT NULL DEFAULT 'OPEN', "followUpAt" TIMESTAMP(3),
  "linkedType" TEXT, "linkedId" TEXT, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL, CONSTRAINT "InternalCase_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "InternalCaseNote" (
  "id" TEXT NOT NULL, "caseId" TEXT NOT NULL, "authorAdminId" TEXT NOT NULL, "body" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, CONSTRAINT "InternalCaseNote_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "InstituteCommunicationPreference" (
  "instituteId" TEXT NOT NULL, "whatsappOperational" BOOLEAN NOT NULL DEFAULT false, "whatsappConsentedAt" TIMESTAMP(3),
  "emailOperational" BOOLEAN NOT NULL DEFAULT false, "emailConsentedAt" TIMESTAMP(3), "consentSource" TEXT,
  "updatedAt" TIMESTAMP(3) NOT NULL, CONSTRAINT "InstituteCommunicationPreference_pkey" PRIMARY KEY ("instituteId")
);
CREATE TABLE "TargetedCommunicationSend" (
  "id" TEXT NOT NULL, "channel" TEXT NOT NULL, "templateName" TEXT NOT NULL, "audienceDefinition" JSONB NOT NULL,
  "reason" TEXT NOT NULL, "idempotencyKey" TEXT NOT NULL, "status" TEXT NOT NULL DEFAULT 'DRAFT',
  "includedCount" INTEGER NOT NULL DEFAULT 0, "excludedCount" INTEGER NOT NULL DEFAULT 0, "createdByAdminId" TEXT NOT NULL,
  "dispatchedAt" TIMESTAMP(3), "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "TargetedCommunicationSend_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "TargetedCommunicationRecipient" (
  "id" TEXT NOT NULL, "sendId" TEXT NOT NULL, "instituteId" TEXT, "destination" TEXT NOT NULL, "variables" JSONB NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'PENDING', "exclusionReason" TEXT, "jobId" TEXT, "error" TEXT, "sentAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "TargetedCommunicationRecipient_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "SupportTicket_reference_key" ON "SupportTicket"("reference");
CREATE INDEX "SupportTicket_status_priority_createdAt_idx" ON "SupportTicket"("status", "priority", "createdAt");
CREATE INDEX "SupportTicket_instituteId_updatedAt_idx" ON "SupportTicket"("instituteId", "updatedAt");
CREATE INDEX "SupportMessage_ticketId_createdAt_idx" ON "SupportMessage"("ticketId", "createdAt");
CREATE UNIQUE INDEX "SupportAttachment_storageKey_key" ON "SupportAttachment"("storageKey");
CREATE INDEX "SupportAttachment_ticketId_createdAt_idx" ON "SupportAttachment"("ticketId", "createdAt");
CREATE INDEX "InternalCase_status_followUpAt_idx" ON "InternalCase"("status", "followUpAt");
CREATE INDEX "InternalCase_instituteId_updatedAt_idx" ON "InternalCase"("instituteId", "updatedAt");
CREATE INDEX "InternalCaseNote_caseId_createdAt_idx" ON "InternalCaseNote"("caseId", "createdAt");
CREATE UNIQUE INDEX "TargetedCommunicationSend_idempotencyKey_key" ON "TargetedCommunicationSend"("idempotencyKey");
CREATE INDEX "TargetedCommunicationSend_status_createdAt_idx" ON "TargetedCommunicationSend"("status", "createdAt");
CREATE UNIQUE INDEX "TargetedCommunicationRecipient_sendId_instituteId_key" ON "TargetedCommunicationRecipient"("sendId", "instituteId");
CREATE INDEX "TargetedCommunicationRecipient_status_createdAt_idx" ON "TargetedCommunicationRecipient"("status", "createdAt");
CREATE INDEX "TargetedCommunicationRecipient_instituteId_createdAt_idx" ON "TargetedCommunicationRecipient"("instituteId", "createdAt");
CREATE INDEX "EmailJob_superAdminEntityType_superAdminEntityId_createdAt_idx" ON "EmailJob"("superAdminEntityType", "superAdminEntityId", "createdAt");
CREATE INDEX "WhatsappJob_superAdminEntityType_superAdminEntityId_createdAt_idx" ON "WhatsappJob"("superAdminEntityType", "superAdminEntityId", "createdAt");

ALTER TABLE "SupportTicket" ADD CONSTRAINT "SupportTicket_instituteId_fkey" FOREIGN KEY ("instituteId") REFERENCES "Institute"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SupportMessage" ADD CONSTRAINT "SupportMessage_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "SupportTicket"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SupportMessage" ADD CONSTRAINT "SupportMessage_authorAdminId_fkey" FOREIGN KEY ("authorAdminId") REFERENCES "Admin"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "SupportAttachment" ADD CONSTRAINT "SupportAttachment_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "SupportTicket"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "InternalCase" ADD CONSTRAINT "InternalCase_instituteId_fkey" FOREIGN KEY ("instituteId") REFERENCES "Institute"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "InternalCaseNote" ADD CONSTRAINT "InternalCaseNote_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "InternalCase"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "InternalCaseNote" ADD CONSTRAINT "InternalCaseNote_authorAdminId_fkey" FOREIGN KEY ("authorAdminId") REFERENCES "Admin"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "InstituteCommunicationPreference" ADD CONSTRAINT "InstituteCommunicationPreference_instituteId_fkey" FOREIGN KEY ("instituteId") REFERENCES "Institute"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TargetedCommunicationSend" ADD CONSTRAINT "TargetedCommunicationSend_createdByAdminId_fkey" FOREIGN KEY ("createdByAdminId") REFERENCES "Admin"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "TargetedCommunicationRecipient" ADD CONSTRAINT "TargetedCommunicationRecipient_sendId_fkey" FOREIGN KEY ("sendId") REFERENCES "TargetedCommunicationSend"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TargetedCommunicationRecipient" ADD CONSTRAINT "TargetedCommunicationRecipient_instituteId_fkey" FOREIGN KEY ("instituteId") REFERENCES "Institute"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "SuperAdminSupportSession" ADD CONSTRAINT "SuperAdminSupportSession_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "SupportTicket"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "SuperAdminSupportSession" ADD CONSTRAINT "SuperAdminSupportSession_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "InternalCase"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "SuperAdminSupportSession" ADD CONSTRAINT "SuperAdminSupportSession_one_link_check" CHECK (NOT ("ticketId" IS NOT NULL AND "caseId" IS NOT NULL));
