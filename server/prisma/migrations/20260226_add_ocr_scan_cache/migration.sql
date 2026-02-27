-- Migration: Add OcrScanCache table for DB-backed OCR deduplication
--
-- Replaces the old in-memory Map cache that didn't survive across server instances.
-- This table stores SHA-256 image hashes + OCR results with a 60s TTL.
-- In-process cleanup (setInterval every 5min) deletes expired rows.

CREATE TABLE IF NOT EXISTS "OcrScanCache" (
    "imageHash" TEXT NOT NULL,
    "result"    JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OcrScanCache_pkey" PRIMARY KEY ("imageHash")
);

-- Index for efficient TTL cleanup queries (deletes rows older than 60s)
CREATE INDEX IF NOT EXISTS "OcrScanCache_createdAt_idx" ON "OcrScanCache"("createdAt");
