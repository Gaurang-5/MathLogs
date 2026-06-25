# 🚀 Scale & Security Hardening Plan

**Objective:** Prepare the system for 100x scale (10,000 centers) and fix immediate reliability issues.

## Phase 1: Security & Stability (Immediate)
- [x] **Fix Scanning Bug:** Debug why marks are not scanning (Worker/Comms issue).
- [x] **Switch to Multipart Upload:**
  - [x] Update `POST /api/scan-ocr` to accept `multipart/form-data`.
  - [x] Use `multer` for stream-based handling (avoids Base64 heap bloat).
  - [x] Client: Send `FormData` instead of JSON.
- [x] **Implement OCR Rate Limiter:**
  - [x] Distinct from API limiter.
  - [x] 15 requests / minute / user.
  - [x] 1000 requests / day / institute (Hard Cap).
- [x] **Payload Validation:**
  - [x] Max file size 5MB (Client & Server).
  - [x] Validate MIME type (JPEG/PNG only).

## Phase 2: Data Integrity & Tenant Isolation
- [ ] **Mandatory Institute ID:**
  - [ ] Add Prisma middleware to enforce `where: { instituteId }`.
  - [ ] Verify all queries include tenant scope.
- [x] **Deduplication:**
  - [x] Server-side SHA-256 hash of uploaded images.
  - [x] Cache results in Memory for 60s to prevent replay billing.

## Phase 3: Async Architecture (Future)
- [ ] **Queue System:**
  - [ ] Introduce BullMQ.
  - [ ] Offload OCR to background worker.
- [ ] **Presigned Uploads:**
  - [ ] Direct-to-S3 upload from client.
  - [ ] Server only processes URL.

## Operational Metrics (Dashboard)
- [ ] OCR Latency (p95).
- [ ] Scan Success %.
- [ ] Rate Limit Hits.
- [ ] Cost Per Tenant.
