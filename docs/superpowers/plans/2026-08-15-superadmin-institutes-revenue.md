# Superadmin Institutes and Revenue Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the legacy institute cards and modal actions with a paginated directory, guided onboarding, dedicated institute workspaces, and guarded revenue operations.

**Architecture:** Add focused institute and revenue services below the protected `/api/super-admin` router created by the foundation plan. Keep cross-module institute summary contracts stable, record billing operations durably, and build route-based React modules inside the shared shell.

**Tech Stack:** React 19, React Router, TypeScript, Tailwind CSS, Vitest, Express, Prisma 5, PostgreSQL, Node test runner.

## Global Constraints

- Complete the foundation/security plan before this plan.
- One Superadmin operates the platform; do not add ownership assignment.
- All lists use server-side search, filtering, sorting, and pagination.
- Common settings use structured forms; raw JSON exists only in a validated Advanced section.
- Billing mutations use idempotency keys, database transactions, before/after previews, reasons, and audit writes.
- Plan revocation and credit/manual-payment adjustments require `X-Superadmin-Challenge`.
- Use only the disposable local PostgreSQL database during implementation.
- Production migration deploy requires separate explicit approval.

---

## File map

- `server/prisma/schema.prisma` — durable billing-operation and onboarding-idempotency records.
- `server/prisma/migrations/20260816100000_superadmin_billing_operations/migration.sql` — additive billing operation DDL.
- `server/src/services/superAdminInstituteService.ts` — directory, workspace, structured updates, onboarding, and import validation.
- `server/src/services/superAdminRevenueService.ts` — reporting and guarded billing state transitions.
- `server/src/services/superAdminBillingProvider.ts` — sanitized Razorpay payment/invoice reads behind an injectable adapter.
- `server/src/workers/superAdminBillingWorker.ts` — due scheduled-operation execution and durable retry state.
- `server/src/controllers/superAdminInstituteController.ts` — institute HTTP adapters.
- `server/src/controllers/superAdminRevenueController.ts` — revenue HTTP adapters.
- `server/src/routes/superAdminRoutes.ts` — institute/revenue routes.
- `client/src/features/superadmin-institutes/*` — institute table, onboarding, and workspace tabs.
- `client/src/features/superadmin-revenue/*` — revenue overview, subscriptions, and billing dialogs.
- `client/src/App.tsx` — institute and revenue nested routes.

### Task 1: Persist idempotent Superadmin billing and onboarding operations

**Files:**
- Modify: `server/prisma/schema.prisma`
- Create: `server/prisma/migrations/20260816100000_superadmin_billing_operations/migration.sql`
- Create: `server/tests/superAdminBillingSchema.test.ts`

**Interfaces:**
- Produces Prisma models `SuperAdminBillingOperation`, `SuperAdminOnboardingOperation`, and `SuperAdminOnboardingRow`.
- Produces billing operation statuses `PENDING`, `APPLIED`, and `FAILED` as strings to match existing schema conventions.

- [ ] **Step 1: Write the failing persistence test**

```ts
test('billing operation idempotency key is unique', async () => {
  const data = {
    instituteId,
    actorAdminId: superAdminId,
    type: 'QUIZ_CREDIT_ADJUSTMENT',
    idempotencyKey: 'billing-op-1',
    reason: 'Approved service recovery credit',
    request: { delta: 10 },
    status: 'APPLIED'
  };
  await prisma.superAdminBillingOperation.create({ data });
  await assert.rejects(() => prisma.superAdminBillingOperation.create({ data }));
  await prisma.superAdminOnboardingOperation.create({
    data: { actorAdminId: superAdminId, kind: 'SINGLE', idempotencyKey: 'onboard-1', requestHash: 'sha256:request' }
  });
  await assert.rejects(() => prisma.superAdminOnboardingOperation.create({
    data: { actorAdminId: superAdminId, kind: 'SINGLE', idempotencyKey: 'onboard-1', requestHash: 'sha256:request' }
  }));
});
```

- [ ] **Step 2: Run test to verify RED**

Run: `cd server && DATABASE_URL='postgresql://mathlogs_test:mathlogs_test@127.0.0.1:55432/mathlogs_test?schema=public' JWT_SECRET=test-secret NODE_ENV=test npx tsx --test --test-force-exit tests/superAdminBillingSchema.test.ts`

Expected: FAIL because the three operation delegates are missing.

- [ ] **Step 3: Add the model and migration**

```prisma
model SuperAdminBillingOperation {
  id             String    @id @default(uuid())
  instituteId    String?
  actorAdminId   String
  type           String
  idempotencyKey String    @unique
  reason         String
  request        Json
  result         Json?
  status         String    @default("PENDING")
  effectiveAt    DateTime?
  appliedAt      DateTime?
  error          String?
  attempts       Int       @default(0)
  maxAttempts    Int       @default(3)
  lastAttemptAt  DateTime?
  nextAttemptAt  DateTime?
  createdAt      DateTime  @default(now())
  updatedAt      DateTime  @updatedAt
  institute      Institute? @relation(fields: [instituteId], references: [id], onDelete: SetNull)
  actorAdmin     Admin     @relation(fields: [actorAdminId], references: [id])

  @@index([instituteId, createdAt])
  @@index([status, effectiveAt])
  @@index([actorAdminId, createdAt])
}

model SuperAdminOnboardingOperation {
  id             String   @id @default(uuid())
  actorAdminId   String
  kind           String
  idempotencyKey String   @unique
  requestHash    String
  status         String   @default("PENDING")
  result         Json?
  createdAt      DateTime @default(now())
  updatedAt      DateTime @updatedAt
  actorAdmin     Admin    @relation(fields: [actorAdminId], references: [id])
  rows           SuperAdminOnboardingRow[]

  @@index([actorAdminId, createdAt])
}

model SuperAdminOnboardingRow {
  id          String   @id @default(uuid())
  operationId String
  rowNumber   Int
  requestHash String
  status      String   @default("PENDING")
  instituteId String?
  result      Json?
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt
  operation   SuperAdminOnboardingOperation @relation(fields: [operationId], references: [id], onDelete: Cascade)

  @@unique([operationId, rowNumber])
  @@index([status, updatedAt])
}
```

Add relation arrays to `Institute` and `Admin`; create matching SQL indexes and foreign keys. The onboarding tables store only canonical request hashes and bounded results, not passwords, OTPs, or invite tokens.

- [ ] **Step 4: Validate, generate, sync, and run GREEN**

Run: `cd server && npx prisma format`

Run: `cd server && npx prisma validate`

Run: `cd server && npx prisma generate`

Run: `cd server && DATABASE_URL='postgresql://mathlogs_test:mathlogs_test@127.0.0.1:55432/mathlogs_test?schema=public' npx prisma migrate deploy`

Run: `cd server && DATABASE_URL='postgresql://mathlogs_test:mathlogs_test@127.0.0.1:55432/mathlogs_test?schema=public' JWT_SECRET=test-secret NODE_ENV=test npx tsx --test --test-force-exit tests/superAdminBillingSchema.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add server/prisma/schema.prisma server/prisma/migrations/20260816100000_superadmin_billing_operations server/tests/superAdminBillingSchema.test.ts
git commit -m "feat: add superadmin operation persistence"
```

### Task 2: Add institute directory and 360-degree workspace APIs

**Files:**
- Create: `server/src/services/superAdminInstituteService.ts`
- Create: `server/src/controllers/superAdminInstituteController.ts`
- Modify: `server/src/routes/superAdminRoutes.ts`
- Create: `server/tests/superAdminInstitutes.test.ts`

**Interfaces:**
- Produces `GET /api/super-admin/institutes` with `{ items, page, pageSize, total }`.
- Produces `GET /api/super-admin/institutes/:id` with `{ overview, account, usage, billing, marketplace, leads, support, activity }`.
- Produces `PATCH /api/super-admin/institutes/:id/details` and `/configuration` using `expectedUpdatedAt`.
- Produces advanced-configuration preview/apply endpoints and guarded administrator/access-management endpoints.

- [ ] **Step 1: Write failing directory/detail tests**

```ts
const list = await get('/api/super-admin/institutes?q=Apex&status=ACTIVE&page=1&pageSize=25');
assert.equal(list.status, 200);
assert.deepEqual(Object.keys(list.body.data), ['items', 'page', 'pageSize', 'total']);
assert.equal(list.body.data.items[0].name, 'Apex Academy');

const detail = await get(`/api/super-admin/institutes/${instituteId}`);
assert.deepEqual(Object.keys(detail.body.data), [
  'overview', 'account', 'usage', 'billing', 'marketplace', 'leads', 'support', 'activity'
]);
```

Also assert institute-admin callers receive 403 and stale `expectedUpdatedAt` returns 409 with current data. Test advanced schema rejection, admin invite/reset, last-admin protection, PAGE_ONLY transition safety, re-authentication, and audit writes.

- [ ] **Step 2: Run tests to verify RED**

Run: `cd server && DATABASE_URL='postgresql://mathlogs_test:mathlogs_test@127.0.0.1:55432/mathlogs_test?schema=public' JWT_SECRET=test-secret NODE_ENV=test npx tsx --test --test-force-exit tests/superAdminInstitutes.test.ts`

Expected: 404 for new endpoints.

- [ ] **Step 3: Define stable list and workspace types**

```ts
export type InstituteDirectoryItem = {
  id: string;
  name: string;
  teacherName: string | null;
  phoneNumber: string | null;
  email: string | null;
  status: string;
  plan: string;
  planExpiryDate: Date | null;
  isQuizOnly: boolean;
  ownershipStatus: string;
  isPubliclyListed: boolean;
  students: number;
  batches: number;
  openSupportCount: number;
  attention: string[];
  updatedAt: Date;
};
```

Until support persistence exists, return `openSupportCount: 0`; the support plan replaces that projection without changing the response shape.

- [ ] **Step 4: Implement structured updates and audit**

`details` accepts only `name`, `teacherName`, `phoneNumber`, and `email`. `configuration` accepts `maxStudents`, `isQuizOnly`, `quizCredits`, `allowedClasses`, `subjects`, and `requiresGrades`; reject unknown keys. Use `updateMany` with `updatedAt: expectedUpdatedAt`, return 409 current record when count is zero, invalidate auth cache for linked admins, and write `SuperAdminAuditLog` in the same transaction.

Advanced configuration uses `POST /institutes/:id/configuration/advanced-preview` and guarded `PATCH /advanced`. Parse with a strict Zod schema, reject prototype keys and platform-managed values such as plan, role, credentials, ownership, and payment IDs, return a redacted before/after preview, then require `SENSITIVE_CONFIGURATION` re-authentication to apply.

Account management provides `POST /institutes/:id/admins` with an idempotency key, `POST /institutes/:id/admins/:adminId/reset-link`, `DELETE /institutes/:id/admins/:adminId`, and `PATCH /institutes/:id/access`. Claim create/reset requests through foundation idempotency scopes. Never return temporary credentials: create a one-time expiring setup link through the existing onboarding mechanism and dispatch it through the existing transactional channel. Delete/access mutations require `ADMIN_ACCESS_CHANGE`, preserve at least one active institute admin, invalidate affected sessions/cache, and retain the existing PAGE_ONLY server allowlist.

- [ ] **Step 5: Add protected routes and run GREEN**

```ts
router.get('/institutes', listSuperAdminInstitutes);
router.get('/institutes/:id', getSuperAdminInstitute);
router.patch('/institutes/:id/details', updateSuperAdminInstituteDetails);
router.patch('/institutes/:id/configuration', updateSuperAdminInstituteConfiguration);
router.post('/institutes/:id/configuration/advanced-preview', previewAdvancedConfiguration);
router.patch('/institutes/:id/configuration/advanced', requireSuperAdminReauth('SENSITIVE_CONFIGURATION'), applyAdvancedConfiguration);
router.post('/institutes/:id/admins', createInstituteAdminInvite);
router.post('/institutes/:id/admins/:adminId/reset-link', resetInstituteAdminAccess);
router.delete('/institutes/:id/admins/:adminId', requireSuperAdminReauth('ADMIN_ACCESS_CHANGE'), removeInstituteAdmin);
router.patch('/institutes/:id/access', requireSuperAdminReauth('ADMIN_ACCESS_CHANGE'), updateInstituteAccess);
```

Run: `cd server && DATABASE_URL='postgresql://mathlogs_test:mathlogs_test@127.0.0.1:55432/mathlogs_test?schema=public' JWT_SECRET=test-secret NODE_ENV=test npx tsx --test --test-force-exit tests/superAdminInstitutes.test.ts tests/marketplaceSuperAdmin.test.ts`

Run: `cd server && npm run build`

Expected: PASS and build exit 0.

- [ ] **Step 6: Commit**

```bash
git add server/src/services/superAdminInstituteService.ts server/src/controllers/superAdminInstituteController.ts server/src/routes/superAdminRoutes.ts server/tests/superAdminInstitutes.test.ts
git commit -m "feat: add superadmin institute workspace api"
```

### Task 3: Add guided onboarding and validated bulk import APIs

**Files:**
- Modify: `server/src/services/superAdminInstituteService.ts`
- Modify: `server/src/controllers/superAdminInstituteController.ts`
- Modify: `server/src/routes/superAdminRoutes.ts`
- Test: `server/tests/superAdminOnboarding.test.ts`

**Interfaces:**
- Produces `POST /api/super-admin/institutes/onboarding/preview`.
- Produces `POST /api/super-admin/institutes/onboarding/commit` with header `Idempotency-Key`.
- Produces `POST /api/super-admin/institutes/import/preview` and `/commit`; both commit endpoints require `Idempotency-Key`.

- [ ] **Step 1: Write failing preview/commit tests**

```ts
const preview = await post('/api/super-admin/institutes/onboarding/preview', onboardingPayload);
assert.equal(preview.body.data.valid, true);
assert.equal(preview.body.data.summary.plan, 'BASIC');

const first = await commit(onboardingPayload, 'onboard-1');
const second = await commit(onboardingPayload, 'onboard-1');
assert.equal(first.body.data.instituteId, second.body.data.instituteId);
```

Test invalid import rows return `{ row, field, code, message }[]` and commit does not create invalid rows.

- [ ] **Step 2: Run tests to verify RED**

Run: `cd server && DATABASE_URL='postgresql://mathlogs_test:mathlogs_test@127.0.0.1:55432/mathlogs_test?schema=public' JWT_SECRET=test-secret NODE_ENV=test npx tsx --test --test-force-exit tests/superAdminOnboarding.test.ts`

Expected: 404.

- [ ] **Step 3: Implement validation contract**

```ts
export type InstituteOnboardingInput = {
  owner: { name: string; phone: string; email?: string };
  institute: { name: string; city?: string; area?: string; address?: string };
  access: { kind: 'FULL' | 'PAGE_ONLY' | 'QUIZ_ONLY'; username?: string };
  billing: { plan: 'FREE' | 'BASIC' | 'PRO' | 'ENTERPRISE'; trialDays?: number; discountPercent?: number };
  limits: { maxStudents: number; quizCredits: number };
  marketplace: { isPubliclyListed: boolean; isVerified: boolean };
};
```

Preview normalizes phone and derives config without writing. Commit repeats validation, claims a `SuperAdminOnboardingOperation` by idempotency key plus canonical request hash, creates institute/admin/onboarding link and audit in one transaction, and returns the same completed result for the same key and hash. Reusing a key with a different hash returns `409 IDEMPOTENCY_KEY_REUSED`.

- [ ] **Step 4: Implement import preview and commit**

Accept parsed JSON rows and CSV-normalized rows through the same validator. Preview requires an explicit account username per row or derives the normalized owner phone, and rejects duplicate usernames within the file. Commit creates one `SuperAdminOnboardingRow` per normalized row and processes rows in independent transactions, so one row failure does not roll back successful rows. A retry resumes only pending/failed retryable rows and returns the persisted result for completed rows. Return explicit `created`, `existing`, and `failed` arrays without returning setup tokens.

- [ ] **Step 5: Run GREEN and commit**

Run: `cd server && DATABASE_URL='postgresql://mathlogs_test:mathlogs_test@127.0.0.1:55432/mathlogs_test?schema=public' JWT_SECRET=test-secret NODE_ENV=test npx tsx --test --test-force-exit tests/superAdminOnboarding.test.ts`

Run: `cd server && npm run build`

```bash
git add server/src/services/superAdminInstituteService.ts server/src/controllers/superAdminInstituteController.ts server/src/routes/superAdminRoutes.ts server/tests/superAdminOnboarding.test.ts
git commit -m "feat: add guided superadmin onboarding api"
```

### Task 4: Add revenue reporting and guarded billing operations

**Files:**
- Create: `server/src/services/superAdminRevenueService.ts`
- Create: `server/src/services/superAdminBillingProvider.ts`
- Create: `server/src/workers/superAdminBillingWorker.ts`
- Create: `server/src/controllers/superAdminRevenueController.ts`
- Modify: `server/src/routes/superAdminRoutes.ts`
- Modify: `server/src/index.ts`
- Test: `server/tests/superAdminRevenue.test.ts`

**Interfaces:**
- Produces `GET /api/super-admin/revenue/overview` and `/subscriptions`.
- Produces `GET /api/super-admin/institutes/:id/billing-history` with separate operations, subscription payments, and invoices.
- Produces `POST /api/super-admin/institutes/:id/billing-operations/preview` and `/billing-operations/:operationId/retry`.
- Produces `POST /api/super-admin/institutes/:id/billing-operations`.
- Consumes `Idempotency-Key`, `X-Superadmin-Challenge` for protected operation types, and body `{ type, reason, effectiveAt?, payload }`.

- [ ] **Step 1: Write failing reporting and mutation tests**

```ts
assert.equal((await get('/api/super-admin/revenue/overview')).body.data.metrics.activeSubscriptions, 1);
const revoke = await billingOperation({ type: 'PLAN_REVOKE', payload: {} }, verifiedChallenge);
assert.equal(revoke.status, 200);
assert.equal((await prisma.institute.findUniqueOrThrow({ where: { id: instituteId } })).plan, 'NO_PLAN');
```

Add tests for missing challenge, duplicate idempotency key, stale concurrent operations, audit creation, preview parity, trial extension, immediate/scheduled plan change, student-limit adjustment, quiz-credit adjustment, manual payment reference, sanitized provider history, due-worker concurrency, and conditional retry.

- [ ] **Step 2: Run tests to verify RED**

Run: `cd server && DATABASE_URL='postgresql://mathlogs_test:mathlogs_test@127.0.0.1:55432/mathlogs_test?schema=public' JWT_SECRET=test-secret NODE_ENV=test npx tsx --test --test-force-exit tests/superAdminRevenue.test.ts`

Expected: 404.

- [ ] **Step 3: Define operation union**

```ts
export type BillingOperationInput =
  | { type: 'PLAN_CHANGE'; effectiveAt?: string; payload: { plan: Tier; expiryDate: string } }
  | { type: 'TRIAL_EXTENSION'; payload: { days: number } }
  | { type: 'STUDENT_LIMIT_ADJUSTMENT'; payload: { maxStudents: number } }
  | { type: 'QUIZ_CREDIT_ADJUSTMENT'; payload: { delta: number } }
  | { type: 'PLAN_REVOKE'; effectiveAt?: string; payload: Record<string, never> }
  | { type: 'MANUAL_PAYMENT_REFERENCE'; payload: { amountPaise: number; reference: string; paidAt: string } };
```

Require re-authentication for `PLAN_REVOKE`, `QUIZ_CREDIT_ADJUSTMENT`, and `MANUAL_PAYMENT_REFERENCE`. Validate reason length >= 10. Preview derives the exact redacted before/after values with no writes. Submission recomputes that preview; immediate operations conditionally mutate the institute and mark applied in one transaction, while future operations stay pending until due. Do not call Razorpay for manual records.

- [ ] **Step 4: Implement scheduled execution and conditional retry**

The billing worker polls due `PENDING` rows, claims each operation with a transaction-scoped advisory lock, revalidates current state, increments attempts, applies exactly once, and writes audit state. Retry accepts only `FAILED` rows below `maxAttempts`, requires the source action's re-authentication class, uses its own idempotency key, clears bounded error state, and schedules `nextAttemptAt`. Concurrent retries yield one state transition.

```ts
const claimed = await tx.superAdminBillingOperation.updateMany({
  where: { id, status: 'PENDING', nextAttemptAt: { lte: now } },
  data: { attempts: { increment: 1 }, lastAttemptAt: now }
});
if (claimed.count !== 1) return 'SKIPPED';
```

- [ ] **Step 5: Implement overview, subscriptions, payment, and invoice projections**

Use real institute plans, expiry dates, AdminOnboardingLink status, and `SuperAdminBillingOperation`. The injected billing-provider adapter reads the institute's Razorpay subscription/order history with bounded pagination and maps it to a sanitized payment/invoice contract; never return provider notes, receipt PII, customer objects, or credentials. When the provider is unconfigured/unavailable, return `providerState` and local operation history instead of manufacturing revenue. Label institute-collected coaching fees separately from MathLogs subscription revenue; do not misrepresent coaching `FeePayment` collections as MRR.

- [ ] **Step 6: Run GREEN and commit**

Run: `cd server && DATABASE_URL='postgresql://mathlogs_test:mathlogs_test@127.0.0.1:55432/mathlogs_test?schema=public' JWT_SECRET=test-secret NODE_ENV=test npx tsx --test --test-force-exit tests/superAdminRevenue.test.ts tests/superAdminInstitutes.test.ts`

Run: `cd server && npm run build`

```bash
git add server/src/services/superAdminRevenueService.ts server/src/services/superAdminBillingProvider.ts server/src/workers/superAdminBillingWorker.ts server/src/controllers/superAdminRevenueController.ts server/src/routes/superAdminRoutes.ts server/src/index.ts server/tests/superAdminRevenue.test.ts
git commit -m "feat: add guarded superadmin revenue operations"
```

### Task 5: Build Institutes, onboarding, and institute workspace UI

**Files:**
- Create: `client/src/features/superadmin-institutes/types.ts`
- Create: `client/src/features/superadmin-institutes/api.ts`
- Create: `client/src/features/superadmin-institutes/InstituteDirectory.tsx`
- Create: `client/src/features/superadmin-institutes/OnboardingWizard.tsx`
- Create: `client/src/features/superadmin-institutes/InstituteWorkspace.tsx`
- Create: `client/src/features/superadmin-institutes/StructuredConfigForm.tsx`
- Create: `client/src/features/superadmin-institutes/InstituteWorkspace.test.tsx`
- Create: `client/src/pages/superadmin/SuperAdminInstitutes.tsx`
- Create: `client/src/pages/superadmin/SuperAdminInstituteDetail.tsx`
- Modify: `client/src/App.tsx`

**Interfaces:**
- Consumes Task 2 and Task 3 endpoints exactly.
- Produces routes `/super-admin/institutes`, `/new`, and `/:id/*`.

- [ ] **Step 1: Write failing component tests**

Test paginated search, filter URL synchronization, opening a dedicated institute route, wizard validation/preservation, stale 409 reload/rebase, unsaved-change guards, and full-screen mobile tabs.

- [ ] **Step 2: Run tests to verify RED**

Run: `cd client && npm run test:run -- src/features/superadmin-institutes/InstituteWorkspace.test.tsx`

Expected: missing modules.

- [ ] **Step 3: Implement typed API and directory**

Use URL query parameters as the source of truth for `q`, `status`, `plan`, `page`, and `sort`. Debounce search by 250ms. Preserve table position when returning from institute detail.

- [ ] **Step 4: Implement wizard and workspace**

The wizard uses six approved steps and a server preview before commit. Implement Overview, Account, Usage, Billing, Marketplace, and Leads here. Define an `InstituteWorkspaceTab` registry that also includes Support and Activity; the integration plan must register all eight real panels before release.

```ts
export type InstituteWorkspaceTab =
  | 'overview' | 'account' | 'usage' | 'billing'
  | 'marketplace' | 'leads' | 'support' | 'activity';

export const installedInstituteTabs: Partial<Record<InstituteWorkspaceTab, React.ComponentType>> = {
  overview: InstituteOverviewPanel,
  account: InstituteAccountPanel,
  usage: InstituteUsagePanel,
  billing: InstituteBillingPanel,
  marketplace: InstituteMarketplacePanel,
  leads: InstituteLeadsPanel
};
```

Account provides audited invite/reset/remove and access-type dialogs. Advanced configuration renders schema validation and the server's redacted before/after preview, requires OTP only when applying, and preserves a stale-edit rebase path.

- [ ] **Step 5: Run tests, lint, build, and commit**

Run: `cd client && npm run test:run`

Run: `cd client && npx eslint src/features/superadmin-institutes src/pages/superadmin/SuperAdminInstitutes.tsx src/pages/superadmin/SuperAdminInstituteDetail.tsx`

Run: `cd client && npm run build`

```bash
git add client/src/features/superadmin-institutes client/src/pages/superadmin/SuperAdminInstitutes.tsx client/src/pages/superadmin/SuperAdminInstituteDetail.tsx client/src/App.tsx
git commit -m "feat: add superadmin institute workspaces"
```

### Task 6: Build Revenue UI and re-authenticated billing dialogs

**Files:**
- Create: `client/src/features/superadmin-revenue/types.ts`
- Create: `client/src/features/superadmin-revenue/api.ts`
- Create: `client/src/features/superadmin-revenue/RevenueOverview.tsx`
- Create: `client/src/features/superadmin-revenue/SubscriptionTable.tsx`
- Create: `client/src/features/superadmin-revenue/BillingOperationDialog.tsx`
- Create: `client/src/features/superadmin-revenue/BillingOperationDialog.test.tsx`
- Create: `client/src/pages/superadmin/SuperAdminRevenue.tsx`
- Modify: `client/src/App.tsx`

**Interfaces:**
- Consumes Task 4 endpoints and foundation `useSuperAdminReauth()`.
- Produces route `/super-admin/revenue` and reusable institute-workspace billing panel.

- [ ] **Step 1: Write failing tests**

Test metric drill-down, subscription filters, before/after summary, required reason, OTP challenge for protected types, idempotency key reuse on network retry, and success refresh.

- [ ] **Step 2: Run RED**

Run: `cd client && npm run test:run -- src/features/superadmin-revenue/BillingOperationDialog.test.tsx`

Expected: missing components.

- [ ] **Step 3: Implement UI**

Create one typed dialog driven by the `BillingOperationInput` union. Generate one UUID idempotency key when the dialog opens and keep it through retries. Obtain challenge only after validation and immediately before submit.

```ts
const preview = await previewBillingOperation(instituteId, draft);
if (!deepEqual(preview.request, draft)) throw new Error('Preview is stale');
await applyBillingOperation(instituteId, draft, { idempotencyKey, challengeId });
```

The Billing panel separates local operation history from provider payment/invoice history, shows provider unavailable states explicitly, and offers retry only for server-declared retryable failed operations. Scheduled changes display their effective time and cancellation is not implied unless a dedicated audited endpoint exists.

- [ ] **Step 4: Verify and commit**

Run: `cd client && npm run test:run`

Run: `cd client && npx eslint src/features/superadmin-revenue src/pages/superadmin/SuperAdminRevenue.tsx`

Run: `cd client && npm run build`

```bash
git add client/src/features/superadmin-revenue client/src/pages/superadmin/SuperAdminRevenue.tsx client/src/App.tsx
git commit -m "feat: add superadmin revenue workspace"
```

## Institutes and revenue acceptance checkpoint

Run focused server institute, onboarding, revenue, security, Marketplace, and migration tests against the disposable local database. Run all client tests and both production builds. Visually verify directory, wizard, institute tabs, revenue overview, and every billing dialog at desktop and mobile widths.
