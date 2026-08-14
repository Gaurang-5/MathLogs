# Superadmin Unified Integration and Rollout Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Integrate Marketplace into the shared shell, complete cross-module Home and institute workspaces, enforce audited support sessions and two-stage deletion, remove legacy portal paths, and prepare one verified production release.

**Architecture:** This plan joins the independently tested foundation, institute/revenue, and support/communications/system modules without duplicating their state. It finishes server middleware boundaries, converts legacy Superadmin entry points to redirects or guarded adapters, adds end-to-end acceptance coverage, and defines a preflighted migration/deployment sequence.

**Tech Stack:** React 19, React Router, TypeScript, Tailwind CSS, Vitest, Express, Prisma 5, PostgreSQL, Node test runner, browser-based visual verification.

## Global Constraints

- Complete the other three coordinated plans before this plan.
- Deliver one release; no partially linked or empty modules remain at completion.
- Preserve all approved Marketplace safeguards and current owner workflows.
- Every legacy Superadmin mutation must be removed, redirected, or protected by the new server boundary.
- Support sessions are short-lived, reason-gated, OTP-verified, visibly impersonated, and auditable.
- Permanent institute deletion is two-stage and cannot execute through the old direct DELETE behavior.
- Run migrations and destructive acceptance tests only against the disposable local database.
- Production migration/deploy requires explicit user approval after preflight and backup confirmation.

---

## File map

- `server/prisma/schema.prisma` — two-stage deletion request persistence.
- `server/prisma/migrations/20260816120000_superadmin_deletion_requests/migration.sql` — additive DDL.
- `server/src/middleware/auth.ts` — validated support-session identity context.
- `server/src/middleware/superAdmin.ts` — support-session audit middleware and challenge consumption.
- `server/src/services/superAdminDeletionService.ts` — schedule/cancel/finalize deletion state machine.
- `server/src/workers/superAdminSessionWorker.ts` — conditional expiry and expiry audit for support sessions.
- `server/src/services/superAdminHomeService.ts` — final cross-module attention composition.
- `server/src/services/superAdminInstituteService.ts` — final cross-module workspace composition.
- `server/src/routes/api.ts` — remove unsafe legacy mutations.
- `server/src/routes/superAdminRoutes.ts` — final deletion and cross-module routes.
- `client/src/pages/SuperAdminMarketplace.tsx` — convert to nested module content without a second shell.
- `client/src/features/superadmin-marketplace/MarketplaceShell.tsx` — retire after navigation responsibilities move to shared shell.
- `client/src/pages/superadmin/SuperAdminHome.tsx` — final attention and metrics.
- `client/src/pages/superadmin/SuperAdminInstituteDetail.tsx` — final real tab integration.
- `client/src/features/superadmin-shell/SupportSessionBanner.tsx` — visible institute impersonation state.
- `client/src/pages/SuperAdminDashboard.tsx` — remove from active routes and delete after parity confirmation.
- `client/src/App.tsx` — final route tree and legacy redirect.

### Task 1: Persist and enforce two-stage institute deletion

**Files:**
- Modify: `server/prisma/schema.prisma`
- Create: `server/prisma/migrations/20260816120000_superadmin_deletion_requests/migration.sql`
- Create: `server/src/services/superAdminDeletionService.ts`
- Modify: `server/src/controllers/superAdminInstituteController.ts`
- Modify: `server/src/routes/superAdminRoutes.ts`
- Modify: `server/src/routes/api.ts`
- Create: `server/tests/superAdminDeletion.test.ts`

**Interfaces:**
- Produces `SuperAdminDeletionRequest` with `SCHEDULED`, `CANCELLED`, and `COMPLETED` states.
- Produces `POST /api/super-admin/institutes/:id/deletion` requiring `Idempotency-Key`, `DELETE /deletion`, and protected `POST /deletion/finalize`.
- Removes active direct `DELETE /api/institutes/:id` behavior.

- [ ] **Step 1: Write failing state-machine and legacy-route tests**

```ts
const scheduled = await post(`/api/super-admin/institutes/${instituteId}/deletion`, {
  reason: 'Duplicate test institute confirmed by owner',
  typedInstituteName: 'Apex Academy'
});
assert.equal(scheduled.status, 201);
assert.equal((await prisma.institute.findUniqueOrThrow({ where: { id: instituteId } })).status, 'DELETION_SCHEDULED');

assert.equal((await deleteLegacy(`/api/institutes/${instituteId}`)).status, 404);
assert.equal((await finalizeDeletion(instituteId, undefined)).status, 403);
```

Test wrong typed name, missing reason, cancellation, challenge consumption, required delay, referential cleanup, concurrent finalize, and immutable pre-delete audit snapshot.

- [ ] **Step 2: Run RED**

Run: `cd server && DATABASE_URL='postgresql://mathlogs_test:mathlogs_test@127.0.0.1:55432/mathlogs_test?schema=public' JWT_SECRET=test-secret NODE_ENV=test npx tsx --test --test-force-exit tests/superAdminDeletion.test.ts`

Expected: missing model/service and legacy route still active.

- [ ] **Step 3: Add deletion request model**

```prisma
model SuperAdminDeletionRequest {
  id             String    @id @default(uuid())
  instituteId    String?
  requestedById  String
  reason         String
  instituteName  String
  previousInstituteStatus String
  status         String    @default("SCHEDULED")
  eligibleAt     DateTime
  cancelledAt    DateTime?
  completedAt    DateTime?
  createdAt      DateTime  @default(now())
  updatedAt      DateTime  @updatedAt
  institute      Institute? @relation(fields: [instituteId], references: [id], onDelete: SetNull)
  requestedBy    Admin     @relation(fields: [requestedById], references: [id])

  @@index([status, eligibleAt])
  @@index([instituteId, createdAt])
}
```

Add matching relation arrays and migration SQL.

- [ ] **Step 4: Implement guarded lifecycle**

Scheduling claims foundation idempotency scope `INSTITUTE_DELETE_SCHEDULE`, requires exact institute-name confirmation, stores `previousInstituteStatus`, deactivates the institute, pauses registrations, and sets `eligibleAt` seven days later. Cancellation requires a reason and restores that stored status. Finalization requires `INSTITUTE_DELETE` challenge, exact name, reason, elapsed eligibility, and a conditional scheduled request. Capture non-secret aggregate counts and institute summary in audit before delete; delete the institute, retain the request with `instituteId: null`, and mark it `COMPLETED` in the same transaction. Audit/billing/communication history configured with `onDelete: SetNull` remains queryable without institute PII.

- [ ] **Step 5: Remove direct legacy deletion and run GREEN**

Remove `router.delete('/institutes/:id', ...)` from `server/src/routes/api.ts`. Do not leave an alias that bypasses re-authentication.

Run: `cd server && npx prisma format && npx prisma validate && npx prisma generate`

Run: `cd server && DATABASE_URL='postgresql://mathlogs_test:mathlogs_test@127.0.0.1:55432/mathlogs_test?schema=public' npx prisma migrate deploy`

Run: `cd server && DATABASE_URL='postgresql://mathlogs_test:mathlogs_test@127.0.0.1:55432/mathlogs_test?schema=public' JWT_SECRET=test-secret NODE_ENV=test npx tsx --test --test-force-exit tests/superAdminDeletion.test.ts tests/superAdminInstitutes.test.ts tests/superAdminSecurity.test.ts`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add server/prisma/schema.prisma server/prisma/migrations/20260816120000_superadmin_deletion_requests server/src/services/superAdminDeletionService.ts server/src/controllers/superAdminInstituteController.ts server/src/routes/superAdminRoutes.ts server/src/routes/api.ts server/tests/superAdminDeletion.test.ts
git commit -m "feat: guard institute deletion lifecycle"
```

### Task 2: Complete support-session authentication and audit context

**Files:**
- Modify: `server/src/middleware/auth.ts`
- Modify: `server/src/middleware/superAdmin.ts`
- Modify: `server/src/services/superAdminSecurityService.ts`
- Modify: `server/src/services/superAdminAuditService.ts`
- Create: `server/src/workers/superAdminSessionWorker.ts`
- Modify: `server/src/index.ts`
- Create: `server/tests/superAdminSupportSession.test.ts`
- Create: `client/src/features/superadmin-shell/SupportSessionBanner.tsx`
- Create: `client/src/features/superadmin-shell/SupportSessionBanner.test.tsx`
- Create: `client/src/features/superadmin-shell/supportSession.ts`
- Modify: `client/src/utils/api.ts`
- Modify: `client/src/components/Layout.tsx`

**Interfaces:**
- Support-session token JWT claims: `{ kind: 'SUPPORT_SESSION', sessionId, actorAdminId, instituteId, role: 'INSTITUTE_ADMIN' }`.
- `req.user` retains institute identity and adds `actorAdminId` and `supportSessionId`.
- Client stores support token in `sessionStorage`, never `localStorage`.

- [ ] **Step 1: Write failing auth and UI tests**

```ts
assert.equal((await callInstituteApi(supportToken)).status, 200);
await endSession(sessionId);
assert.equal((await callInstituteApi(supportToken)).status, 403);
assert.equal(await prisma.superAdminAuditLog.count({ where: { supportSessionId: sessionId, action: 'SUPPORT_MUTATION' } }), 1);
```

Test expiry worker idempotency, wrong institute, linked-ticket mismatch, mutating request audit, prohibited routes, raw token exclusion from logs, sessionStorage behavior, banner visibility, and explicit end-session clearing.

- [ ] **Step 2: Run RED**

Run: `cd server && DATABASE_URL='postgresql://mathlogs_test:mathlogs_test@127.0.0.1:55432/mathlogs_test?schema=public' JWT_SECRET=test-secret NODE_ENV=test npx tsx --test --test-force-exit tests/superAdminSupportSession.test.ts`

Run: `cd client && npm run test:run -- src/features/superadmin-shell/SupportSessionBanner.test.tsx`

Expected: current auth does not understand support tokens; UI missing.

- [ ] **Step 3: Implement server validation and audit**

On support-token authentication, load the session by ID and require `endedAt: null` plus `expiresAt > now`. If linked to a ticket/case, require the link belongs to the same institute. Load the target institute admin context without changing actor identity. Deny password/security changes, subscription purchase/cancellation, Superadmin routes, support-session creation, and permanent deletion with `403 SUPPORT_SESSION_ACTION_FORBIDDEN`. A post-response middleware writes one audit entry for allowed POST/PUT/PATCH/DELETE requests with method, normalized route, response status, actor, institute, session, and correlation ID; never store bodies by default.

The expiry worker uses `updateMany` with `endedAt: null` and `expiresAt <= now`; only the transaction that changes one row writes `SUPPORT_SESSION_EXPIRED`. Repeated polls therefore produce no duplicate audit event.

- [ ] **Step 4: Implement client support-session context**

`apiRequest` uses the support token only while support mode is active. The persistent banner shows institute name, reason, expiry countdown, ticket reference, and End Session. Expiry or 403 clears session state and returns to the Superadmin institute workspace.

- [ ] **Step 5: Run GREEN and commit**

Run focused server/client tests and both builds.

```bash
git add server/src/middleware/auth.ts server/src/middleware/superAdmin.ts server/src/services/superAdminSecurityService.ts server/src/services/superAdminAuditService.ts server/src/workers/superAdminSessionWorker.ts server/src/index.ts server/tests/superAdminSupportSession.test.ts client/src/features/superadmin-shell/SupportSessionBanner.tsx client/src/features/superadmin-shell/SupportSessionBanner.test.tsx client/src/features/superadmin-shell/supportSession.ts client/src/utils/api.ts client/src/components/Layout.tsx
git commit -m "feat: add audited institute support sessions"
```

### Task 3: Integrate Marketplace into the shared shell

**Files:**
- Modify: `client/src/pages/SuperAdminMarketplace.tsx`
- Delete: `client/src/features/superadmin-marketplace/MarketplaceShell.tsx`
- Modify: `client/src/features/superadmin-marketplace/OverviewPanel.tsx`
- Modify: `client/src/features/superadmin-marketplace/ListingsPanel.tsx`
- Modify: `client/src/features/superadmin-marketplace/ClaimsPanel.tsx`
- Modify: `client/src/features/superadmin-marketplace/ReviewsPanel.tsx`
- Modify: `client/src/features/superadmin-marketplace/LeadDeliveryPanel.tsx`
- Create: `client/src/features/superadmin-marketplace/MarketplaceWorkspace.test.tsx`
- Modify: `client/src/App.tsx`

**Interfaces:**
- Preserves existing Marketplace API contracts and `?section=` deep links.
- Consumes shared shell global search, refresh, badges, and route outlet.

- [ ] **Step 1: Write failing integration tests**

Test one sidebar only, Marketplace section tabs, attention badges supplied by shared shell, dirty listing navigation guard across global modules, query deep links, and mobile full-screen editor.

- [ ] **Step 2: Run RED**

Run: `cd client && npm run test:run -- src/features/superadmin-marketplace/MarketplaceWorkspace.test.tsx`

Expected: duplicate Marketplace shell/sidebar.

- [ ] **Step 3: Convert page to module workspace**

Replace `MarketplaceShell` with an internal section header/tab bar. Move global refresh/search/view-marketplace actions into shared shell commands exposed through route context. Preserve listing dirty state and block both section and global module navigation.

- [ ] **Step 4: Run Marketplace and full client tests**

Run: `cd client && npm run test:run`

Run: `cd client && npx eslint src/features/superadmin-marketplace src/pages/SuperAdminMarketplace.tsx`

Run: `cd client && npm run build`

Expected: all existing and new Marketplace tests PASS.

- [ ] **Step 5: Commit**

```bash
git add -A client/src/features/superadmin-marketplace client/src/pages/SuperAdminMarketplace.tsx client/src/App.tsx
git commit -m "refactor: integrate marketplace into superadmin shell"
```

### Task 4: Complete cross-module Home and institute workspaces

**Files:**
- Modify: `server/src/services/superAdminHomeService.ts`
- Modify: `server/src/services/superAdminInstituteService.ts`
- Modify: `server/tests/superAdminHome.test.ts`
- Modify: `server/tests/superAdminInstitutes.test.ts`
- Modify: `client/src/pages/superadmin/SuperAdminHome.tsx`
- Modify: `client/src/pages/superadmin/SuperAdminInstituteDetail.tsx`
- Create: `client/src/pages/superadmin/SuperAdminIntegration.test.tsx`

**Interfaces:**
- Keeps foundation Home and institute response shapes stable.
- Replaces zero/default support/system projections with real module data.

- [ ] **Step 1: Extend failing integration assertions**

Create fixtures for a critical support ticket, failed WhatsApp job, expiring plan, pending claim, and failed targeted recipient. Assert Home classifies and links each item exactly once. Assert institute detail returns real support, Marketplace, billing, leads, and activity records.

- [ ] **Step 2: Run RED**

Run focused Home/institute server tests and the new client integration test.

Expected: support/system/communications data absent from aggregates.

- [ ] **Step 3: Implement cross-module projections**

Compose queries without client-side joins. De-duplicate related job/entity failures so one underlying incident produces one attention item. Keep severity server-defined and ordering deterministic: severity, oldest actionable time, stable ID.

```ts
const activitySources = [
  platformAudit,
  marketplaceAudit,
  billingOperations,
  supportMessages,
  caseNotes,
  communicationRecipients
];
```

Normalize these sources to one cursor-paginated activity contract with `source`, `action`, `summary`, `occurredAt`, `entityType`, `entityId`, and `correlationId`; do not expose internal note text or recipient destinations in summary rows.

- [ ] **Step 4: Wire all real institute tabs**

Overview, Account, Usage, Billing, Marketplace, Leads, Support, and Activity must render the real panels delivered by coordinated plans. No empty development stubs or duplicate fetch layers remain.

- [ ] **Step 5: Verify and commit**

Run focused server tests, all client tests, lint touched files, and both builds.

```bash
git add server/src/services/superAdminHomeService.ts server/src/services/superAdminInstituteService.ts server/tests/superAdminHome.test.ts server/tests/superAdminInstitutes.test.ts client/src/pages/superadmin/SuperAdminHome.tsx client/src/pages/superadmin/SuperAdminInstituteDetail.tsx client/src/pages/superadmin/SuperAdminIntegration.test.tsx
git commit -m "feat: complete unified superadmin operations views"
```

### Task 5: Retire legacy portal UI and secure legacy API surface

**Files:**
- Delete: `client/src/pages/SuperAdminDashboard.tsx`
- Modify: `client/src/App.tsx`
- Modify: `server/src/routes/api.ts`
- Modify: `server/src/controllers/instituteController.ts`
- Create: `server/tests/superAdminLegacyRoutes.test.ts`
- Modify: `docs/superpowers/specs/2026-08-15-superadmin-unified-operations-platform-design.md`

**Interfaces:**
- `/super-admin` remains Home inside the shared shell.
- Old read endpoints may return 301-equivalent client redirects only where public compatibility requires them; old mutation endpoints return 404 or use guarded new services.

- [ ] **Step 1: Write failing legacy-surface tests**

Assert institute admins cannot call global institutes/analytics/onboarding-link routes. Assert direct destructive and plan/config mutations are unavailable. Assert `/super-admin` renders the new Home and no legacy chunk is produced.

- [ ] **Step 2: Run RED**

Run: `cd server && DATABASE_URL='postgresql://mathlogs_test:mathlogs_test@127.0.0.1:55432/mathlogs_test?schema=public' JWT_SECRET=test-secret NODE_ENV=test npx tsx --test --test-force-exit tests/superAdminLegacyRoutes.test.ts`

Expected: legacy routes remain reachable with only generic authentication.

- [ ] **Step 3: Remove or guard every legacy route**

Move remaining necessary reads behind `requireSuperAdmin`; remove migrated mutation routes. Keep institute-owned `/api/institute/me` separate. Delete unused controller exports only after `rg` proves no route imports them.

- [ ] **Step 4: Delete legacy dashboard and update documentation**

Delete the monolithic page after feature-parity checklist passes. Add an implementation note to the design spec identifying the new route modules and removal of legacy entry points.

- [ ] **Step 5: Verify and commit**

Run focused security/API tests, full client tests, both builds, and `git diff --check`.

```bash
git add -A client/src/pages/SuperAdminDashboard.tsx client/src/App.tsx server/src/routes/api.ts server/src/controllers/instituteController.ts server/tests/superAdminLegacyRoutes.test.ts docs/superpowers/specs/2026-08-15-superadmin-unified-operations-platform-design.md
git commit -m "refactor: retire legacy superadmin portal"
```

### Task 6: Final automated, accessibility, and visual acceptance

**Files:**
- Create: `client/src/pages/superadmin/SuperAdminJourneys.test.tsx`
- Create: `server/tests/superAdminJourneys.test.ts`
- Create: `docs/guides/SUPERADMIN_OPERATIONS.md`

**Interfaces:**
- Verifies the final one-release behavior; produces no new product API.

- [ ] **Step 1: Add server journey tests**

Cover attention resolution, onboarding idempotency, billing challenge/idempotency, claim approval, ticket/support session/audit, targeted send/job final state, system retry, and guarded deletion.

```ts
assert.equal((await completeClaimJourney()).finalState, 'APPROVED');
assert.equal((await completeSupportJourney()).audit.every(event => event.correlationId), true);
assert.equal((await repeatTargetedSend()).jobCount, 1);
assert.equal((await finalizeBeforeDeletionDelay()).status, 409);
```

- [ ] **Step 2: Add client journey and accessibility tests**

Cover keyboard navigation, focus restoration, global search, mobile navigation, institute tabs, OTP dialogs, stale conflicts, and each primary workflow. Use real feature components with API-boundary fakes rather than mocking internal state helpers.

```tsx
await user.keyboard('{Tab}{Enter}');
const dialog = screen.getByRole('dialog', { name: /verify this action/i });
expect(within(dialog).getByLabelText(/one-time code/i)).toHaveFocus();
expect(screen.getByRole('navigation', { name: /superadmin/i })).toBeVisible();
expect(screen.queryByText(/not available/i)).not.toBeInTheDocument();
```

- [ ] **Step 3: Run final focused suites**

Run all `superAdmin*.test.ts`, Marketplace backend tests, notification/worker tests, and schema/migration tests against the disposable local database.

Run the full client test suite, targeted lint across all `superadmin-*` features/pages, and both production builds.

- [ ] **Step 4: Run the full server baseline comparison**

Run: `cd server && DATABASE_URL='postgresql://mathlogs_test:mathlogs_test@127.0.0.1:55432/mathlogs_test?schema=public' JWT_SECRET=test-secret NODE_ENV=test npx tsx --test --test-force-exit tests/*.test.ts`

Expected: no new failures relative to the recorded baseline. Fix every new Superadmin or Marketplace failure; document unchanged unrelated baseline failures exactly.

- [ ] **Step 5: Perform visual QA**

Start the server/client against the disposable local database. Verify Home, directory, onboarding, institute tabs, Revenue, Marketplace, Support, Communications, System, re-authentication, support banner, and deletion flow at desktop (1440px), tablet (768px), and mobile (390px). Confirm no console errors and no credential values in logs/network responses.

- [ ] **Step 6: Write operator guide and commit**

Document navigation, attention semantics, re-authentication, support sessions, billing actions, communications, job retry, audit search, deletion, and incident troubleshooting.

```bash
git add client/src/pages/superadmin/SuperAdminJourneys.test.tsx server/tests/superAdminJourneys.test.ts docs/guides/SUPERADMIN_OPERATIONS.md
git commit -m "test: verify unified superadmin operations"
```

### Task 7: Production rollout gate

**Files:**
- No code changes expected.
- Verify: all new migration directories and `.env.example` additions required by communications.

**Interfaces:**
- Produces a release decision and evidence; it does not authorize deployment by itself.

- [ ] **Step 1: Confirm repository and release state**

Require clean worktree, reviewed commits, generated Prisma client, passing focused tests/builds, and migration SQL matching schema changes.

- [ ] **Step 2: Preflight configured production database read-only**

Run `npx prisma migrate status`. Record pending migration names, migration-history divergence, affected legacy row counts, table/column existence, and duplicate/index risks without printing credentials or customer records.

- [ ] **Step 3: Confirm recoverability and explicit approval**

Confirm a current provider snapshot/backup and rollback owner. Present exact migrations and transformations to the user. Do not run `migrate deploy`, `db push`, reset, delete, or backfill without explicit approval in the active conversation.

- [ ] **Step 4: Apply only approved migrations**

After approval, run `npx prisma migrate deploy`. Stop on the first failure; do not use `db push` as a production workaround.

- [ ] **Step 5: Verify production schema and smoke tests**

Run `npx prisma migrate status`, then safe authenticated smoke tests for Superadmin Home, institute search, Marketplace overview, support list, communications templates, and system health. Use a guaranteed nonexistent lookup for public/auth schema probes so no real message is sent.

- [ ] **Step 6: Deploy application and monitor**

Deploy through the project's established hosting workflow only after separate deployment authorization. Monitor correlation-ID errors, job failures, authentication failures, and integration health. Roll back application code if smoke tests fail; follow provider restore procedures for migration rollback rather than destructive ad-hoc SQL.

## Final completion gate

The release is complete only when all coordinated-plan acceptance checkpoints, cross-module journeys, production builds, visual breakpoints, accessibility checks, legacy-route security tests, migration preflight, and operator documentation pass. `main` must be clean and committed; remote push and production deployment remain separate user-authorized actions.
