# Month-Coverage Fee System Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a fully isolated month-coverage coaching-fee model that new institutes can select once, while preserving every existing institute and legacy fee workflow unchanged.

**Architecture:** Add an immutable institute fee-mode selector and new month-coverage profile, payment, active-allocation, and audit tables. New services, controllers, routes, reports, and conditional React views own all month-based behavior; legacy endpoints are protected by a mode guard and continue using the current implementation without shared calculations or dual writes.

**Tech Stack:** PostgreSQL, Prisma 5.22, Express 5, TypeScript 5.9, Zod 4, Node test runner, React 19, TanStack Query 5, Vitest 3, Tailwind CSS, Framer Motion.

**Spec:** `docs/superpowers/specs/2026-08-22-month-coverage-fee-system-design.md`

## Global Constraints

- Existing institutes must deterministically remain `CURRENT_DUE_BASED`; do not transform or infer coverage from legacy records.
- A new institute selects exactly one fee mode during account setup; normal product workflows cannot change it afterward.
- Never read from or write to legacy `FeeRecord`, `FeeInstallment`, `FeePayment`, `FeeInstallmentAssignment`, or `StudentBalance` when serving month-coverage behavior.
- Never read from or write to month-coverage tables when serving legacy behavior.
- Do not dual-write a payment to both systems.
- Parent payment and UPI-verification entry points are unavailable for `MONTH_COVERAGE` institutes.
- Store money in new tables as integer paise and expose rupee values at API boundaries; do not add a new money dependency.
- Store canonical fee months as validated `YYYY-MM` strings to avoid timezone shifts; use `Institute.timezone`, defaulting to `Asia/Kolkata`, for current-month decisions.
- Reuse the current Fee page, dashboard, Quick Fee modal, and batch-detail visual language. Do not redesign unrelated UI.
- Preserve unrelated uncommitted work already present in onboarding, billing, Prisma, and other files. Stage only files belonging to each task.
- Follow TDD: add a focused failing test, observe the expected failure, implement the smallest behavior, rerun the focused test, then run the relevant regression suite.

---

## File Structure and Responsibilities

### Server files to create

- `server/prisma/migrations/20260822120000_month_coverage_fee_system/migration.sql` — additive schema, existing-institute backfill, indexes, and uniqueness constraints.
- `server/src/domain/monthCoverage/types.ts` — API/domain types and duration-to-month mapping.
- `server/src/domain/monthCoverage/calendar.ts` — canonical-month parsing, enumeration, comparison, and timezone-aware current-month helpers.
- `server/src/middleware/requireCoachingFeeMode.ts` — authenticated endpoint mode guard.
- `server/src/services/studentMonthCoverageService.ts` — validate, create, confirm, backdate, and close student fee profiles.
- `server/src/services/monthCoveragePaymentService.ts` — preview, create, edit, void, overlap/gap checks, idempotency, and audit writes.
- `server/src/services/monthCoverageSummaryService.ts` — student, batch, and institute month metrics plus recent transactions.
- `server/src/services/monthCoverageReportService.ts` — pending-month and collection-date PDF data and streaming.
- `server/src/controllers/monthCoverageController.ts` — HTTP translation for profiles, summaries, payments, reminders, and reports.
- `server/tests/monthCoverageMigration.test.ts` — schema/migration isolation contract.
- `server/tests/monthCoverageCalendar.test.ts` — month/date rules.
- `server/tests/coachingFeeMode.test.ts` — onboarding immutability and route-mode guards.
- `server/tests/studentMonthCoverageService.test.ts` — student period lifecycle.
- `server/tests/monthCoveragePaymentService.test.ts` — allocation, idempotency, concurrency, edit, void, and audit behavior.
- `server/tests/monthCoverageSummaryService.test.ts` — pending/overdue/progress/collection calculations.
- `server/tests/monthCoverageApi.test.ts` — request validation, authorization, parent blocking, and response contracts.

### Client files to create

- `client/src/features/month-coverage/types.ts` — client contracts that mirror server responses.
- `client/src/features/month-coverage/api.ts` — TanStack Query keys and API functions.
- `client/src/features/month-coverage/monthCoverageViewModel.ts` — duration labels, progress copy, warning copy, and safe formatting.
- `client/src/features/month-coverage/MonthCoveragePaymentDialog.tsx` — create/edit preview and confirmation flow.
- `client/src/features/month-coverage/MonthCoverageFeesView.tsx` — Fee-page content using the existing layout language.
- `client/src/features/month-coverage/StudentFeeStartDialog.tsx` — teacher confirmation/backdating UI.
- `client/src/features/month-coverage/monthCoverageViewModel.test.ts` — pure UI logic tests.
- `client/src/features/month-coverage/MonthCoveragePaymentDialog.test.tsx` — preview/warning/submit interaction tests.
- `client/src/features/month-coverage/MonthCoverageFeesView.test.tsx` — filters, progress, transactions, and void confirmation tests.

### Existing files to modify

- `server/prisma/schema.prisma` — enums, institute/batch relations, and new month-coverage models.
- `server/src/schemas.ts` — onboarding, batch, profile, preview, payment, edit, void, and reminder schemas.
- `server/src/controllers/inviteController.ts` — one-time fee-mode selection during setup.
- `server/src/controllers/batchController.ts` — mode-aware dates and response fields.
- `server/src/controllers/studentController.ts` — manual admission, self-registration setup state, approval, update, and archive integration.
- `server/src/controllers/dashboardController.ts` — dispatch to the isolated summary service for month-mode institutes.
- `server/src/controllers/feeController.ts` — no calculation changes; existing routes are protected externally.
- `server/src/controllers/publicController.ts` — reject parent fee and UPI operations for month-mode institutes.
- `server/src/controllers/instituteController.ts` — expose the selected mode/timezone and include new tables in destructive institute cleanup.
- `server/src/services/superAdminDeletionService.ts` — delete new dependent records in safe order.
- `server/src/routes/api.ts` — mode guards and new endpoints.
- `server/tests/schemas.test.ts` — new Zod contracts and legacy compatibility.
- `server/tests/api.integration.test.ts` — authenticated route-mode isolation.
- `client/src/pages/SetupAccount.tsx` — fee-mode choice during coaching setup.
- `client/src/pages/BatchList.tsx` — required start/end dates in month mode.
- `client/src/pages/Approvals.tsx` — fee-start confirmation before approval in month mode.
- `client/src/pages/BatchDetails.tsx` — fee-start setup status, individual progress, and month payment entry.
- `client/src/pages/Fees.tsx` — top-level mode dispatch while retaining the legacy component.
- `client/src/pages/Dashboard.tsx` — conditional month metrics in the existing cards and progress locations.
- `client/src/components/QuickFeeModal.tsx` — conditional month payment flow.
- `client/src/pages/StudentPaymentPortal.tsx` — unavailable-state copy for month-mode institutes.

---

### Task 1: Add the additive database model and migration contract

**Files:**
- Modify: `server/prisma/schema.prisma:1-70,292-470`
- Create: `server/prisma/migrations/20260822120000_month_coverage_fee_system/migration.sql`
- Create: `server/tests/monthCoverageMigration.test.ts`

**Interfaces:**
- Produces: Prisma enums `CoachingFeeMode`, `MonthCoverageDuration`, `MonthCoveragePaymentStatus`, and `MonthCoverageProfileStatus`.
- Produces: models `StudentMonthCoverageProfile`, `MonthCoveragePayment`, `MonthCoverageAllocation`, and `MonthCoverageAuditEvent`.
- Produces: `Institute.coachingFeeMode`, `Institute.coachingFeeModeSelectedAt`, `Institute.timezone`, `Batch.startDate`, and `Batch.endDate`.

- [ ] **Step 1: Write the failing migration contract test**

```ts
// server/tests/monthCoverageMigration.test.ts
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const schema = fs.readFileSync(path.join(root, 'prisma/schema.prisma'), 'utf8');
const migration = fs.readFileSync(
  path.join(root, 'prisma/migrations/20260822120000_month_coverage_fee_system/migration.sql'),
  'utf8',
);

test('month coverage schema is additive and isolated from legacy fee models', () => {
  assert.match(schema, /enum CoachingFeeMode[\s\S]*CURRENT_DUE_BASED[\s\S]*MONTH_COVERAGE/);
  assert.match(schema, /model MonthCoveragePayment/);
  assert.match(schema, /model MonthCoverageAllocation/);
  assert.match(schema, /@@unique\(\[studentId, coverageMonth\]\)/);
  assert.doesNotMatch(migration, /DROP TABLE\s+"(?:FeeRecord|FeePayment|FeeInstallment|StudentBalance)"/i);
  assert.match(migration, /UPDATE "Institute"[\s\S]*"coachingFeeModeSelectedAt"/);
});
```

- [ ] **Step 2: Run the focused test and verify the missing migration failure**

Run: `cd server && JWT_SECRET=test-secret NODE_ENV=test npx tsx --test tests/monthCoverageMigration.test.ts`

Expected: FAIL because the migration file and month-coverage models do not exist.

- [ ] **Step 3: Add the Prisma models and explicit relations**

Use these field contracts in `schema.prisma`:

```prisma
enum CoachingFeeMode {
  CURRENT_DUE_BASED
  MONTH_COVERAGE
}

enum MonthCoverageDuration {
  MONTHLY
  QUARTERLY
  HALF_YEARLY
  YEARLY
}

enum MonthCoveragePaymentStatus {
  ACTIVE
  VOID
}

enum MonthCoverageProfileStatus {
  PENDING_SETUP
  ACTIVE
  CLOSED
}

model StudentMonthCoverageProfile {
  id                 String                     @id @default(uuid())
  instituteId        String
  batchId            String
  studentId          String                     @unique
  feeStartMonth      String?                    @db.VarChar(7)
  feeEndMonth        String?                    @db.VarChar(7)
  status             MonthCoverageProfileStatus @default(PENDING_SETUP)
  confirmedAt        DateTime?
  confirmedById      String?
  createdAt          DateTime                   @default(now())
  updatedAt          DateTime                   @updatedAt
  institute          Institute                  @relation(fields: [instituteId], references: [id], onDelete: Cascade)
  batch              Batch                      @relation(fields: [batchId], references: [id], onDelete: Cascade)
  student            Student                    @relation(fields: [studentId], references: [id], onDelete: Cascade)
  confirmedBy        Admin?                     @relation("MonthCoverageProfileConfirmer", fields: [confirmedById], references: [id], onDelete: SetNull)

  @@index([instituteId, status])
  @@index([batchId, status])
}

model MonthCoveragePayment {
  id             String                     @id @default(uuid())
  instituteId    String
  batchId        String
  studentId      String
  amountPaise    Int
  paymentDate    DateTime
  paymentMethod  String                     @db.VarChar(32)
  duration       MonthCoverageDuration
  note           String?
  status         MonthCoveragePaymentStatus @default(ACTIVE)
  idempotencyKey String
  createdById    String
  voidedAt       DateTime?
  voidedById     String?
  createdAt      DateTime                   @default(now())
  updatedAt      DateTime                   @updatedAt
  institute      Institute                  @relation(fields: [instituteId], references: [id], onDelete: Cascade)
  batch          Batch                      @relation(fields: [batchId], references: [id], onDelete: Cascade)
  student        Student                    @relation(fields: [studentId], references: [id], onDelete: Cascade)
  createdBy      Admin                      @relation("MonthCoveragePaymentCreator", fields: [createdById], references: [id], onDelete: Restrict)
  voidedBy       Admin?                     @relation("MonthCoveragePaymentVoider", fields: [voidedById], references: [id], onDelete: SetNull)
  allocations    MonthCoverageAllocation[]
  auditEvents    MonthCoverageAuditEvent[]

  @@unique([instituteId, idempotencyKey])
  @@index([studentId, paymentDate])
  @@index([instituteId, status, paymentDate])
}

model MonthCoverageAllocation {
  id            String               @id @default(uuid())
  instituteId   String
  batchId       String
  studentId     String
  paymentId     String
  coverageMonth String               @db.VarChar(7)
  createdAt     DateTime             @default(now())
  payment       MonthCoveragePayment @relation(fields: [paymentId], references: [id], onDelete: Cascade)
  institute     Institute            @relation(fields: [instituteId], references: [id], onDelete: Cascade)
  batch         Batch                @relation(fields: [batchId], references: [id], onDelete: Cascade)
  student       Student              @relation(fields: [studentId], references: [id], onDelete: Cascade)

  @@unique([studentId, coverageMonth])
  @@index([instituteId, coverageMonth])
  @@index([batchId, coverageMonth])
  @@index([paymentId])
}

model MonthCoverageAuditEvent {
  id          String               @id @default(uuid())
  instituteId String
  paymentId   String
  actorId     String
  action      String               @db.VarChar(16)
  reason      String?
  before      Json?
  after       Json?
  createdAt   DateTime             @default(now())
  payment     MonthCoveragePayment @relation(fields: [paymentId], references: [id], onDelete: Cascade)
  institute   Institute            @relation(fields: [instituteId], references: [id], onDelete: Cascade)
  actor       Admin                @relation("MonthCoverageAuditActor", fields: [actorId], references: [id], onDelete: Restrict)

  @@index([paymentId, createdAt])
  @@index([instituteId, createdAt])
}
```

Add the corresponding relation arrays, with explicit relation names where an `Admin` relation would otherwise be ambiguous, to `Institute`, `Batch`, `Student`, and `Admin`. Add `coachingFeeMode CoachingFeeMode @default(CURRENT_DUE_BASED)`, nullable `coachingFeeModeSelectedAt`, and `timezone String @default("Asia/Kolkata")` to `Institute`; add nullable `startDate` and `endDate` to `Batch`.

- [ ] **Step 4: Write the additive SQL migration**

Create enums/tables/indexes with quoted Prisma names. After adding the mode columns, freeze every institute that exists at migration time:

```sql
UPDATE "Institute"
SET "coachingFeeMode" = 'CURRENT_DUE_BASED',
    "coachingFeeModeSelectedAt" = COALESCE("coachingFeeModeSelectedAt", NOW());
```

Do not update `FeeRecord`, `FeePayment`, `FeeInstallment`, `FeeInstallmentAssignment`, or `StudentBalance`.

- [ ] **Step 5: Generate Prisma types and run the migration contract**

Run: `cd server && npx prisma generate`

Run: `cd server && JWT_SECRET=test-secret NODE_ENV=test npx tsx --test tests/monthCoverageMigration.test.ts`

Expected: both commands succeed and the focused test passes.

- [ ] **Step 6: Commit the additive schema**

```bash
git add server/prisma/schema.prisma server/prisma/migrations/20260822120000_month_coverage_fee_system/migration.sql server/tests/monthCoverageMigration.test.ts
git commit -m "feat: add isolated month coverage fee schema"
```

---

### Task 2: Implement one-time onboarding selection and route-mode guards

**Files:**
- Create: `server/src/middleware/requireCoachingFeeMode.ts`
- Create: `server/tests/coachingFeeMode.test.ts`
- Modify: `server/src/controllers/inviteController.ts:155-265`
- Modify: `server/src/routes/api.ts:270-346`
- Modify: `server/src/schemas.ts:13-70`
- Modify: `server/tests/schemas.test.ts`

**Interfaces:**
- Produces: `requireCoachingFeeMode(expected: CoachingFeeMode): RequestHandler`.
- Produces: setup body field `coachingFeeMode: 'CURRENT_DUE_BASED' | 'MONTH_COVERAGE'`.
- Consumes: `Institute.coachingFeeModeSelectedAt` from Task 1.

- [ ] **Step 1: Write failing tests for setup selection and both guard directions**

```ts
// server/tests/coachingFeeMode.test.ts
import test from 'node:test';
import assert from 'node:assert/strict';
import { requireCoachingFeeMode } from '../src/middleware/requireCoachingFeeMode';

function response() {
  return { statusCode: 200, body: undefined as unknown, status(code: number) { this.statusCode = code; return this; }, json(body: unknown) { this.body = body; return this; } };
}

test('legacy guard rejects a month coverage institute', async () => {
  const req = { user: { instituteId: 'inst-1' } } as never;
  const res = response();
  const next = () => assert.fail('next must not run');
  await requireCoachingFeeMode('CURRENT_DUE_BASED', async () => 'MONTH_COVERAGE')(req, res as never, next);
  assert.equal(res.statusCode, 409);
  assert.deepEqual(res.body, { error: 'FEE_MODE_MISMATCH', expected: 'CURRENT_DUE_BASED', actual: 'MONTH_COVERAGE' });
});
```

Also extend `schemas.test.ts` to assert that setup accepts exactly the two enum values and that month-payment schemas reject zero/negative amounts and malformed `YYYY-MM` values.

- [ ] **Step 2: Run focused tests and verify missing exports**

Run: `cd server && JWT_SECRET=test-secret NODE_ENV=test npx tsx --test tests/coachingFeeMode.test.ts tests/schemas.test.ts`

Expected: FAIL because the guard and schemas do not exist.

- [ ] **Step 3: Add the mode schemas and injectable guard**

Implement the guard with an injectable loader for unit tests and the Prisma loader by default:

```ts
type ModeLoader = (instituteId: string) => Promise<CoachingFeeMode | null>;

export function requireCoachingFeeMode(expected: CoachingFeeMode, loadMode: ModeLoader = defaultLoadMode) {
  return async (req: Request, res: Response, next: NextFunction) => {
    const instituteId = req.user?.instituteId;
    if (!instituteId) return res.status(401).json({ error: 'Missing institute context' });
    const actual = await loadMode(instituteId);
    if (!actual) return res.status(404).json({ error: 'Institute not found' });
    if (actual !== expected) return res.status(409).json({ error: 'FEE_MODE_MISMATCH', expected, actual });
    next();
  };
}
```

Add `setupAccountSchema` plus schemas for profile confirmation, preview/create, edit, void, and reminder. Reuse a strict `/^\d{4}-(0[1-9]|1[0-2])$/` canonical-month schema and enum schemas for duration/method. Apply `validateRequest(setupAccountSchema)` to `POST /auth/setup-account`; the current route has no request-schema middleware.

- [ ] **Step 4: Persist the mode exactly once in `setupAccount`**

Require `coachingFeeMode` in the client setup request. Inside the existing setup transaction:

```ts
if (invite.institute.coachingFeeModeSelectedAt) {
  if (invite.institute.coachingFeeMode !== coachingFeeMode) {
    return res.status(409).json({ error: 'Coaching fee mode has already been selected' });
  }
} else {
  instituteData.coachingFeeMode = coachingFeeMode;
  instituteData.coachingFeeModeSelectedAt = new Date();
}
```

Keep retrying the same setup choice idempotent; never expose a settings endpoint that changes this field.

- [ ] **Step 5: Guard all legacy authenticated mutation/read paths**

Apply `requireCurrentDueFeeMode` after authentication to:

- `/fees`, `/fees/summary`, `/fees/installments-list`, all `/fees/pay*`, reminders, reports, UPI verification, custom invoices, receipt scanning, and assignment routes.
- Batch installment create/update/delete routes.

Do not change `feeController.ts` calculations. The guard is the isolation boundary.

- [ ] **Step 6: Run focused tests and legacy schema tests**

Run: `cd server && JWT_SECRET=test-secret NODE_ENV=test npx tsx --test tests/coachingFeeMode.test.ts tests/schemas.test.ts tests/feeCalculations.test.ts tests/feeSecurity.test.ts`

Expected: PASS, including unchanged legacy fee calculation tests.

- [ ] **Step 7: Commit the selection and guard**

```bash
git add server/src/middleware/requireCoachingFeeMode.ts server/src/controllers/inviteController.ts server/src/routes/api.ts server/src/schemas.ts server/tests/coachingFeeMode.test.ts server/tests/schemas.test.ts
git commit -m "feat: isolate fee routes by institute mode"
```

---

### Task 3: Build canonical-month utilities and student fee-profile lifecycle

**Files:**
- Create: `server/src/domain/monthCoverage/types.ts`
- Create: `server/src/domain/monthCoverage/calendar.ts`
- Create: `server/src/services/studentMonthCoverageService.ts`
- Create: `server/tests/monthCoverageCalendar.test.ts`
- Create: `server/tests/studentMonthCoverageService.test.ts`

**Interfaces:**
- Produces: `MonthCoverageError`, `DURATION_MONTHS`, `parseMonth`, `formatMonth`, `enumerateMonths`, `compareMonths`, `currentMonthInTimezone`, `defaultFeeStartMonth`, and `validateFeePeriod`.
- Produces: `confirmStudentFeeProfile(input, deps)` and `closeStudentFeeProfile(input, deps)`.

- [ ] **Step 1: Write failing calendar tests**

```ts
// server/tests/monthCoverageCalendar.test.ts
import test from 'node:test';
import assert from 'node:assert/strict';
import { enumerateMonths, defaultFeeStartMonth, currentMonthInTimezone } from '../src/domain/monthCoverage/calendar';

test('enumerates inclusive months across a year boundary', () => {
  assert.deepEqual(enumerateMonths('2026-11', '2027-02'), ['2026-11', '2026-12', '2027-01', '2027-02']);
});

test('student joining before batch start defaults to batch start month', () => {
  assert.equal(defaultFeeStartMonth('2026-06-20T00:00:00.000Z', '2026-07', 'Asia/Kolkata'), '2026-07');
});

test('current month uses institute timezone', () => {
  assert.equal(currentMonthInTimezone(new Date('2026-08-31T20:00:00.000Z'), 'Asia/Kolkata'), '2026-09');
});
```

- [ ] **Step 2: Run the tests and verify missing modules**

Run: `cd server && JWT_SECRET=test-secret NODE_ENV=test npx tsx --test tests/monthCoverageCalendar.test.ts`

Expected: FAIL with module-not-found.

- [ ] **Step 3: Implement pure month utilities**

Use numeric year/month arithmetic, not `Date.setMonth()` on arbitrary dates. Reject malformed and inverted ranges with typed errors:

```ts
export const DURATION_MONTHS = { MONTHLY: 1, QUARTERLY: 3, HALF_YEARLY: 6, YEARLY: 12 } as const;

export function enumerateMonths(start: string, end: string): string[] {
  const from = parseMonth(start);
  const to = parseMonth(end);
  if (from.ordinal > to.ordinal) throw new MonthCoverageError('INVALID_MONTH_RANGE');
  return Array.from({ length: to.ordinal - from.ordinal + 1 }, (_, index) => formatOrdinal(from.ordinal + index));
}
```

- [ ] **Step 4: Write failing profile-service tests**

Cover these cases with an injected repository:

- Pre-batch admission defaults to batch start.
- Post-start admission defaults to joining month.
- Teacher can choose a month before joining but not before batch start.
- Public/self-registration creates `PENDING_SETUP` and is excluded until teacher confirmation.
- Confirmation sets `ACTIVE`, `confirmedAt`, and `confirmedById`.
- Closing a profile sets `feeEndMonth` to the leave month, capped to the batch end.

- [ ] **Step 5: Implement the profile service**

Use this public contract:

```ts
export type ConfirmStudentFeeProfileInput = {
  instituteId: string;
  studentId: string;
  feeStartMonth: string;
  actorId: string;
};

export async function confirmStudentFeeProfile(
  input: ConfirmStudentFeeProfileInput,
  deps: StudentMonthCoverageDeps = prismaStudentMonthCoverageDeps,
): Promise<{ profile: StudentMonthCoverageProfile; warning: 'BACKDATED_BEFORE_JOIN' | null }>;
```

Load the student, batch, and institute in one tenant-scoped query. Reject the wrong mode, missing batch dates, out-of-range start month, and cross-institute access. Upsert the profile as `ACTIVE` only after validation.

- [ ] **Step 6: Run the calendar/profile tests**

Run: `cd server && JWT_SECRET=test-secret NODE_ENV=test npx tsx --test tests/monthCoverageCalendar.test.ts tests/studentMonthCoverageService.test.ts`

Expected: PASS.

- [ ] **Step 7: Commit the domain foundation**

```bash
git add server/src/domain/monthCoverage server/src/services/studentMonthCoverageService.ts server/tests/monthCoverageCalendar.test.ts server/tests/studentMonthCoverageService.test.ts
git commit -m "feat: add month coverage periods and student profiles"
```

---

### Task 4: Integrate mode-aware batch and student lifecycle behavior

**Files:**
- Modify: `server/src/controllers/batchController.ts:16-105,110-180,646-675`
- Modify: `server/src/controllers/studentController.ts:127-375,379-510`
- Modify: `server/src/controllers/instituteController.ts:310-345`
- Modify: `server/src/schemas.ts:27-75`
- Modify: `server/src/routes/api.ts:270-299`
- Create: `server/tests/monthCoverageLifecycle.test.ts`

**Interfaces:**
- Consumes: profile service from Task 3.
- Produces: batch JSON fields `startDate`, `endDate`, and `coachingFeeMode`.
- Produces: `PUT /month-coverage/students/:studentId/profile` and mode-aware manual-add/approval bodies.

- [ ] **Step 1: Write failing lifecycle controller tests**

Test with mocked Prisma/service dependencies:

```ts
test('month mode batch creation requires start and end dates', async () => {
  // institute loader returns MONTH_COVERAGE
  // POST body omits dates
  // expect 400 { error: 'BATCH_DATES_REQUIRED' }
});

test('legacy batch creation does not require or synthesize dates', async () => {
  // institute loader returns CURRENT_DUE_BASED
  // existing payload succeeds and preserves feeAmount behavior
});

test('self-registered month-mode student is pending fee setup', async () => {
  // student remains approved for normal class access
  // StudentMonthCoverageProfile is created with PENDING_SETUP and null feeStartMonth
});
```

- [ ] **Step 2: Run the focused test and verify failures**

Run: `cd server && JWT_SECRET=test-secret NODE_ENV=test npx tsx --test tests/monthCoverageLifecycle.test.ts`

Expected: FAIL because controllers are not mode-aware.

- [ ] **Step 3: Make batch create/update mode-aware**

- Fetch `coachingFeeMode` with institute config.
- In month mode, require valid `startDate`/`endDate`, normalize them to dates, and store `feeAmount: 0` without creating installments.
- In legacy mode, preserve the current `feeAmount` behavior and do not require dates.
- Return mode and dates from batch list/details.
- Reject attempts to create/edit installments for month-mode batches through the Task 2 route guard.

- [ ] **Step 4: Integrate student profile setup without silent teacher choices**

- Manual teacher add: require `feeStartMonth` in month mode and create the student plus active profile transactionally.
- Teacher approval of a pending record: require `feeStartMonth` in month mode and confirm the profile transactionally.
- Public/self-registration: create a `PENDING_SETUP` profile with no fee start. Displaying the student in class remains allowed, but omit the student from fee denominators until the teacher confirms the start month.
- Do not call `autoAssignGlobalInstallments` for month-mode institutes.
- Legacy registrations and approvals retain the current auto-assignment behavior.
- Archiving/leaving a month-mode student calls `closeStudentFeeProfile`; legacy archive behavior is unchanged.

- [ ] **Step 5: Add the profile endpoint and response data**

Register:

```ts
router.put(
  '/month-coverage/students/:studentId/profile',
  authenticateToken,
  requireMonthCoverageFeeMode,
  validateRequest(confirmMonthCoverageProfileSchema),
  confirmMonthCoverageProfileController,
);
```

Expose `coachingFeeMode`, `timezone`, batch dates, and profile setup status through existing institute/batch payloads so the client can branch without guessing.

- [ ] **Step 6: Run lifecycle and legacy regression tests**

Run: `cd server && JWT_SECRET=test-secret NODE_ENV=test npx tsx --test tests/monthCoverageLifecycle.test.ts tests/studentIds.test.ts tests/api.integration.test.ts`

Expected: PASS.

- [ ] **Step 7: Commit lifecycle integration**

```bash
git add server/src/controllers/batchController.ts server/src/controllers/studentController.ts server/src/controllers/instituteController.ts server/src/schemas.ts server/src/routes/api.ts server/tests/monthCoverageLifecycle.test.ts
git commit -m "feat: integrate month coverage batch and student setup"
```

---

### Task 5: Implement payment preview and atomic creation

**Files:**
- Create: `server/src/services/monthCoveragePaymentService.ts`
- Create: `server/tests/monthCoveragePaymentService.test.ts`

**Interfaces:**
- Produces: `previewMonthCoveragePayment(input, deps): Promise<MonthCoveragePreview>`.
- Produces: `createMonthCoveragePayment(input, deps): Promise<MonthCoveragePaymentResult>`.
- Consumes: `DURATION_MONTHS` and calendar utilities from Task 3.

- [ ] **Step 1: Write failing preview tests**

Use an injected repository and fixed `now` to assert:

```ts
test('quarterly preview chooses the oldest three uncovered months', async () => {
  const result = await previewMonthCoveragePayment({
    instituteId: 'inst-1', studentId: 'student-1', duration: 'QUARTERLY',
    requestedStartMonth: null, allowGap: false, now: new Date('2026-09-10T00:00:00Z'),
  }, fakeDeps({ applicable: ['2026-07', '2026-08', '2026-09', '2026-10'], covered: [] }));
  assert.deepEqual(result.coverageMonths, ['2026-07', '2026-08', '2026-09']);
  assert.equal(result.gapWarning, null);
});

test('edited start blocks an already covered month', async () => {
  await assert.rejects(
    () => previewMonthCoveragePayment(input({ requestedStartMonth: '2026-09' }), fakeDeps({ covered: ['2026-09'] })),
    /MONTH_ALREADY_COVERED/,
  );
});
```

Also cover insufficient remaining months, bounds, an allowed gap with explicit `allowGap: true`, and a gap error with `allowGap: false`.

- [ ] **Step 2: Run the payment tests and verify missing functions**

Run: `cd server && JWT_SECRET=test-secret NODE_ENV=test npx tsx --test tests/monthCoveragePaymentService.test.ts`

Expected: FAIL with missing module/export.

- [ ] **Step 3: Implement preview as a read-only operation**

Return this exact shape:

```ts
export type MonthCoveragePreview = {
  studentId: string;
  duration: MonthCoverageDuration;
  monthCount: number;
  coverageMonths: string[];
  oldestPendingMonth: string;
  gapWarning: { skippedMonths: string[] } | null;
  remainingMonthsAfterPayment: number;
};
```

The preview loads only the active profile, batch boundaries, and active allocation months for the same institute/student. It never reads a legacy fee table.

- [ ] **Step 4: Write failing atomic-create and idempotency tests**

Assert:

- Amount converts to integer paise without floating-point persistence.
- Payment, allocations, and `CREATE` audit event are written in one serializable transaction.
- Reusing the same `(instituteId, idempotencyKey)` returns the original payment without a second write.
- A simulated unique constraint conflict on `(studentId, coverageMonth)` becomes `MONTH_ALREADY_COVERED`.
- Cross-institute student IDs fail before writes.

- [ ] **Step 5: Implement atomic creation**

Use this input contract:

```ts
export type CreateMonthCoveragePaymentInput = {
  instituteId: string;
  actorId: string;
  studentId: string;
  amountRupees: number;
  paymentDate: Date;
  paymentMethod: 'CASH' | 'UPI' | 'BANK' | 'CARD' | 'OTHER';
  duration: MonthCoverageDuration;
  requestedStartMonth: string | null;
  allowGap: boolean;
  note?: string;
  idempotencyKey: string;
};
```

Inside `prisma.$transaction(..., { isolationLevel: 'Serializable' })`, repeat preview validation, create the payment, create active allocation rows, and write the audit snapshot. Catch Prisma `P2002` and map the relevant constraint to a stable conflict error.

- [ ] **Step 6: Run payment tests**

Run: `cd server && JWT_SECRET=test-secret NODE_ENV=test npx tsx --test tests/monthCoveragePaymentService.test.ts`

Expected: PASS.

- [ ] **Step 7: Commit payment preview/create**

```bash
git add server/src/services/monthCoveragePaymentService.ts server/tests/monthCoveragePaymentService.test.ts
git commit -m "feat: add atomic month coverage payments"
```

---

### Task 6: Add editing, voiding, and immutable audit history

**Files:**
- Modify: `server/src/services/monthCoveragePaymentService.ts`
- Modify: `server/tests/monthCoveragePaymentService.test.ts`

**Interfaces:**
- Produces: `updateMonthCoveragePayment(input, deps)`.
- Produces: `previewVoidMonthCoveragePayment(input, deps)` and `voidMonthCoveragePayment(input, deps)`.

- [ ] **Step 1: Add failing edit/void tests**

Assert these transitions:

- Editing snapshots the original payment and months, removes old active allocations, validates replacements, creates replacements, and writes `UPDATE` audit history.
- An optional reason is stored when supplied and remains null when omitted.
- Void preview returns the exact months that will reopen.
- Voiding marks the payment `VOID`, records actor/time, removes active allocations, and writes `VOID` audit history.
- Voided payment amount and months do not count in summaries.
- A reopened month can be covered by a later payment.
- Failure during replacement allocation rolls the transaction back, leaving original allocations intact.

- [ ] **Step 2: Run the focused tests and verify failures**

Run: `cd server && JWT_SECRET=test-secret NODE_ENV=test npx tsx --test tests/monthCoveragePaymentService.test.ts`

Expected: FAIL on missing edit/void exports.

- [ ] **Step 3: Implement edit and void in serializable transactions**

Use explicit before/after snapshots:

```ts
type MonthCoverageAuditSnapshot = {
  amountPaise: number;
  paymentDate: string;
  paymentMethod: string;
  duration: MonthCoverageDuration;
  note: string | null;
  status: MonthCoveragePaymentStatus;
  coverageMonths: string[];
};
```

Lock behavior through the serializable transaction and uniqueness constraint. Never update or delete the audit event. Never physically delete the payment row.

- [ ] **Step 4: Run payment and migration tests**

Run: `cd server && JWT_SECRET=test-secret NODE_ENV=test npx tsx --test tests/monthCoveragePaymentService.test.ts tests/monthCoverageMigration.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit correction support**

```bash
git add server/src/services/monthCoveragePaymentService.ts server/tests/monthCoveragePaymentService.test.ts
git commit -m "feat: audit month coverage payment corrections"
```

---

### Task 7: Add month summaries, dashboard dispatch, and recent transactions

**Files:**
- Create: `server/src/services/monthCoverageSummaryService.ts`
- Create: `server/tests/monthCoverageSummaryService.test.ts`
- Modify: `server/src/controllers/dashboardController.ts:12-160`
- Modify: `server/src/routes/api.ts:249-250`

**Interfaces:**
- Produces: `getMonthCoverageSummary(query, deps)` and `getMonthCoverageDashboard(instituteId, teacherId, now, deps)`.
- Produces: discriminated dashboard response with `feeMode`.

- [ ] **Step 1: Write failing summary tests**

```ts
test('future uncovered months are pending but not overdue', async () => {
  const result = summarizeStudent({
    feeStartMonth: '2026-07', feeEndMonth: '2026-12',
    coveredMonths: ['2026-07', '2026-08'], currentMonth: '2026-09',
  });
  assert.deepEqual(result, {
    applicableMonths: 6, receivedMonths: 2, pendingMonths: 4,
    overdueMonths: 1, nextPendingMonth: '2026-09', progressPercent: 33,
  });
});
```

Also assert that `PENDING_SETUP` students are returned with `setupRequired: true` but excluded from aggregate denominators, inactive profiles stop at their fee end, voided payments are excluded, distinct student-months are counted once, and money totals use active `amountPaise` only.

- [ ] **Step 2: Run the focused tests and verify missing summary module**

Run: `cd server && JWT_SECRET=test-secret NODE_ENV=test npx tsx --test tests/monthCoverageSummaryService.test.ts`

Expected: FAIL.

- [ ] **Step 3: Implement summary query and pure aggregation**

Return:

```ts
type MonthCoverageSummaryResponse = {
  feeMode: 'MONTH_COVERAGE';
  totals: {
    collectedRupees: number;
    receivedMonths: number;
    pendingMonths: number;
    overdueMonths: number;
    applicableMonths: number;
    progressPercent: number;
  };
  students: MonthCoverageStudentSummary[];
  recentPayments: MonthCoveragePaymentSummary[];
};
```

Perform one tenant/teacher-scoped query with profiles, batch dates, active allocations, and active payments. Keep the aggregation pure and separately tested.

- [ ] **Step 4: Dispatch the existing dashboard endpoint by mode**

At the top of `getDashboardSummary`, load `coachingFeeMode`. If it is `MONTH_COVERAGE`, call `getMonthCoverageDashboard` and return:

```ts
{
  feeMode: 'MONTH_COVERAGE',
  stats: { batches, students },
  monthCoverage: totals,
  followUps: [{ studentId, name, batchName, overdueMonths, oldestOverdueMonth }],
  userName,
}
```

Otherwise execute the current SQL and return the current payload plus `feeMode: 'CURRENT_DUE_BASED'`. Do not blend SQL totals or response calculations.

- [ ] **Step 5: Run summary and legacy dashboard tests**

Run: `cd server && JWT_SECRET=test-secret NODE_ENV=test npx tsx --test tests/monthCoverageSummaryService.test.ts tests/controller-success.test.ts tests/feeCalculations.test.ts`

Expected: PASS.

- [ ] **Step 6: Commit summary/dashboard behavior**

```bash
git add server/src/services/monthCoverageSummaryService.ts server/src/controllers/dashboardController.ts server/src/routes/api.ts server/tests/monthCoverageSummaryService.test.ts
git commit -m "feat: add month coverage dashboard summaries"
```

---

### Task 8: Expose month-coverage APIs, reports, reminders, and parent blocking

**Files:**
- Create: `server/src/controllers/monthCoverageController.ts`
- Create: `server/src/services/monthCoverageReportService.ts`
- Create: `server/tests/monthCoverageApi.test.ts`
- Modify: `server/src/controllers/publicController.ts:1-180`
- Modify: `server/src/routes/api.ts:59-90,330-370`
- Modify: `server/src/services/superAdminDeletionService.ts:45-75`
- Modify: `server/src/controllers/instituteController.ts:250-310`

**Interfaces:**
- Consumes: profile, payment, and summary services from Tasks 3, 5, 6, and 7.
- Produces: complete `/month-coverage/*` HTTP contract.

- [ ] **Step 1: Write failing API contract tests**

Cover these authenticated endpoints:

```text
GET    /api/month-coverage/summary?batchId=&status=
GET    /api/month-coverage/payments/recent
POST   /api/month-coverage/payments/preview
POST   /api/month-coverage/payments
PUT    /api/month-coverage/payments/:paymentId
GET    /api/month-coverage/payments/:paymentId/void-preview
DELETE /api/month-coverage/payments/:paymentId
PUT    /api/month-coverage/students/:studentId/profile
POST   /api/month-coverage/reminders
GET    /api/month-coverage/reports/pending
GET    /api/month-coverage/reports/transactions?month=&year=
```

Assert 400 for validation, 401/403 for authorization, 409 for wrong mode/overlap/gap confirmation, and 200/201 for valid service results. Assert legacy institute calls to new routes fail before service execution.

- [ ] **Step 2: Run the API tests and verify missing routes**

Run: `cd server && JWT_SECRET=test-secret NODE_ENV=test npx tsx --test tests/monthCoverageApi.test.ts`

Expected: FAIL with 404/missing controllers.

- [ ] **Step 3: Implement thin controllers and route registration**

Controllers convert request data, call one service, map stable domain error codes to HTTP responses, and serialize `amountPaise / 100` as `amount`. Require `Idempotency-Key` for create; reject missing keys with 400.

- [ ] **Step 4: Implement month-based reports and reminder content**

- Pending report columns: student, batch, fee start, fee end, received count, pending count, overdue count, and overdue month labels.
- Transaction report recognizes the entire received amount on `paymentDate`; do not divide it across months.
- Reminder body names overdue months and contains no amount-due claim or payment link.
- Use the existing email/WhatsApp queue patterns, but do not reuse legacy `amountDue` message composition.

- [ ] **Step 5: Block parent payment surfaces server-side**

In `getPublicStudentFees`, `submitUpiPayment`, and any public UPI verification path, load the institute mode with the existing public student/batch lookup. Return 403:

```json
{ "error": "PARENT_PAYMENTS_DISABLED_FOR_MONTH_COVERAGE" }
```

Do not rely on the client hiding a button.

- [ ] **Step 6: Extend deletion services in dependency order**

Delete month audit events, allocations, payments, profiles, then shared students/batches/institute. Add the same order to both deletion implementations currently present. Do not change legacy deletion ordering except where required by the new foreign keys.

- [ ] **Step 7: Run API, security, and deletion tests**

Run: `cd server && JWT_SECRET=test-secret NODE_ENV=test npx tsx --test tests/monthCoverageApi.test.ts tests/feeSecurity.test.ts tests/superAdminDeletion.test.ts tests/api.integration.test.ts`

Expected: PASS.

- [ ] **Step 8: Commit the server API surface**

```bash
git add server/src/controllers/monthCoverageController.ts server/src/services/monthCoverageReportService.ts server/src/controllers/publicController.ts server/src/routes/api.ts server/src/services/superAdminDeletionService.ts server/src/controllers/instituteController.ts server/tests/monthCoverageApi.test.ts server/tests/api.integration.test.ts
git commit -m "feat: expose isolated month coverage fee APIs"
```

---

### Task 9: Add client contracts, query helpers, and pure view-model logic

**Files:**
- Create: `client/src/features/month-coverage/types.ts`
- Create: `client/src/features/month-coverage/api.ts`
- Create: `client/src/features/month-coverage/monthCoverageViewModel.ts`
- Create: `client/src/features/month-coverage/monthCoverageViewModel.test.ts`

**Interfaces:**
- Produces: typed API calls used by all new UI tasks.
- Produces: `durationOptions`, `formatCoverageRange`, `paymentPreviewCopy`, `monthStatusCopy`, and `availableDurations`.

- [ ] **Step 1: Write failing view-model tests**

```ts
import { describe, expect, it } from 'vitest';
import { availableDurations, paymentPreviewCopy, overlapMessage } from './monthCoverageViewModel';

describe('month coverage view model', () => {
  it('disables durations longer than remaining months', () => {
    expect(availableDurations(4).map(x => [x.value, x.disabled])).toEqual([
      ['MONTHLY', false], ['QUARTERLY', false], ['HALF_YEARLY', true], ['YEARLY', true],
    ]);
  });

  it('describes the exact preview months', () => {
    expect(paymentPreviewCopy(1000, 'QUARTERLY', ['2026-07', '2026-08', '2026-09']))
      .toBe('₹1,000 received · Quarterly · Covers July, August, and September 2026');
  });

  it('uses the approved overlap warning', () => {
    expect(overlapMessage('2026-09')).toBe('September 2026 fee has already been received. Please select another month.');
  });
});
```

- [ ] **Step 2: Run the client test and verify missing module**

Run: `cd client && npm run test:run -- src/features/month-coverage/monthCoverageViewModel.test.ts`

Expected: FAIL.

- [ ] **Step 3: Define exact client contracts and API calls**

Mirror the server discriminated unions, including:

```ts
export type CoachingFeeMode = 'CURRENT_DUE_BASED' | 'MONTH_COVERAGE';
export type MonthCoverageDuration = 'MONTHLY' | 'QUARTERLY' | 'HALF_YEARLY' | 'YEARLY';
export type MonthCoveragePreview = {
  studentId: string;
  duration: MonthCoverageDuration;
  monthCount: number;
  coverageMonths: string[];
  oldestPendingMonth: string;
  gapWarning: { skippedMonths: string[] } | null;
  remainingMonthsAfterPayment: number;
};
```

Centralize query keys under `monthCoverageKeys` and include mode/batch/status parameters. Create and edit calls must preview first. Generate a UUID idempotency key once per dialog submission attempt and reuse it for retries.

- [ ] **Step 4: Implement view-model helpers and run tests**

Run: `cd client && npm run test:run -- src/features/month-coverage/monthCoverageViewModel.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit client foundations**

```bash
git add client/src/features/month-coverage/types.ts client/src/features/month-coverage/api.ts client/src/features/month-coverage/monthCoverageViewModel.ts client/src/features/month-coverage/monthCoverageViewModel.test.ts
git commit -m "feat: add month coverage client contracts"
```

---

### Task 10: Add onboarding, batch dates, and student fee-start UI

**Files:**
- Modify: `client/src/pages/SetupAccount.tsx:80-240,420-540`
- Modify: `client/src/pages/BatchList.tsx:1-180`
- Modify: `client/src/pages/Approvals.tsx:1-130`
- Modify: `client/src/pages/BatchDetails.tsx:65-310,1849-1960`
- Create: `client/src/features/month-coverage/StudentFeeStartDialog.tsx`
- Create: `client/src/features/month-coverage/StudentFeeStartDialog.test.tsx`

**Interfaces:**
- Consumes: `CoachingFeeMode` and API helpers from Task 9.
- Produces: setup payload mode, batch date fields, and teacher-confirmed student profiles.

- [ ] **Step 1: Write failing UI tests**

Test these behaviors with React DOM and mocked API modules:

- Setup page shows two fee-system cards, defaults to current system, and posts the selected exact enum.
- Month mode batch form requires start/end dates; legacy mode form remains unchanged.
- Student fee-start dialog defaults pre-batch admissions to the batch start month.
- Backdating before join displays a warning but permits confirmation.
- A `PENDING_SETUP` student shows `Set fee start` and is not shown as `0/N paid`.

- [ ] **Step 2: Run focused UI tests and verify failures**

Run: `cd client && npm run test:run -- src/features/month-coverage/StudentFeeStartDialog.test.tsx`

Expected: FAIL because the component does not exist.

- [ ] **Step 3: Add fee-mode selection to setup using current styling**

Insert a section beside the existing institute-structure setup, using the same white card, rounded border, typography, and selected-state treatment. Copy must clearly distinguish:

- `Current amount-due system` — fixed fees/installments and rupee balances.
- `Month coverage system` — record received amounts and track months received/pending.

Send `coachingFeeMode` in `/auth/setup-account`. Do not add a later settings toggle.

- [ ] **Step 4: Add conditional batch dates**

Read `coachingFeeMode` from the existing `/institute/me` query. For month mode add required native date fields and submit ISO dates. Validate end >= start on the client for immediate feedback; rely on server validation as authority. Hide fee amount/installment inputs in month mode; leave legacy fields and payload unchanged.

- [ ] **Step 5: Add the fee-start dialog to admission/approval surfaces**

The dialog receives:

```ts
type StudentFeeStartDialogProps = {
  student: { id: string; name: string; joinedAt: string };
  batch: { startDate: string; endDate: string };
  defaultMonth: string;
  onConfirm: (feeStartMonth: string) => Promise<void>;
  onClose: () => void;
};
```

Use it before month-mode approval and after self-registration via `Set fee start` in batch details. Keep the current approval/add-student styling for legacy mode.

- [ ] **Step 6: Run focused tests and build**

Run: `cd client && npm run test:run -- src/features/month-coverage/StudentFeeStartDialog.test.tsx`

Run: `cd client && npm run build`

Expected: PASS.

- [ ] **Step 7: Commit setup UI**

```bash
git add client/src/pages/SetupAccount.tsx client/src/pages/BatchList.tsx client/src/pages/Approvals.tsx client/src/pages/BatchDetails.tsx client/src/features/month-coverage/StudentFeeStartDialog.tsx client/src/features/month-coverage/StudentFeeStartDialog.test.tsx
git commit -m "feat: add month coverage setup workflow"
```

---

### Task 11: Build the month-coverage payment dialog and Fee-page view

**Files:**
- Create: `client/src/features/month-coverage/MonthCoveragePaymentDialog.tsx`
- Create: `client/src/features/month-coverage/MonthCoveragePaymentDialog.test.tsx`
- Create: `client/src/features/month-coverage/MonthCoverageFeesView.tsx`
- Create: `client/src/features/month-coverage/MonthCoverageFeesView.test.tsx`
- Modify: `client/src/pages/Fees.tsx:1-270`
- Modify: `client/src/components/QuickFeeModal.tsx:1-180`

**Interfaces:**
- Consumes: Task 9 API/types and server Task 8 endpoints.
- Produces: conditional month-mode Fee page and reusable create/edit dialog.

- [ ] **Step 1: Write failing dialog interaction tests**

Assert:

- Selecting `QUARTERLY` calls preview and renders exact months.
- Editing the starting month refreshes preview.
- `MONTH_ALREADY_COVERED` renders `September 2026 fee has already been received. Please select another month.` and disables Confirm.
- A gap warning lists skipped months and requires a second explicit confirmation.
- Submit sends amount, date, method, duration, requested month, `allowGap`, note, and a stable idempotency key.
- Edit mode displays current values and performs PUT only after a valid preview.

- [ ] **Step 2: Run dialog tests and verify failure**

Run: `cd client && npm run test:run -- src/features/month-coverage/MonthCoveragePaymentDialog.test.tsx`

Expected: FAIL.

- [ ] **Step 3: Implement the reusable payment dialog in existing modal style**

Reuse the current modal shell, form spacing, button hierarchy, receipt scanning amount population, and responsive behavior. Add duration buttons, covered-month preview, optional start-month editor, payment method, date, and note. Disable options longer than remaining months.

- [ ] **Step 4: Write failing Fee-view tests**

Assert summary cards display amount collected and month metrics, filters use batch/status instead of installments, student rows show `received / applicable`, pending, overdue, next pending, and progress, and void confirmation lists months that reopen before DELETE.

- [ ] **Step 5: Implement conditional Fee-page dispatch**

Keep the existing `Fees` implementation as the legacy branch. Fetch `/institute/me` once and render:

```tsx
return institute.coachingFeeMode === 'MONTH_COVERAGE'
  ? <MonthCoverageFeesView />
  : <LegacyFeesView />;
```

Extract the current body to a local `LegacyFeesView` without changing its queries, copy, or calculations. The new view mirrors its cards/table/modal/history/report placements but uses Task 9 APIs.

- [ ] **Step 6: Integrate Quick Fee conditionally**

Keep the current quick modal untouched for legacy mode. In month mode, student selection opens `MonthCoveragePaymentDialog`; do not request `/fees` or post `/fees/pay`.

- [ ] **Step 7: Run focused tests and build**

Run: `cd client && npm run test:run -- src/features/month-coverage/MonthCoveragePaymentDialog.test.tsx src/features/month-coverage/MonthCoverageFeesView.test.tsx`

Run: `cd client && npm run build`

Expected: PASS.

- [ ] **Step 8: Commit the payment/Fee UI**

```bash
git add client/src/features/month-coverage/MonthCoveragePaymentDialog.tsx client/src/features/month-coverage/MonthCoveragePaymentDialog.test.tsx client/src/features/month-coverage/MonthCoverageFeesView.tsx client/src/features/month-coverage/MonthCoverageFeesView.test.tsx client/src/pages/Fees.tsx client/src/components/QuickFeeModal.tsx
git commit -m "feat: add month coverage fee management UI"
```

---

### Task 12: Integrate dashboard, batch progress, history, and parent unavailable state

**Files:**
- Modify: `client/src/pages/Dashboard.tsx:1-440`
- Modify: `client/src/pages/BatchDetails.tsx:65-1500,2380-2470`
- Modify: `client/src/pages/StudentPaymentPortal.tsx:1-220`
- Create: `client/src/pages/Dashboard.monthCoverage.test.tsx`
- Create: `client/src/pages/BatchDetails.monthCoverage.test.tsx`

**Interfaces:**
- Consumes: discriminated dashboard response from Task 7 and month summary/history APIs from Task 8.
- Produces: current-layout month metrics everywhere teachers currently manage fees.

- [ ] **Step 1: Write failing dashboard tests**

Assert the `MONTH_COVERAGE` response:

- Reuses the current Students, Batches, Collection, and This Month card positions.
- Computes Collection from `receivedMonths / applicableMonths`, never rupees.
- Shows this-month or total rupees separately with the existing privacy toggle.
- Labels follow-ups with overdue month counts and oldest overdue month.
- Does not render amount due or rupee pending copy.

Assert the legacy fixture still renders current amount-based labels and values.

- [ ] **Step 2: Run dashboard tests and verify failures**

Run: `cd client && npm run test:run -- src/pages/Dashboard.monthCoverage.test.tsx`

Expected: FAIL.

- [ ] **Step 3: Implement discriminated dashboard rendering**

Change `DashboardSummaryResponse` to a union keyed by `feeMode`. Keep the surrounding page and cards. Select calculation/copy only within the fee-specific cards and follow-up section. Do not make legacy calculations accept month fields.

- [ ] **Step 4: Write and implement batch-detail tests**

Assert month-mode rows show fee setup required or individual `received / applicable` progress, and payment history shows amount, duration, covered months, date, method, status, and actor. Assert legacy installment columns remain unchanged for current-mode fixtures.

Use the same payment dialog from Task 11 rather than duplicating form logic.

- [ ] **Step 5: Add parent unavailable state**

When the public fee endpoint returns `PARENT_PAYMENTS_DISABLED_FOR_MONTH_COVERAGE`, render a neutral existing-style message: `Fee payments for this coaching are recorded by the teacher. Please contact the coaching directly.` Do not show amount entry, UPI upload, or payment controls.

- [ ] **Step 6: Run focused tests and build**

Run: `cd client && npm run test:run -- src/pages/Dashboard.monthCoverage.test.tsx src/pages/BatchDetails.monthCoverage.test.tsx`

Run: `cd client && npm run build`

Expected: PASS.

- [ ] **Step 7: Commit integrated month UI**

```bash
git add client/src/pages/Dashboard.tsx client/src/pages/BatchDetails.tsx client/src/pages/StudentPaymentPortal.tsx client/src/pages/Dashboard.monthCoverage.test.tsx client/src/pages/BatchDetails.monthCoverage.test.tsx
git commit -m "feat: show month coverage across teacher dashboards"
```

---

### Task 13: Complete isolation, concurrency, regression, and release verification

**Files:**
- Modify: `server/tests/api.integration.test.ts`
- Modify: `server/tests/coachingFeeMode.test.ts`
- Modify: `server/tests/monthCoveragePaymentService.test.ts`
- Modify: `client/src/features/month-coverage/MonthCoverageFeesView.test.tsx`
- Modify: `docs/guides/LOCAL_DEVELOPMENT_GUIDE.md`

**Interfaces:**
- Verifies all prior tasks as one release candidate.

- [ ] **Step 1: Add a two-way isolation regression matrix**

For a mocked/authenticated legacy institute, assert:

- `/api/fees` and `/api/fees/pay` reach legacy handlers.
- `/api/month-coverage/summary` and `/api/month-coverage/payments` return `FEE_MODE_MISMATCH`.
- No month-coverage repository write is invoked.

For a month-mode institute, assert:

- `/api/month-coverage/*` reaches month services.
- `/api/fees`, `/api/fees/pay`, installment routes, custom invoices, UPI verification, and parent payment endpoints are rejected.
- No legacy fee write is invoked.

- [ ] **Step 2: Add explicit duplicate and concurrency verification**

Run two create calls with the same idempotency key and assert one payment. Run two calls with different keys targeting the same month and assert one success plus one `MONTH_ALREADY_COVERED` conflict. Verify the successful payment has the complete allocation/audit set and the failed transaction leaves no partial rows.

- [ ] **Step 3: Add migration/backfill verification instructions**

Document and run against a disposable database:

```bash
cd server
npx prisma migrate deploy
npx prisma validate
npx prisma generate
```

Verify with SQL that every pre-existing institute has `CURRENT_DUE_BASED` and non-null `coachingFeeModeSelectedAt`, and that counts/sums in legacy fee tables match their pre-migration values.

- [ ] **Step 4: Run all server tests**

Run: `cd server && npm test`

Expected: all Node tests pass with zero failures.

- [ ] **Step 5: Run all client tests, lint, and builds**

Run: `cd client && npm run test:run`

Run: `cd client && npm run lint`

Run: `npm run build`

Expected: all tests pass, lint exits zero, and both client/server builds succeed.

- [ ] **Step 6: Perform manual acceptance checks in both modes**

Use two disposable institutes:

1. Existing/current mode: create batch without dates, add student, create installment, record payment, open dashboard/Fee page, and confirm the UI and totals match the pre-feature behavior.
2. New/month mode: choose month coverage during setup, create dated batch, register one student before batch start and one after start, confirm fee starts, record Monthly and Quarterly payments, edit one into a warned gap, verify overlap rejection, void a payment, and confirm all progress/report totals refresh.
3. Confirm parent payment controls remain available for current mode and unavailable for month mode.
4. Confirm mobile layouts match the current visual patterns and no horizontal overflow is introduced.

- [ ] **Step 7: Document local verification and rollout notes**

Add a concise section to `LOCAL_DEVELOPMENT_GUIDE.md` with the migration commands, the two mode enum values, disposable-institute test setup, and rollback rule: application rollback is safe because the migration is additive, but do not drop new tables while month-mode institutes contain data.

- [ ] **Step 8: Commit final verification coverage**

```bash
git add server/tests/api.integration.test.ts server/tests/coachingFeeMode.test.ts server/tests/monthCoveragePaymentService.test.ts client/src/features/month-coverage/MonthCoverageFeesView.test.tsx docs/guides/LOCAL_DEVELOPMENT_GUIDE.md
git commit -m "test: verify month coverage fee isolation"
```

---

## Completion Gate

Before claiming completion:

- Run `git diff --check`.
- Confirm `git status --short` contains no accidental unrelated staging.
- Confirm the legacy fee test suite passed after the final route guards and UI dispatch were added.
- Confirm the month model has no imports from `feeCalculations.ts` and no Prisma reads of legacy fee models.
- Confirm legacy controllers/services have no imports from month-coverage services.
- Confirm all destructive institute-cleanup paths include the new tables.
- Confirm the migration backfill affects institute mode fields only and leaves legacy fee data unchanged.
- Use `superpowers:verification-before-completion` before reporting success.
