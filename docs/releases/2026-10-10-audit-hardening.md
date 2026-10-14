# Audit hardening and continuous scanning

Both coaching fee modes remain supported. This release changes installment payment safety; it does not convert monthly coverage to installments.

Native Expo sources were extracted from commit 8cbb031 into the independent local repository `/Users/gaurangbhatia/Projects/MathLogs-mobile` (initial commit 9ef1a2c). The live repository and root setup no longer include `mobile/`. The website and its mobile-browser/PWA support remain. A remote repository for the native app has not been created.

Parent web fees retain the existing phone-number lookup and receipt upload without OTP, as requested. Personalized phone links work directly. Strict phone validation, exact matching, institute scoping and no-store responses remain. Phone ownership is not verified in this flow. WhatsApp receipt ingestion is deferred at the user's request. Teachers continue reviewing uploaded receipts.

The scanner's stack mode captures QR-located stickers, reads at most two concurrently, preserves local drafts and shows a review list. It never automatically credits a score. Existing marks require explicit replacement; the server checks the previous score and records revisions. Camera/OCR accuracy must still be measured on real handwriting and phones; synthetic geometry and UI tests do not establish recognition accuracy. Local drafts contain student paper images; clear saved rows when finished, especially on shared devices.

Background workers run by default only in production. Local workers require `ENABLE_BACKGROUND_WORKERS=true`. The old global TLS verification bypass and SMTP body logging are removed. Stale WhatsApp PROCESSING jobs become FAILED with DELIVERY_UNKNOWN, requiring provider reconciliation before retries; blind automatic resends could duplicate delivered messages.

Known remaining work from the broad audit: historic Float-money migration/reconciliation; operational outbox/reconciliation UI; source-branch reconciliation; backup restore drill; calibrated handwriting benchmark. These are not represented as completed by this release.

Frontend TypeScript diagnostics were resolved without weakening compiler options; `npm run build` now runs the strict type check before Vite. This included fixing the kiosk form reset, settings error handler, quiz response types, chart formatter types and a stale installment-delete accessible label.

## Validation

- Server build and strict frontend type check/build pass.
- Client: 113 tests pass across 51 files.
- Focused server suite: 39 tests pass, including disposable PostgreSQL concurrency, authorization, zero-mark revision, enrollment/sticker and payment lifecycle checks.
- Additional payment route/schema contract tests: 7 pass.
- Full server suite: 349 pass, 14 fail. Every remaining failing test also fails against baseline 8cbb031 in the same disposable database/environment; none is newly failing. They concern existing quiz/legacy fixture contracts, invoice mocks, billing checkout expectations, monthly registration mocks and the superadmin schema test. They are not reported as a green full suite.
- Server production dependency audit: zero known vulnerabilities after upgrades. Nodemailer stream transport and receipt attachment checked offline; no test emails were sent.
- Browser: signed into a disposable local institute, navigated from the existing scanner to stack mode, selected a test and verified camera controls become available. Responsive phone layout checked. Physical camera and real handwriting accuracy remain unverified.
- No production student or fee correction was run. The 12 excluded profiles were not changed.
