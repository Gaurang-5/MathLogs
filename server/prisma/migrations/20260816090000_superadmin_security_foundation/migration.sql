-- Superadmin security foundation. All tables are additive.

CREATE TABLE "SuperAdminAuditLog" (
    "id" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT,
    "actorAdminId" TEXT NOT NULL,
    "instituteId" TEXT,
    "reason" TEXT,
    "correlationId" TEXT NOT NULL,
    "supportSessionId" TEXT,
    "before" JSONB,
    "after" JSONB,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SuperAdminAuditLog_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "SuperAdminReauthChallenge" (
    "id" TEXT NOT NULL,
    "adminId" TEXT NOT NULL,
    "actionClass" TEXT NOT NULL,
    "otpHash" TEXT NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "lockedAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "verifiedAt" TIMESTAMP(3),
    "consumedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SuperAdminReauthChallenge_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "SuperAdminSupportSession" (
    "id" TEXT NOT NULL,
    "adminId" TEXT NOT NULL,
    "instituteId" TEXT NOT NULL,
    "ticketId" TEXT,
    "caseId" TEXT,
    "reason" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "endedAt" TIMESTAMP(3),
    "endReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SuperAdminSupportSession_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AuthenticationEvent" (
    "id" TEXT NOT NULL,
    "adminId" TEXT,
    "eventType" TEXT NOT NULL,
    "success" BOOLEAN NOT NULL,
    "ipHash" TEXT,
    "deviceLabel" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuthenticationEvent_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AdminSession" (
    "id" TEXT NOT NULL,
    "adminId" TEXT NOT NULL,
    "deviceLabel" TEXT,
    "ipHash" TEXT,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AdminSession_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "SuperAdminIdempotencyRecord" (
    "id" TEXT NOT NULL,
    "actorAdminId" TEXT NOT NULL,
    "scope" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "requestHash" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "response" JSONB,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SuperAdminIdempotencyRecord_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "RefreshToken" ADD COLUMN "sessionId" TEXT;

CREATE INDEX "SuperAdminAuditLog_createdAt_idx" ON "SuperAdminAuditLog"("createdAt");
CREATE INDEX "SuperAdminAuditLog_entityType_entityId_createdAt_idx" ON "SuperAdminAuditLog"("entityType", "entityId", "createdAt");
CREATE INDEX "SuperAdminAuditLog_instituteId_createdAt_idx" ON "SuperAdminAuditLog"("instituteId", "createdAt");
CREATE INDEX "SuperAdminAuditLog_actorAdminId_createdAt_idx" ON "SuperAdminAuditLog"("actorAdminId", "createdAt");
CREATE INDEX "SuperAdminReauthChallenge_adminId_actionClass_expiresAt_idx" ON "SuperAdminReauthChallenge"("adminId", "actionClass", "expiresAt");
CREATE INDEX "SuperAdminSupportSession_adminId_expiresAt_idx" ON "SuperAdminSupportSession"("adminId", "expiresAt");
CREATE INDEX "SuperAdminSupportSession_instituteId_createdAt_idx" ON "SuperAdminSupportSession"("instituteId", "createdAt");
CREATE INDEX "AuthenticationEvent_adminId_createdAt_idx" ON "AuthenticationEvent"("adminId", "createdAt");
CREATE INDEX "AuthenticationEvent_eventType_success_createdAt_idx" ON "AuthenticationEvent"("eventType", "success", "createdAt");
CREATE INDEX "AdminSession_adminId_revokedAt_expiresAt_idx" ON "AdminSession"("adminId", "revokedAt", "expiresAt");
CREATE UNIQUE INDEX "SuperAdminIdempotencyRecord_actorAdminId_scope_key_key" ON "SuperAdminIdempotencyRecord"("actorAdminId", "scope", "key");
CREATE INDEX "SuperAdminIdempotencyRecord_expiresAt_idx" ON "SuperAdminIdempotencyRecord"("expiresAt");
CREATE INDEX "RefreshToken_sessionId_idx" ON "RefreshToken"("sessionId");

ALTER TABLE "SuperAdminAuditLog" ADD CONSTRAINT "SuperAdminAuditLog_actorAdminId_fkey" FOREIGN KEY ("actorAdminId") REFERENCES "Admin"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SuperAdminReauthChallenge" ADD CONSTRAINT "SuperAdminReauthChallenge_adminId_fkey" FOREIGN KEY ("adminId") REFERENCES "Admin"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SuperAdminSupportSession" ADD CONSTRAINT "SuperAdminSupportSession_adminId_fkey" FOREIGN KEY ("adminId") REFERENCES "Admin"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SuperAdminSupportSession" ADD CONSTRAINT "SuperAdminSupportSession_instituteId_fkey" FOREIGN KEY ("instituteId") REFERENCES "Institute"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AuthenticationEvent" ADD CONSTRAINT "AuthenticationEvent_adminId_fkey" FOREIGN KEY ("adminId") REFERENCES "Admin"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "AdminSession" ADD CONSTRAINT "AdminSession_adminId_fkey" FOREIGN KEY ("adminId") REFERENCES "Admin"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SuperAdminIdempotencyRecord" ADD CONSTRAINT "SuperAdminIdempotencyRecord_actorAdminId_fkey" FOREIGN KEY ("actorAdminId") REFERENCES "Admin"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "RefreshToken" ADD CONSTRAINT "RefreshToken_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "AdminSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE OR REPLACE FUNCTION "prevent_superadmin_audit_mutation"()
RETURNS TRIGGER AS $$
BEGIN
    RAISE EXCEPTION 'SuperAdminAuditLog is immutable';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "SuperAdminAuditLog_immutable"
BEFORE UPDATE OR DELETE ON "SuperAdminAuditLog"
FOR EACH ROW EXECUTE FUNCTION "prevent_superadmin_audit_mutation"();
