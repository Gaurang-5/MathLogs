DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM "Institute"
    WHERE "isPubliclyListed" = true
      AND "city" IS DISTINCT FROM 'Muzaffarnagar'
  ) THEN
    RAISE EXCEPTION 'Public marketplace listings must be backfilled to Muzaffarnagar before this migration';
  END IF;
END $$;

ALTER TABLE "Institute"
  ADD CONSTRAINT "Institute_public_marketplace_city"
  CHECK (
    "isPubliclyListed" = false
    OR ("city" IS NOT NULL AND "city" = 'Muzaffarnagar')
  );
