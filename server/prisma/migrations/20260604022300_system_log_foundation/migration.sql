-- SystemLog predates the checked-in migration chain, but the next historical
-- migration adds an index to it. Recreate it only when it is absent.
CREATE TABLE IF NOT EXISTS "SystemLog" (
  "id" TEXT NOT NULL,
  "instituteId" TEXT NOT NULL,
  "action" TEXT NOT NULL,
  "entityId" TEXT,
  "entityName" TEXT,
  "details" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "SystemLog_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "SystemLog_instituteId_action_idx"
  ON "SystemLog"("instituteId", "action");
CREATE INDEX IF NOT EXISTS "SystemLog_createdAt_idx"
  ON "SystemLog"("createdAt");

DO $foundation$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'SystemLog_instituteId_fkey'
  ) THEN
    ALTER TABLE "SystemLog"
      ADD CONSTRAINT "SystemLog_instituteId_fkey"
      FOREIGN KEY ("instituteId") REFERENCES "Institute"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END
$foundation$;
