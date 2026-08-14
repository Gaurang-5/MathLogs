# Superadmin Marketplace Operations Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the existing marketplace control-center draft into a complete superadmin operations portal for listing editing, ownership claims, review moderation, and safe admission-inquiry delivery.

**Architecture:** Preserve the current `/super-admin/marketplace` route, protected Google operations, public-profile behavior, and review-moderation foundation. Add dedicated Prisma entities and small server services for claims, audit history, account provisioning, and tracked WhatsApp jobs; expose these through a focused superadmin controller. Refactor the current single-page React draft into a typed feature module with an operations shell, data tables, and detail drawers.

**Tech Stack:** React 19, React Router 7, TypeScript 5.9, Vite 7, Tailwind CSS, Lucide React, Express 5, Prisma 5, PostgreSQL, Node test runner, Vitest, Meta WhatsApp queue.

## Global Constraints

- One superadmin operates the portal; do not add assignment or team-queue behavior.
- Claim verification is manual and requires an internal verification note; do not add document uploads.
- Approved claimants log in through the existing phone/WhatsApp OTP flow.
- Create `PAGE_ONLY` access only when the institute has no linked admin; never downgrade an existing account.
- Claimed-listing inquiries route to the owner; unclaimed-listing inquiries remain held until explicitly released.
- Google-derived fields remain writable only through protected Google sync operations.
- Every sensitive mutation requires server-side `SUPER_ADMIN` authorization and an append-only audit entry.
- Decision state and WhatsApp delivery state remain independent so messaging failure never reverses an approval or rejection.
- Preserve all unrelated working-tree changes.

## Existing work disposition

### Keep and extend

- `client/src/App.tsx`: retain the lazy route for `/super-admin/marketplace`.
- `client/src/pages/SuperAdminDashboard.tsx`: retain the Marketplace entry action.
- `client/src/components/GooglePlaceConnectModal.tsx`: retain authenticated Google search and superadmin-driven sync.
- `client/src/pages/CoachingProfile.tsx`: retain display-only Google data and pending-review confirmation copy.
- `client/src/pages/MarketplaceSettings.tsx`: retain removal of institute-admin Google controls and continue using it for owner listing/lead access.
- `server/src/controllers/marketplaceController.ts`: retain public listing, inquiry, review, and Google field protections.
- `server/src/routes/marketplaceRoutes.ts`: retain authenticated Google routes and existing public routes.

### Refactor or replace

- `client/src/pages/SuperAdminMarketplace.tsx`: keep it as page composition, but move tables, drawers, types, API calls, and state helpers into `client/src/features/superadmin-marketplace/`.
- Move superadmin-only controller functions out of `marketplaceController.ts` into `marketplaceSuperAdminController.ts`.
- Replace claim records encoded with `[CLAIM REQUEST]` in `LeadInquiry.studentName` with `MarketplaceClaim` rows.
- Replace the two placeholder Lead Operations and Ownership Claims cards with working navigation sections.

---

### Task 1: Add marketplace ownership, claim, audit, and delivery persistence

**Files:**
- Modify: `server/prisma/schema.prisma`
- Create: `server/prisma/migrations/20260815090000_marketplace_operations/migration.sql`
- Create: `server/tests/marketplaceSchema.test.ts`

**Interfaces:**
- Produces: `MarketplaceClaim`, `MarketplaceAuditLog`, institute ownership fields, and lead delivery fields used by all later tasks.
- Produces claim states `NEW | CONTACTED | APPROVED | REJECTED`, communication states `NOT_SENT | QUEUED | SENT | FAILED`, and lead routing states `HELD | QUEUED | DELIVERED | FAILED` as validated string values in services.

- [ ] **Step 1: Write the failing persistence test**

Create a Node test that creates an institute with `ownershipStatus: 'UNCLAIMED'`, inserts a `MarketplaceClaim`, and asserts the default claim and communication states. Add a second assertion that a `MarketplaceAuditLog` can reference both the actor and institute.

```ts
test('persists marketplace claim and audit state', async () => {
  const institute = await prisma.institute.create({
    data: { name: uniqueName(), ownershipStatus: 'UNCLAIMED' }
  });
  const claim = await prisma.marketplaceClaim.create({
    data: {
      instituteId: institute.id,
      claimantName: 'Riya Sharma',
      phone: '+91 98765 43210',
      normalizedPhone: '9876543210'
    }
  });
  assert.equal(claim.status, 'NEW');
  assert.equal(claim.communicationStatus, 'NOT_SENT');
});
```

- [ ] **Step 2: Run the test and confirm the Prisma client does not yet expose the models**

Run: `cd server && JWT_SECRET=test-secret NODE_ENV=test npx tsx --test tests/marketplaceSchema.test.ts`

Expected: compilation failure mentioning `marketplaceClaim` or `ownershipStatus`.

- [ ] **Step 3: Add the schema models and relations**

Add `MarketplaceClaim` with claimant fields, notes, decision timestamps, communication status/error/retry count, optional `whatsappJobId`, `decidedByAdminId`, and indexes on `[status, createdAt]`, `[instituteId, createdAt]`, and `[instituteId, normalizedPhone, status]`.

Add `MarketplaceAuditLog` with `action`, `entityType`, `entityId`, optional `actorAdminId`, optional `instituteId`, optional `before`/`after`/`metadata` JSON, and indexes on `[entityType, entityId, createdAt]`, `[instituteId, createdAt]`, and `[createdAt]`.

Add these exact fields to `Institute`:

```prisma
ownershipStatus String    @default("UNCLAIMED")
claimedPhone    String?
claimedAt       DateTime?
marketplaceClaims MarketplaceClaim[]
marketplaceAuditLogs MarketplaceAuditLog[]
```

Add these exact fields to `LeadInquiry`:

```prisma
deliveryStatus          String    @default("HELD")
destinationPhone        String?
notificationJobId       String?
notificationSentAt      DateTime?
notificationError       String?
notificationRetryCount  Int       @default(0)
releasedAt              DateTime?
possibleDuplicate       Boolean   @default(false)
duplicateOfId           String?
```

Add named relations from `Admin` for claims decided and audit records authored.

- [ ] **Step 4: Write the migration and deterministic backfill**

The SQL migration creates the tables/columns/indexes, then marks institutes with at least one linked `Admin` as `CLAIMED`. It sets `claimedPhone` from `Institute.phoneNumber` only for that claimed group. Institutes with no linked admin remain `UNCLAIMED`. Existing inquiries for claimed institutes receive `DELIVERED` as the routing state because they are already visible in the owner account; existing inquiries for unclaimed institutes remain `HELD`.

Before applying the update, include two read-only count queries as SQL comments for the deployment runbook:

```sql
SELECT COUNT(*) FROM "Institute" i WHERE EXISTS (SELECT 1 FROM "Admin" a WHERE a."instituteId" = i.id);
SELECT COUNT(*) FROM "Institute" i WHERE NOT EXISTS (SELECT 1 FROM "Admin" a WHERE a."instituteId" = i.id);
```

- [ ] **Step 5: Generate Prisma, validate, apply locally, and rerun the persistence test**

The repository's checked-in migration history is not bootstrap-complete, so do not run `migrate deploy` against the disposable fresh database. Run:

```bash
cd server
npx prisma format
npx prisma validate
npx prisma generate
npx prisma db push --force-reset
JWT_SECRET=test-secret NODE_ENV=test npx tsx --test tests/marketplaceSchema.test.ts
```

Expected: schema validation succeeds, the disposable local database is rebuilt from the current schema, and the test passes. The new production SQL migration remains committed and reviewed separately; `db push --force-reset` is never used with a remote database.

- [ ] **Step 6: Commit the persistence slice**

```bash
git add server/prisma/schema.prisma server/prisma/migrations/20260815090000_marketplace_operations/migration.sql server/tests/marketplaceSchema.test.ts
git commit -m "feat: add marketplace operations data model"
```

---

### Task 2: Add audit and ownership-claim domain services

**Files:**
- Create: `server/src/services/marketplaceAuditService.ts`
- Create: `server/src/services/marketplaceClaimService.ts`
- Create: `server/tests/marketplaceClaimService.test.ts`

**Interfaces:**
- Consumes: Prisma models from Task 1.
- Produces: `normalizeMarketplacePhone(value: string): string`.
- Produces: `submitMarketplaceClaim(input): Promise<MarketplaceClaim>`.
- Produces: `markMarketplaceClaimContacted(input): Promise<MarketplaceClaim>`.
- Produces: `approveMarketplaceClaim(input): Promise<ClaimDecisionResult>`.
- Produces: `rejectMarketplaceClaim(input): Promise<ClaimDecisionResult>`.
- Produces: `writeMarketplaceAudit(tx, event): Promise<void>`.

- [ ] **Step 1: Write failing service tests for deduplication and valid transitions**

Cover these exact cases:

- Phone normalization converts `+91 98765-43210` to `9876543210`.
- A repeated open claim for the same institute and phone returns the existing claim.
- `NEW → CONTACTED` records `contactedAt`.
- Approval without a verification note throws `VERIFICATION_NOTE_REQUIRED`.
- Rejection without a claimant-facing reason throws `REJECTION_REASON_REQUIRED`.
- A completed claim cannot transition again.

- [ ] **Step 2: Run the focused service test and confirm imports fail**

Run: `cd server && JWT_SECRET=test-secret NODE_ENV=test npx tsx --test tests/marketplaceClaimService.test.ts`

Expected: failure because the service modules do not exist.

- [ ] **Step 3: Implement phone normalization, submission deduplication, and contacted transition**

Use a transaction for the find-or-create submission path. Reject normalized numbers outside 10–15 digits with `INVALID_PHONE`. Deduplicate only statuses `NEW` and `CONTACTED`; an approved or rejected historical claim does not prevent a new submission.

- [ ] **Step 4: Implement atomic approval and account provisioning**

`approveMarketplaceClaim` receives:

```ts
type ApproveClaimInput = {
  claimId: string;
  actorAdminId: string;
  verificationNote: string;
};
```

Within one Prisma transaction it must:

1. Re-read and lock the claim through a conditional `updateMany` from `NEW` or `CONTACTED` to `APPROVED`; throw `CLAIM_ALREADY_DECIDED` when zero rows update.
2. Set the institute to `CLAIMED`, assign `claimedPhone`, `claimedAt`, `isVerified: true`, `isPubliclyListed: true`, and `status: 'ACTIVE'`.
3. Set `phoneNumber` to the approved normalized phone; leave `publicPhone` unchanged unless it is empty.
4. Reuse a linked admin if one exists.
5. Otherwise create an `INSTITUTE_ADMIN` with a random hashed password and username equal to the phone when free, or `${phone}-${instituteId.slice(0, 8)}` when taken.
6. Merge `config.planName = 'PAGE_ONLY'` only for a newly provisioned admin; preserve all other config keys.
7. Append `CLAIM_APPROVED` and `LISTING_VERIFIED` audit entries.

Return `{ claim, institute, adminId, newlyProvisioned }` without sending WhatsApp inside the transaction.

- [ ] **Step 5: Implement atomic rejection and audit writing**

`rejectMarketplaceClaim` requires both `verificationNote` and `rejectionReason`, changes only the claim, and appends `CLAIM_REJECTED`. It must not modify institute visibility, verification, ownership, plan, or admins.

- [ ] **Step 6: Run tests and add the paid/full-account regression assertion**

Create an institute with an existing linked admin and non-`PAGE_ONLY` config, approve its claim, and assert its config and admin count are unchanged while ownership becomes claimed.

Run: `cd server && JWT_SECRET=test-secret NODE_ENV=test npx tsx --test tests/marketplaceClaimService.test.ts`

Expected: all claim-service tests pass.

- [ ] **Step 7: Commit the domain-service slice**

```bash
git add server/src/services/marketplaceAuditService.ts server/src/services/marketplaceClaimService.ts server/tests/marketplaceClaimService.test.ts
git commit -m "feat: add marketplace claim workflow"
```

---

### Task 3: Add tracked marketplace WhatsApp notifications

**Files:**
- Modify: `server/src/utils/whatsapp.ts`
- Modify: `server/src/utils/whatsappWorker.ts`
- Modify: `server/.env.example`
- Create: `server/src/services/marketplaceNotificationService.ts`
- Create: `server/tests/marketplaceNotificationService.test.ts`
- Create: `server/tests/whatsappMarketplaceStatus.test.ts`

**Interfaces:**
- Produces: `enqueueWhatsAppTracked(...): Promise<{ queued: boolean; jobId?: string; error?: string }>` while preserving the existing boolean-returning `enqueueWhatsApp` API.
- Produces: `sendClaimApprovalNotification`, `sendClaimRejectionNotification`, and `sendLeadNotification`.
- Consumes: claim and lead IDs so the caller can persist the returned WhatsApp job ID.

- [ ] **Step 1: Write failing notification tests**

Mock the tracked enqueue function and assert exact template inputs:

```ts
await sendClaimApprovalNotification({
  phone: '9876543210', claimantName: 'Riya', instituteName: 'Apex',
  loginUrl: 'https://mathlogs.app/login', instituteId: 'inst-1'
});
```

Assert that missing template configuration returns `{ queued: false, error: 'CLAIM_APPROVAL_TEMPLATE_NOT_CONFIGURED' }` and does not report success.

- [ ] **Step 2: Run the notification test and confirm the module is missing**

Run: `cd server && JWT_SECRET=test-secret NODE_ENV=test npx tsx --test tests/marketplaceNotificationService.test.ts`

- [ ] **Step 3: Add a tracked enqueue primitive without changing current callers**

Extract the current job creation into `enqueueWhatsAppTracked`. Keep `enqueueWhatsApp` as a wrapper returning `result.queued`, so welcome, fee, quiz, attendance, and OTP callers remain source-compatible.

- [ ] **Step 4: Implement the three marketplace notification helpers**

Read these exact environment variables without fake default template names:

```text
WHATSAPP_TEMPLATE_MARKETPLACE_CLAIM_APPROVED
WHATSAPP_TEMPLATE_MARKETPLACE_CLAIM_REJECTED
WHATSAPP_TEMPLATE_MARKETPLACE_LEAD
```

Approval parameters: claimant name, institute name, login URL. Rejection parameters: claimant name, institute name, rejection reason, support URL. Lead parameters: owner name, institute name, student name, class/subject summary, marketplace settings URL.

- [ ] **Step 5: Add template-variable mappings and example configuration**

Extend `TEMPLATE_VAR_MAP` for the configured template names using three, four, and five named body variables respectively, with the login/support/settings URL as button parameter where the approved Meta template includes a dynamic URL button. Document the required variables in `server/.env.example`.

- [ ] **Step 6: Synchronize final worker state back to claims and leads**

After a `WhatsappJob` becomes `COMPLETED`, update any `MarketplaceClaim.whatsappJobId` match to `communicationStatus: 'SENT'` with `communicationSentAt`, and any `LeadInquiry.notificationJobId` match to `deliveryStatus: 'DELIVERED'` with `notificationSentAt`. When the job exhausts retries and becomes `FAILED`, update the matching claim or lead to `FAILED` and copy the truncated worker error. When the worker requeues a non-exhausted job, keep the marketplace record in `QUEUED`.

Add worker tests that mock the Meta request and assert both the WhatsApp job and linked marketplace record change together.

- [ ] **Step 7: Run notification tests and server build**

Run:

```bash
cd server
JWT_SECRET=test-secret NODE_ENV=test npx tsx --test tests/marketplaceNotificationService.test.ts
JWT_SECRET=test-secret NODE_ENV=test npx tsx --test tests/whatsappMarketplaceStatus.test.ts
npm run build
```

Expected: tests and TypeScript build pass.

- [ ] **Step 8: Commit the notification slice**

```bash
git add server/src/utils/whatsapp.ts server/src/utils/whatsappWorker.ts server/src/services/marketplaceNotificationService.ts server/tests/marketplaceNotificationService.test.ts server/tests/whatsappMarketplaceStatus.test.ts server/.env.example
git commit -m "feat: add marketplace WhatsApp notifications"
```

---

### Task 4: Replace claim-as-lead submission and expose claim operations APIs

**Files:**
- Modify: `server/src/controllers/marketplaceController.ts`
- Create: `server/src/controllers/marketplaceSuperAdminController.ts`
- Modify: `server/src/routes/marketplaceRoutes.ts`
- Modify: `server/tests/marketplace.test.ts`
- Create: `server/tests/marketplaceSuperAdmin.test.ts`

**Interfaces:**
- Consumes: claim and notification services from Tasks 2–3.
- Produces public `POST /api/marketplace/coaching/:id/claim` using `MarketplaceClaim`.
- Produces protected claim list/detail/contact/approve/reject/resend endpoints.

- [ ] **Step 1: Update the public claim integration test to reject lead encoding**

Submit a claim, assert the response contains a `MarketplaceClaim` ID and `NEW` status, then assert no `LeadInquiry.studentName` begins with `[CLAIM REQUEST]` for the institute.

- [ ] **Step 2: Write superadmin authorization and state-transition API tests**

Cover 401 without a token, 403 for `INSTITUTE_ADMIN`, claim list success for `SUPER_ADMIN`, contacted transition, approval, rejection, and resend. Generate test JWTs using the same payload shape as `authenticateToken`.

- [ ] **Step 3: Run focused API tests and confirm the new routes fail**

Run:

```bash
cd server
JWT_SECRET=test-secret NODE_ENV=test npx tsx --test tests/marketplace.test.ts tests/marketplaceSuperAdmin.test.ts
```

- [ ] **Step 4: Replace `submitClaimRequest` persistence**

Validate claimant name and phone, verify the institute exists, call `submitMarketplaceClaim`, and return `201` for a new claim or `200` with `deduplicated: true` for an existing open claim. Remove every `[CLAIM REQUEST]` branch from overview counts and lead queries.

- [ ] **Step 5: Implement protected claim controller endpoints**

Add:

```text
GET   /super-admin/claims?status=NEW&query=
GET   /super-admin/claims/:id
PATCH /super-admin/claims/:id/contacted
POST  /super-admin/claims/:id/approve
POST  /super-admin/claims/:id/reject
POST  /super-admin/claims/:id/resend
```

Approval/rejection first save the decision, then call the corresponding notification helper. Persist `communicationStatus`, `communicationError`, `communicationRetryCount`, and `whatsappJobId` separately. A notification failure returns HTTP 200 with the saved decision and `communicationStatus: 'FAILED'`. Resend increments the retry counter and appends a `CLAIM_MESSAGE_RETRIED` audit entry.

- [ ] **Step 6: Run focused API tests and server build**

Run:

```bash
cd server
JWT_SECRET=test-secret NODE_ENV=test npx tsx --test tests/marketplace.test.ts tests/marketplaceSuperAdmin.test.ts
npm run build
```

- [ ] **Step 7: Commit the claim API slice**

```bash
git add server/src/controllers/marketplaceController.ts server/src/controllers/marketplaceSuperAdminController.ts server/src/routes/marketplaceRoutes.ts server/tests/marketplace.test.ts server/tests/marketplaceSuperAdmin.test.ts
git commit -m "feat: add marketplace claim operations APIs"
```

---

### Task 5: Route admission inquiries safely and expose delivery oversight

**Files:**
- Modify: `server/src/controllers/marketplaceController.ts`
- Modify: `server/src/controllers/marketplaceSuperAdminController.ts`
- Modify: `server/src/routes/marketplaceRoutes.ts`
- Create: `server/src/services/marketplaceLeadService.ts`
- Create: `server/tests/marketplaceLeadService.test.ts`
- Modify: `server/tests/marketplace.test.ts`

**Interfaces:**
- Produces: `createMarketplaceLead(input): Promise<LeadRoutingResult>`.
- Produces: `retryMarketplaceLeadNotification(input)` and `releaseMarketplaceLead(input)`.
- Produces protected lead list/retry/release endpoints.

- [ ] **Step 1: Write failing routing tests**

Cover these cases:

- A claimed institute creates a lead in `QUEUED`, targets `whatsappPhone || phoneNumber`, and enqueues a notification.
- An unclaimed institute creates a lead in `HELD`, stores no destination phone, and sends nothing.
- The same institute/phone within 15 minutes sets `possibleDuplicate: true` and `duplicateOfId` to the first lead.
- Releasing a held lead fails while the institute is unclaimed.
- Releasing after claim approval sets `releasedAt` and queues delivery.

- [ ] **Step 2: Run the service test and confirm it fails**

Run: `cd server && JWT_SECRET=test-secret NODE_ENV=test npx tsx --test tests/marketplaceLeadService.test.ts`

- [ ] **Step 3: Implement lead creation and duplicate detection**

Normalize phone input using Task 2’s helper. Query for the most recent lead from the same normalized phone and institute after `new Date(Date.now() - 15 * 60_000)`. Store the lead first, then enqueue the notification for claimed listings and persist the tracked job result.

- [ ] **Step 4: Implement lead retry and explicit release**

Retry is allowed only for claimed institutes and `FAILED` delivery. Release is allowed only for `HELD` leads whose institute is now `CLAIMED`. Both actions append audit entries. Neither action changes the teacher-managed sales `status`.

- [ ] **Step 5: Replace `submitInquiry` with the routing service**

Keep the current response fields and return `deliveryStatus` without exposing the institute destination phone. Use `Inquiry submitted successfully! The coaching teacher will contact you shortly.` for claimed listings. Use `Inquiry received. It will be shared after this listing's ownership is verified.` for held inquiries.

- [ ] **Step 6: Add protected lead-delivery endpoints**

```text
GET  /super-admin/leads?deliveryStatus=&query=
POST /super-admin/leads/:id/retry
POST /super-admin/leads/:id/release
```

The list returns institute ownership context and masks nothing for `SUPER_ADMIN`; institute-admin lead APIs remain restricted to their own institute.

- [ ] **Step 7: Run lead tests, marketplace integration tests, and server build**

Run:

```bash
cd server
JWT_SECRET=test-secret NODE_ENV=test npx tsx --test tests/marketplaceLeadService.test.ts tests/marketplace.test.ts tests/marketplaceSuperAdmin.test.ts
npm run build
```

- [ ] **Step 8: Commit the lead-routing slice**

```bash
git add server/src/services/marketplaceLeadService.ts server/src/controllers/marketplaceController.ts server/src/controllers/marketplaceSuperAdminController.ts server/src/routes/marketplaceRoutes.ts server/tests/marketplaceLeadService.test.ts server/tests/marketplace.test.ts server/tests/marketplaceSuperAdmin.test.ts
git commit -m "feat: route marketplace inquiries to verified owners"
```

---

### Task 6: Complete listing, overview, review, and activity APIs

**Files:**
- Modify: `server/src/controllers/marketplaceSuperAdminController.ts`
- Modify: `server/src/routes/marketplaceRoutes.ts`
- Modify: `server/tests/marketplaceSuperAdmin.test.ts`

**Interfaces:**
- Produces typed JSON shapes consumed by the client API in Task 7.
- Preserves authenticated Google routes and the current review moderation behavior.

- [ ] **Step 1: Write failing API tests for listing editing, conflicts, and Google field protection**

Assert that a superadmin can edit name, teacher, account/public/WhatsApp phones, city, area, address, tagline, description, subjects, classes, logo, visibility, and verification. Assert that sending `googleRating`, `googleReviewCount`, `googleReviews`, `googlePhotos`, or `googlePlaceId` returns 400 and does not change stored values. Send a stale `expectedUpdatedAt` and assert HTTP 409 returns the latest listing without overwriting it.

- [ ] **Step 2: Write failing overview and activity tests**

Assert overview counts for claimed/unclaimed listings, pending claims, pending reviews, held leads, and failed notifications. Assert listing edits write `LISTING_UPDATED` with `before` and `after` JSON.

- [ ] **Step 3: Run the focused API suite and confirm failures**

Run: `cd server && JWT_SECRET=test-secret NODE_ENV=test npx tsx --test tests/marketplaceSuperAdmin.test.ts`

- [ ] **Step 4: Implement the final superadmin endpoints**

```text
GET   /super-admin/overview
GET   /super-admin/listings?query=&filter=
GET   /super-admin/listings/:id
PATCH /super-admin/listings/:id
GET   /super-admin/reviews?status=&query=
PATCH /super-admin/reviews/:id
GET   /super-admin/activity?instituteId=&limit=50
```

Use explicit Prisma `select` objects; do not return admin passwords, internal config secrets, or unrelated institute data. Validate array/string fields and phone formats before update. Compute profile completeness server-side from the same ten fields used in the current overview draft.

`PATCH /super-admin/listings/:id` requires `expectedUpdatedAt`. Perform a conditional `updateMany` using both `id` and `updatedAt`; return HTTP 409 with the current selected listing when zero rows update.

After successful Google connect/sync/unlink handlers, append `GOOGLE_CONNECTED`, `GOOGLE_SYNCED`, or `GOOGLE_UNLINKED` through `writeMarketplaceAudit`. Tests assert Google mutations remain superadmin-only and each successful action creates one audit record.

- [ ] **Step 5: Move the existing superadmin functions out of the public controller**

Remove `getMarketplaceSuperAdminOverview`, `getMarketplaceSuperAdminReviews`, and `updateMarketplaceReviewStatus` from `marketplaceController.ts` after routes import them from `marketplaceSuperAdminController.ts`. Keep `requireSuperAdmin` local to the protected controller or replace it with a reusable middleware scoped to these routes.

- [ ] **Step 6: Run API tests and the entire server suite**

Run:

```bash
cd server
JWT_SECRET=test-secret NODE_ENV=test npx tsx --test tests/marketplaceSuperAdmin.test.ts
npm test
npm run build
```

- [ ] **Step 7: Commit the superadmin API slice**

```bash
git add server/src/controllers/marketplaceController.ts server/src/controllers/marketplaceSuperAdminController.ts server/src/routes/marketplaceRoutes.ts server/tests/marketplaceSuperAdmin.test.ts
git commit -m "feat: complete marketplace operations APIs"
```

---

### Task 7: Create the typed client feature boundary and operations shell

**Files:**
- Create: `client/src/features/superadmin-marketplace/types.ts`
- Create: `client/src/features/superadmin-marketplace/api.ts`
- Create: `client/src/features/superadmin-marketplace/state.ts`
- Create: `client/src/features/superadmin-marketplace/state.test.ts`
- Create: `client/src/features/superadmin-marketplace/MarketplaceShell.tsx`
- Create: `client/src/features/superadmin-marketplace/OverviewPanel.tsx`
- Modify: `client/src/pages/SuperAdminMarketplace.tsx`

**Interfaces:**
- Consumes: exact API shapes from Task 6.
- Produces: `MarketplaceSection = 'overview' | 'listings' | 'claims' | 'reviews' | 'leads'`.
- Produces API methods `getOverview`, `getListings`, `updateListing`, `getClaims`, `contactClaim`, `approveClaim`, `rejectClaim`, `resendClaimMessage`, `getReviews`, `updateReview`, `getLeads`, `retryLead`, `releaseLead`, and `getActivity`.

- [ ] **Step 1: Write failing state-helper tests**

Test URL-section parsing, attention-count mapping, status labels, allowed claim actions, and the invariant that Google-derived fields are absent from the listing update payload type.

- [ ] **Step 2: Run the client test and confirm modules are missing**

Run: `cd client && npm run test:run -- src/features/superadmin-marketplace/state.test.ts`

- [ ] **Step 3: Define shared types and API methods**

Use `apiRequest` from `client/src/utils/api.ts`; remove page-local `fetch` and `authHeaders`. Make response envelopes explicit so HTTP validation errors surface through the shared refresh/error path.

- [ ] **Step 4: Build the operations shell**

Implement the slim left rail, attention badges, compact top utility bar, mobile section selector, refresh action, and `View Marketplace` link. Preserve the current neutral MathLogs palette but remove the oversized promotional hero and placeholder cards.

- [ ] **Step 5: Build the Overview panel**

Render marketplace metrics, attention queue links, incomplete listings, and recent audit activity. Every attention item must switch to the correct filtered section rather than being inert.

- [ ] **Step 6: Refactor the page into composition only**

`SuperAdminMarketplace.tsx` owns selected section, shared overview refresh, and drawer routing. It imports feature panels rather than containing listing/review markup. Keep `App.tsx` and the dashboard route button unchanged except for merge-conflict-safe import cleanup.

- [ ] **Step 7: Run tests, lint the feature, and build**

Run:

```bash
cd client
npm run test:run -- src/features/superadmin-marketplace/state.test.ts
npx eslint src/pages/SuperAdminMarketplace.tsx src/features/superadmin-marketplace
npm run build
```

- [ ] **Step 8: Commit the client foundation**

```bash
git add client/src/pages/SuperAdminMarketplace.tsx client/src/features/superadmin-marketplace
git commit -m "refactor: add marketplace operations shell"
```

---

### Task 8: Implement listings table and full listing editor

**Files:**
- Create: `client/src/features/superadmin-marketplace/ListingsPanel.tsx`
- Create: `client/src/features/superadmin-marketplace/ListingEditorDrawer.tsx`
- Create: `client/src/features/superadmin-marketplace/listingForm.ts`
- Create: `client/src/features/superadmin-marketplace/listingForm.test.ts`
- Modify: `client/src/pages/SuperAdminMarketplace.tsx`
- Reuse: `client/src/components/GooglePlaceConnectModal.tsx`

**Interfaces:**
- Consumes: `MarketplaceListing`, `MarketplaceListingDetail`, `ListingUpdateInput`, `getListings`, `updateListing`, and `getActivity` from Task 7.
- Produces: working listings section and selected-listing drawer.

- [ ] **Step 1: Write failing form-helper tests**

Test initial-value mapping, trimming, phone normalization, required coaching name, subjects/classes array cleanup, dirty-state detection, and omission of every Google-derived field.

- [ ] **Step 2: Run the focused test and confirm failure**

Run: `cd client && npm run test:run -- src/features/superadmin-marketplace/listingForm.test.ts`

- [ ] **Step 3: Build the searchable listings table**

Include filters for public, hidden, verified, unverified, claimed, unclaimed, Google connected, Google stale, and incomplete. Preserve the current preview, publish/hide, verify/unverify, and Google actions. Add loading skeletons and server-backed empty states.

- [ ] **Step 4: Build the listing editor drawer**

Provide fields for coaching/teacher names, account/public/WhatsApp phones, city, area, address, tagline, description, subjects, classes, logo, visibility, and verification. Render Google values as read-only with `Sync Google` and `Unlink` actions through the existing modal. Include Save, Preview Public Page, activity history, inline validation, unsaved-change confirmation, and disabled saving state.

- [ ] **Step 5: Add confirmations and refresh behavior**

Require confirmation for hiding, removing verification, and unlinking Google. After any mutation, refresh only the affected listing plus overview metrics; preserve search, filter, scroll position, and drawer selection.

- [ ] **Step 6: Run tests, lint, and build**

Run:

```bash
cd client
npm run test:run -- src/features/superadmin-marketplace/listingForm.test.ts
npx eslint src/features/superadmin-marketplace/ListingsPanel.tsx src/features/superadmin-marketplace/ListingEditorDrawer.tsx src/features/superadmin-marketplace/listingForm.ts
npm run build
```

- [ ] **Step 7: Commit the listing UI slice**

```bash
git add client/src/features/superadmin-marketplace client/src/pages/SuperAdminMarketplace.tsx client/src/components/GooglePlaceConnectModal.tsx
git commit -m "feat: add superadmin listing editor"
```

---

### Task 9: Implement claims, reviews, and lead-delivery queues

**Files:**
- Create: `client/src/features/superadmin-marketplace/ClaimsPanel.tsx`
- Create: `client/src/features/superadmin-marketplace/ClaimDetailDrawer.tsx`
- Create: `client/src/features/superadmin-marketplace/ReviewsPanel.tsx`
- Create: `client/src/features/superadmin-marketplace/LeadDeliveryPanel.tsx`
- Create: `client/src/features/superadmin-marketplace/claimState.ts`
- Create: `client/src/features/superadmin-marketplace/claimState.test.ts`
- Modify: `client/src/pages/SuperAdminMarketplace.tsx`

**Interfaces:**
- Consumes: typed claim, review, lead, and activity APIs from Task 7.
- Produces: working queue screens and decision/retry interactions.

- [ ] **Step 1: Write failing claim-state tests**

Test that `NEW` permits Contacted/Approve/Reject, `CONTACTED` permits Approve/Reject, completed states permit no decision, approval requires a trimmed verification note, and rejection requires both verification note and claimant-facing reason.

- [ ] **Step 2: Run the focused test and confirm failure**

Run: `cd client && npm run test:run -- src/features/superadmin-marketplace/claimState.test.ts`

- [ ] **Step 3: Build Claims and the claim detail drawer**

The queue defaults to pending states and supports status/search filters. The drawer shows claimant and listing context, prior claim history, contact action, required notes, Approve, Reject, message status/error, Resend, and audit activity. After a decision, render the committed decision even when messaging fails.

- [ ] **Step 4: Move current review moderation into ReviewsPanel**

Preserve rating, reviewer, source, institute, date, and status. Add pending/approved/rejected filters, search, confirmations, loading/error states, and audit-aware refresh. Remove the inert overflow icon unless it has an implemented action.

- [ ] **Step 5: Build Lead Delivery oversight**

Show institute, ownership status, family inquiry details, subject/class, destination, submission time, held/queued/delivered/failed state, retry count, and last error. Show `Resend` only for failed claimed-listing notifications and `Release to Owner` only for held leads whose institute is now claimed. Do not add superadmin controls for teacher sales status.

- [ ] **Step 6: Connect badges and overview deep links**

Refreshing or mutating claims, reviews, or leads updates navigation badge counts and Overview attention items without a full-page reload.

- [ ] **Step 7: Run feature tests, lint, and build**

Run:

```bash
cd client
npm run test:run -- src/features/superadmin-marketplace/state.test.ts src/features/superadmin-marketplace/listingForm.test.ts src/features/superadmin-marketplace/claimState.test.ts
npx eslint src/pages/SuperAdminMarketplace.tsx src/features/superadmin-marketplace
npm run build
```

- [ ] **Step 8: Commit the operations queues**

```bash
git add client/src/features/superadmin-marketplace client/src/pages/SuperAdminMarketplace.tsx
git commit -m "feat: add marketplace claims and delivery queues"
```

---

### Task 10: Complete owner lead handling, regression coverage, and visual verification

**Files:**
- Modify: `client/src/pages/MarketplaceSettings.tsx`
- Modify: `server/src/controllers/marketplaceController.ts`
- Modify: `server/src/routes/marketplaceRoutes.ts`
- Modify: `server/tests/marketplace.test.ts`
- Create: `client/src/features/superadmin-marketplace/ownerLeadState.test.ts`
- Modify: `docs/guides/WHATSAPP_BOT_SETUP.md`

**Interfaces:**
- Consumes: routed leads from Task 5.
- Produces: owner-side `NEW → CONTACTED → ENROLLED | CLOSED` status updates and the final verified workflow.

- [ ] **Step 1: Write failing owner-permission and status-transition tests**

Assert that an institute admin can update only leads belonging to their institute, valid statuses are accepted, invalid statuses return 400, and superadmin delivery endpoints do not mutate the sales status.

- [ ] **Step 2: Add the owner lead-status endpoint**

Add `PATCH /api/marketplace/admin/leads/:id` with authenticated institute scoping and accepted statuses `NEW`, `CONTACTED`, `ENROLLED`, and `CLOSED`. Return 404 for another institute’s lead so record existence is not leaked.

- [ ] **Step 3: Add owner lead actions to Marketplace Settings**

Keep the existing page-only navigation and upgrade banner. In the Leads tab, add Call and WhatsApp links plus the four owner-managed statuses. Do not show held leads until superadmin release makes them available.

- [ ] **Step 4: Document WhatsApp templates and retry behavior**

Add the three environment variables, ordered template parameters, dynamic button URL requirements, queue semantics, and the fact that approval/rejection decisions persist when queueing fails.

- [ ] **Step 5: Run all automated verification**

Run:

```bash
cd server
npm test
npm run build
cd ../client
npm run test:run
npm run lint
npm run build
```

Expected: all tests, both TypeScript builds, and client lint pass.

- [ ] **Step 6: Run browser workflow verification**

Use the in-app browser at desktop, tablet, and mobile widths. Verify:

1. Overview attention links open correctly filtered queues.
2. Listing edits save and public preview reflects them.
3. Google values are read-only outside sync.
4. Claim Contacted, Approve, Reject, and Resend states remain consistent after refresh.
5. Claimed inquiry delivery and unclaimed hold/release behavior match server state.
6. Owner lead statuses update only in the owner account.
7. Drawers preserve queue filters and become full-screen on mobile.
8. Keyboard focus, labels, confirmation dialogs, empty states, and errors are usable.

- [ ] **Step 7: Capture and inspect final screenshots**

Capture the accepted operations layout at a desktop viewport and the mobile queue/detail flow. Inspect both screenshots with `view_image`; repair clipping, overflow, accidental wrapping, weak contrast, browser-default control typography, and any mismatch with the approved compact operations design.

- [ ] **Step 8: Commit the completed workflow**

```bash
git add client/src/pages/MarketplaceSettings.tsx client/src/features/superadmin-marketplace/ownerLeadState.test.ts server/src/controllers/marketplaceController.ts server/src/routes/marketplaceRoutes.ts server/tests/marketplace.test.ts docs/guides/WHATSAPP_BOT_SETUP.md
git commit -m "feat: complete marketplace operations workflow"
```
