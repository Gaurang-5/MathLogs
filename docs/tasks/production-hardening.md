# 🏗️ Production Hardening Plan: Smart Scanning Pipeline

**Goal:** Transition the scanner from MVP to Production-Grade.
**Priority:** P0 (Security) > P1 (Performance) > P2 (Robustness).

## P0: Security & Architecture (IMMEDIATE)
- [ ] **Create Backend OCR Proxy**
  - [ ] Add `POST /api/scan-ocr` endpoint in server.
  - [ ] Move Gemini API logic from `client/src/utils/ocr.ts` to server.
  - [ ] Configure `VITE_GEMINI_API_KEY` removal from client env.
  - [ ] Implement rate limiting (e.g., limit calls per user/minute).
  - [ ] Validate image payload size/type on server.

## P1: Performance Optimization
- [ ] **Migrate CV to Web Worker**
  - [ ] Create `cv.worker.ts` for off-main-thread processing.
  - [ ] Move `detectAndWarpSticker` logic to worker.
  - [ ] Implement `Transferable` objects (ArrayBuffer) for zero-copy messaging.
  - [ ] Add worker fallback/error handling.
- [ ] **Optimize Image Handling**
  - [ ] Downscale large camera frames before processing.
  - [ ] Implement adaptive retry strategy (instead of fixed 5x loop).

## P2: Robustness & Accuracy
- [ ] **Enhance Marker Detection**
  - [ ] Implement L-marker detection using contour hierarchy or template matching.
  - [ ] Add orientation validation (reject >45° rotation if needed or de-rotate).
  - [ ] Replace naive aspect ratio check with clearer geometric constraints.
- [ ] **Refine OCR Logic**
  - [ ] Update prompt to return `ERROR_UNCERTAIN` instead of `0`.
  - [ ] Add strict regex validation for numeric outputs.
  - [ ] Implement JSON mode for structured AI responses.

## P3: Observability & Monitoring
- [ ] **Add Telemetry**
  - [ ] Track `scan_success_rate`, `ocr_latency`, `cv_failure_rate`.
  - [ ] Log "phantom zero" occurrences.
  - [ ] Set up alerts for high failure rates.

## Validation Checklist
- [ ] Security audit passes (no exposed keys).
- [ ] Performance audit passes (no UI jank on mid-range devices).
- [ ] Accuracy audit passes (99% on test set).
