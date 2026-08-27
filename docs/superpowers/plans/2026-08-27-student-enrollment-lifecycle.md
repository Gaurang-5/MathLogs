# Student Enrollment Lifecycle Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Preserve one permanent student identity while supporting simultaneous batches, safe re-enrollment, teacher-selected fee applicability, identity review, lifecycle WhatsApp messages, and shared-phone portal selection.

**Architecture:** Introduce `Enrollment` as the source of batch participation and place orchestration in a dedicated enrollment domain/service. Roll out additively: create and backfill enrollment data, dual-read during reconciliation, switch every batch-scoped query and mutation, then remove legacy `Student` lifecycle fields only in a separately gated contract migration.

**Tech Stack:** PostgreSQL, Prisma 5.22, Express 5, TypeScript 5.9, Zod 4, Node test runner, React 19, TanStack Query 5, Vitest 3, Tailwind CSS.

**Spec:** `docs/superpowers/specs/2026-08-27-student-enrollment-lifecycle-and-attendance-removal-design.md`

## Global Constraints

- `Student` is permanent institute-scoped identity; enrollment is one continuous period in one batch.
- One student may have several active enrollments in different batches but at most one active enrollment per student/batch.
- Teacher selection is the only path that automatically reuses a possible old profile.
- Public registration never silently merges a credible match and instead creates an identity-review request.
- Re-enrollment is immediate and requires no student approval or registration link.
- Ending one enrollment requires a reason and cannot affect other active enrollments.
- Permanent deletion is available only for a profile with no active or ended enrollment and no academic, fee, quiz, or operational history.
- The teacher selects the fee start month or applicable installments before confirmation; existing charges and payments are never recreated.
- Lifecycle WhatsApp failure never rolls back enrollment state and is retryable and deduplicated.
- Phone is a contact value, not unique identity; shared-phone OTP login must show a selector.
- Use an expand/migrate/switch/contract rollout and never edit applied migrations.
- Preserve unrelated uncommitted work and stage only task-owned files.
- Follow TDD and make one reviewable commit per task.

---

## File Structure and Responsibilities

### Server files to create

- `server/src/domain/enrollments/types.ts` — typed commands, fee choices, results, errors, and candidate projections.
- `server/src/domain/enrollments/identity.ts` — normalized identity matching and explainable candidate reasons.
- `server/src/services/enrollmentFeeService.ts` — mode-specific fee preview/application interface.
- `server/src/services/enrollmentService.ts` — transactional create, re-enroll, end, delete-eligibility, and idempotency orchestration.
- `server/src/services/enrollmentQueryService.ts` — active membership checks and batch/student participation projections.
- `server/src/services/enrollmentNotificationService.ts` — post-commit lifecycle WhatsApp enqueue and retry status.
- `server/src/services/identityReviewService.ts` — create and resolve public-registration candidate reviews.
- `server/src/controllers/enrollmentController.ts` — authenticated HTTP translation only.
- `server/src/controllers/identityReviewController.ts` — review listing/resolution HTTP translation.
- `server/scripts/backfillEnrollments.ts` — evidence-based historical inference and reconciliation report.
- `server/tests/enrollmentMigration.test.ts` — additive schema, partial uniqueness, and backfill contract.
- `server/tests/enrollmentService.test.ts` — lifecycle, tenancy, idempotency, concurrency, and deletion rules.
- `server/tests/enrollmentFeeService.test.ts` — both fee modes and duplicate protection.
- `server/tests/enrollmentApi.test.ts` — route validation and response contracts.
- `server/tests/identityReviewService.test.ts` — public duplicate handling.
- `server/tests/enrollmentNotificationService.test.ts` — message event keys and retry behavior.
- `server/tests/studentPortalAccountSelection.test.ts` — shared-phone authentication and authorization.
- `server/tests/enrollmentReadMigration.test.ts` — prevents batch-scoped runtime queries from returning to `Student.batchId` after the switch.

### Client files to create

- `client/src/features/enrollments/types.ts` — API contracts.
- `client/src/features/enrollments/api.ts` — query keys and mutation functions.
- `client/src/features/enrollments/AddStudentFlow.tsx` — identity search, explicit reuse/new choice, fee preview, and confirmation.
- `client/src/features/enrollments/FeeApplicabilityStep.tsx` — mode-specific fee choice.
- `client/src/features/enrollments/EnrollmentHistory.tsx` — active and ended participation periods.
- `client/src/features/enrollments/EndEnrollmentDialog.tsx` — scoped removal reason and confirmation.
- `client/src/features/enrollments/IdentityReviewQueue.tsx` — submitted data beside candidate profiles.
- `client/src/features/enrollments/*.test.tsx` — focused interaction contracts.
- `client/src/features/student-portal/StudentAccountSelector.tsx` — post-OTP shared-phone account selection.
- `client/src/features/student-portal/StudentAccountSelector.test.tsx` — account selection behavior.

### Existing files to modify

- `server/prisma/schema.prisma` and new forward migrations — enrollment, identity review, idempotency, audit, WhatsApp dedupe, fee ownership, then later legacy-field contract.
- `server/src/schemas.ts`, `server/src/routes/api.ts` — commands and authenticated routes.
- `server/src/controllers/studentController.ts`, `batchController.ts`, `statusController.ts`, `testController.ts`, `feeController.ts`, `dashboardController.ts`, `publicController.ts`, `studentPortalController.ts` — delegate or query enrollment membership.
- `server/src/controllers/inviteController.ts` and invite token storage — carry signed fee applicability into new-student registration.
- `server/src/routes/studentPortalRoutes.ts`, `server/src/utils/whatsapp.ts` — account selection and lifecycle templates.
- `server/src/services/studentMonthCoverageService.ts`, `monthCoveragePaymentService.ts`, `monthCoverageSummaryService.ts`, `monthCoverageReportService.ts`, `batchExportService.ts` — use enrollment-scoped coverage and membership.
- `client/src/pages/BatchDetails.tsx`, `StudentProfile.tsx`, `Approvals.tsx`, `StudentPortalLogin.tsx`, `StudentPortalDashboard.tsx`, `TestDetails.tsx`, `ScanMarks.tsx`, `Fees.tsx`, `Dashboard.tsx` — enrollment-aware integration points.
- Existing related server/client tests — update fixture shapes only when the owning behavior switches.

---

### Task 1: Add the enrollment domain schema and additive migration

**Files:**
- Modify: `server/prisma/schema.prisma`
- Create: `server/prisma/migrations/20260827100000_expand_student_enrollments/migration.sql`
- Create: `server/tests/enrollmentMigration.test.ts`
- Create: `server/src/domain/enrollments/types.ts`

**Interfaces:**
- Produces: `EnrollmentStatus`, `IdentityReviewStatus`, `Enrollment`, `StudentIdentityReview`, `EnrollmentAction`, and `StudentDeletionAudit`.
- Produces: nullable `enrollmentId` on month-coverage profile/payment/allocation during expansion.
- Produces: nullable unique `WhatsappJob.eventKey` for lifecycle deduplication.
- Produces: nullable `InviteToken.enrollmentIntent Json?` for a signed new-student fee choice.
- Produces: `EnrollExistingStudentCommand`, `EndEnrollmentCommand`, `EnrollmentFeeChoice`, and `EnrollmentResult`.

- [ ] **Step 1: Write the failing schema/migration contract**

```ts
// server/tests/enrollmentMigration.test.ts
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const schema = readFileSync(path.join(process.cwd(), 'prisma/schema.prisma'), 'utf8');
const migration = readFileSync(path.join(process.cwd(), 'prisma/migrations/20260827100000_expand_student_enrollments/migration.sql'), 'utf8');

test('enrollment expansion is additive and enforces one active student-batch membership', () => {
  assert.match(schema, /model Enrollment[\s\S]*status\s+EnrollmentStatus/);
  assert.match(schema, /model StudentIdentityReview/);
  assert.match(migration, /CREATE UNIQUE INDEX "Enrollment_one_active_student_batch"[\s\S]*WHERE "status" = 'ACTIVE'/);
  assert.match(migration, /ADD COLUMN\s+"enrollmentId"/);
  assert.doesNotMatch(migration, /DROP COLUMN\s+"batchId"|DROP COLUMN\s+"status"/i);
});
```

- [ ] **Step 2: Run the test and verify the missing model/migration failure**

Run: `cd server && JWT_SECRET=test-secret NODE_ENV=test npx tsx --test tests/enrollmentMigration.test.ts`

Expected: FAIL because the migration file and models do not exist.

- [ ] **Step 3: Add exact domain command/result types**

```ts
// server/src/domain/enrollments/types.ts
export type EnrollmentFeeChoice =
  | { mode: 'MONTH_COVERAGE'; feeStartMonth: string }
  | { mode: 'CURRENT_DUE_BASED'; installmentIds: string[] };

export type EnrollExistingStudentCommand = {
  instituteId: string; actorId: string; studentId: string; batchId: string;
  startedAt: Date; fee: EnrollmentFeeChoice; idempotencyKey: string;
};

export type EndEnrollmentCommand = {
  instituteId: string; actorId: string; enrollmentId: string;
  endedAt: Date; reason: string; idempotencyKey: string;
};

export type EnrollmentResult =
  | { outcome: 'CREATED' | 'REENROLLED'; enrollmentId: string; notificationEventKey: string }
  | { outcome: 'ALREADY_ENROLLED'; enrollmentId: string }
  | { outcome: 'ENDED' | 'ALREADY_ENDED'; enrollmentId: string; notificationEventKey?: string };
```

- [ ] **Step 4: Add Prisma models and the forward expansion SQL**

Use `Enrollment(id, instituteId, studentId, batchId, status, startedAt, endedAt, endReason, createdById, endedById, createdAt, updatedAt)`. Add normal indexes on institute/status, student/status, and batch/status; create the active partial unique index in SQL. Use `StudentIdentityReview(id, instituteId, batchId, submittedData Json, candidateStudentIds Json, status)` with statuses `PENDING`, `RESOLVED_EXISTING`, `RESOLVED_NEW`, and `REJECTED`, plus nullable `resolvedStudentId`, `resolvedById`, `resolvedAt`, and timestamps. Use `EnrollmentAction(instituteId, idempotencyKey, action, result Json, enrollmentId)` with unique `(instituteId,idempotencyKey)`. Keep `StudentDeletionAudit.studentId` as scalar text without a foreign key so the audit survives deletion.

Add nullable `enrollmentId` plus relations/indexes to all three month-coverage models, nullable `eventKey String? @unique` to `WhatsappJob`, and nullable `enrollmentIntent Json?` to `InviteToken`. Do not remove `Student.batchId`, `status`, `leftAt`, or `leaveReason` in this migration.

- [ ] **Step 5: Validate schema and rerun the test**

Run: `cd server && npx prisma format && npx prisma validate && npx prisma generate`

Run: `cd server && JWT_SECRET=test-secret NODE_ENV=test npx tsx --test tests/enrollmentMigration.test.ts`

Expected: all commands exit 0.

- [ ] **Step 6: Commit the expansion**

```bash
git add server/prisma/schema.prisma server/prisma/migrations/20260827100000_expand_student_enrollments/migration.sql server/tests/enrollmentMigration.test.ts server/src/domain/enrollments/types.ts
git commit -m "feat: add student enrollment domain schema"
```

---

### Task 2: Build evidence-based backfill and reconciliation

**Files:**
- Modify: `server/prisma/schema.prisma`
- Create: `server/scripts/backfillEnrollments.ts`
- Create: `server/tests/enrollmentBackfill.test.ts`
- Create: `server/prisma/migrations/20260827110000_enrollment_fee_constraints/migration.sql`

**Interfaces:**
- Consumes: additive schema from Task 1.
- Produces: active enrollments for current students, evidence-backed ended enrollments, fee `enrollmentId` links, and a JSON reconciliation report.

- [ ] **Step 1: Write failing backfill cases**

```ts
test('backfill never guesses ambiguous historical membership', async () => {
  const result = await buildEnrollmentBackfillPlan({
    students: [{ id: 's1', instituteId: 'i1', batchId: null, status: 'LEFT', createdAt: new Date('2026-01-01') }],
    evidenceByStudent: { s1: [{ batchId: 'b1', kind: 'TEST' }, { batchId: 'b2', kind: 'PAYMENT' }] },
  });
  assert.deepEqual(result.enrollments, []);
  assert.equal(result.unresolved[0].reason, 'AMBIGUOUS_BATCH_EVIDENCE');
});

test('backfill creates an active enrollment from current Student.batchId', async () => {
  const result = await buildEnrollmentBackfillPlan({
    students: [{ id: 's1', instituteId: 'i1', batchId: 'b1', status: 'APPROVED', createdAt: new Date('2026-01-01') }],
    evidenceByStudent: {},
  });
  assert.deepEqual(result.enrollments.map(row => [row.studentId, row.batchId, row.status]), [['s1', 'b1', 'ACTIVE']]);
});
```

- [ ] **Step 2: Run and observe the missing planner failure**

Run: `cd server && JWT_SECRET=test-secret NODE_ENV=test npx tsx --test tests/enrollmentBackfill.test.ts`

Expected: FAIL because `buildEnrollmentBackfillPlan` is not defined.

- [ ] **Step 3: Implement a pure planner and idempotent writer**

The planner input and report contracts are:

```ts
type EnrollmentBackfillInput = {
  students: Array<{ id: string; instituteId: string; batchId: string | null; status: string; createdAt: Date }>;
  evidenceByStudent: Record<string, Array<{ batchId: string; kind: 'MONTH_PROFILE' | 'INSTALLMENT' | 'PAYMENT' | 'TEST' }>>;
};

type EnrollmentBackfillReport = {
  sourceStudents: number; activeCreated: number; endedCreated: number;
  feeRowsLinked: number; unresolved: Array<{ studentId: string; reason: string; evidence: unknown[] }>;
  crossTenantRows: string[]; duplicateActiveConflicts: string[];
};
```

Trust current `Student.batchId` first. For students whose batch was cleared, create an ended enrollment only when every durable batch-bearing relation points to the same institute-owned batch. Otherwise report and write nothing. Upsert by deterministic migration keys so reruns create no duplicates.

- [ ] **Step 4: Add the fee constraint migration**

After the script reports zero unexpected unlinked fee rows, update `schema.prisma` so all three `enrollmentId` fields are required, the profile is unique by `enrollmentId`, and allocation is unique by `(enrollmentId,coverageMonth)`. The migration must abort if any month-coverage profile/payment/allocation lacks `enrollmentId`, then set those columns `NOT NULL` and replace the old unique indexes. Keep `studentId` and `batchId` columns for reporting compatibility during the switch.

- [ ] **Step 5: Run focused and migration tests**

Run: `cd server && JWT_SECRET=test-secret NODE_ENV=test npx tsx --test tests/enrollmentBackfill.test.ts tests/enrollmentMigration.test.ts`

Expected: PASS.

- [ ] **Step 6: Commit backfill and constraints**

```bash
git add server/prisma/schema.prisma server/scripts/backfillEnrollments.ts server/tests/enrollmentBackfill.test.ts server/prisma/migrations/20260827110000_enrollment_fee_constraints/migration.sql
git commit -m "feat: backfill enrollment history safely"
```

---

### Task 3: Implement enrollment membership queries and identity candidates

**Files:**
- Create: `server/src/domain/enrollments/identity.ts`
- Create: `server/src/services/enrollmentQueryService.ts`
- Create: `server/tests/enrollmentQueryService.test.ts`

**Interfaces:**
- Produces: `normalizeIdentityText(value: string): string`.
- Produces: `searchEnrollmentCandidates({instituteId,batchId,query}, db): Promise<EnrollmentCandidate[]>`.
- Produces: `isStudentActiveInBatch(db,studentId,batchId): Promise<boolean>` and `listActiveBatchIds(db,studentId): Promise<string[]>`.

- [ ] **Step 1: Write failing identity and membership tests**

```ts
test('candidate search includes ended profiles and explains matches', async () => {
  const rows = await searchEnrollmentCandidates({ instituteId: 'i1', batchId: 'b2', query: '98765 43210' }, db);
  assert.deepEqual(rows[0].matchReasons, ['PARENT_PHONE']);
  assert.deepEqual(rows[0].previousBatches, [{ id: 'b1', name: 'Class 10 Boys' }]);
});

test('same student may be active in two batches but membership is batch-specific', async () => {
  assert.equal(await isStudentActiveInBatch(db, 's1', 'b1'), true);
  assert.deepEqual(await listActiveBatchIds(db, 's1'), ['b1', 'b2']);
});
```

- [ ] **Step 2: Run and verify missing service failures**

Run: `cd server && JWT_SECRET=test-secret NODE_ENV=test npx tsx --test tests/enrollmentQueryService.test.ts`

Expected: FAIL because the query service does not exist.

- [ ] **Step 3: Implement deterministic candidate projections**

Normalize Unicode, trim, collapse spaces, lowercase names, and compare digit-only last-ten phone values. Return student ID, human ID, parent name, phone, school, active batches, ended batches, balance, and explicit `matchReasons`. Never return a `reuseRecommended` or automatic-match boolean.

- [ ] **Step 4: Run focused tests and commit**

Run: `cd server && JWT_SECRET=test-secret NODE_ENV=test npx tsx --test tests/enrollmentQueryService.test.ts`

Expected: PASS.

```bash
git add server/src/domain/enrollments/identity.ts server/src/services/enrollmentQueryService.ts server/tests/enrollmentQueryService.test.ts
git commit -m "feat: add enrollment identity search"
```

---

### Task 4: Implement mode-specific fee preview and application

**Files:**
- Create: `server/src/services/enrollmentFeeService.ts`
- Create: `server/tests/enrollmentFeeService.test.ts`
- Modify: `server/src/services/studentMonthCoverageService.ts`
- Modify: `server/src/services/monthCoveragePaymentService.ts`
- Modify: `server/src/services/monthCoverageSummaryService.ts`
- Modify: `server/src/services/monthCoverageReportService.ts`

**Interfaces:**
- Produces: `previewEnrollmentFees(tx,context,choice): Promise<EnrollmentFeePreview>`.
- Produces: `applyEnrollmentFees(tx,enrollment,choice): Promise<AppliedEnrollmentFees>`.
- Consumes: `EnrollmentFeeChoice` from Task 1.

- [ ] **Step 1: Write failing fee-mode tests**

```ts
test('month coverage allows the same month in two enrollment scopes', async () => {
  await applyEnrollmentFees(tx, { id: 'e1', instituteId: 'i1', studentId: 's1', batchId: 'b1' }, { mode: 'MONTH_COVERAGE', feeStartMonth: '2026-08' });
  await applyEnrollmentFees(tx, { id: 'e2', instituteId: 'i1', studentId: 's1', batchId: 'b2' }, { mode: 'MONTH_COVERAGE', feeStartMonth: '2026-08' });
  assert.equal(tx.monthCoverageProfile.rows.length, 2);
});

test('current due applies only selected destination-batch installments', async () => {
  const applied = await applyEnrollmentFees(tx, { id: 'e1', instituteId: 'i1', studentId: 's1', batchId: 'b1' }, {
    mode: 'CURRENT_DUE_BASED', installmentIds: ['b1-old', 'b1-current'],
  });
  assert.deepEqual(applied.assignmentIds, ['b1-old', 'b1-current']);
});
```

- [ ] **Step 2: Run and verify the missing adapter failure**

Run: `cd server && JWT_SECRET=test-secret NODE_ENV=test npx tsx --test tests/enrollmentFeeService.test.ts`

Expected: FAIL because `enrollmentFeeService` does not exist.

- [ ] **Step 3: Implement strict fee adapters**

For month coverage, validate canonical `YYYY-MM`, institute timezone, and batch start/end bounds; create a profile owned by `enrollmentId`. For current due, load every selected installment under the destination batch and institute, reject unavailable IDs, and use `upsert`/`createMany({skipDuplicates:true})` against `(studentId,installmentId)`. Preview and apply must share the same validated calculation result.

- [ ] **Step 4: Move coverage reads and writes to enrollment scope**

Every month-coverage service query must filter or join by `enrollmentId`; `studentId` remains a projection/filter but is not the ownership key. Add regression cases for two simultaneous batches and for ending only one profile.

- [ ] **Step 5: Run fee regressions and commit**

Run: `cd server && JWT_SECRET=test-secret NODE_ENV=test npx tsx --test tests/enrollmentFeeService.test.ts tests/studentMonthCoverageService.test.ts tests/monthCoveragePaymentService.test.ts tests/monthCoverageSummaryService.test.ts tests/monthCoverageLifecycle.test.ts`

Expected: PASS.

```bash
git add server/src/services/enrollmentFeeService.ts server/tests/enrollmentFeeService.test.ts server/src/services/studentMonthCoverageService.ts server/src/services/monthCoveragePaymentService.ts server/src/services/monthCoverageSummaryService.ts server/src/services/monthCoverageReportService.ts server/tests/studentMonthCoverageService.test.ts server/tests/monthCoveragePaymentService.test.ts server/tests/monthCoverageSummaryService.test.ts server/tests/monthCoverageLifecycle.test.ts
git commit -m "feat: scope fees to student enrollments"
```

---

### Task 5: Implement transactional enrollment lifecycle and deletion eligibility

**Files:**
- Create: `server/src/services/enrollmentService.ts`
- Create: `server/tests/enrollmentService.test.ts`

**Interfaces:**
- Produces: `enrollExistingStudent(command): Promise<EnrollmentResult>`.
- Produces: `createStudentAndEnrollment(command): Promise<EnrollmentResult & {studentId:string}>`.
- Produces: `endEnrollment(command): Promise<EnrollmentResult>`.
- Produces: `getPermanentDeletionEligibility(context): Promise<DeletionEligibility>` and `deleteEmptyStudent(context): Promise<void>`.
- Consumes: fee adapter from Task 4 and query helper from Task 3.

- [ ] **Step 1: Write failing lifecycle tests**

```ts
test('re-enrollment preserves identity and creates a new period', async () => {
  const result = await enrollExistingStudent({
    instituteId: 'i1', actorId: 'a1', studentId: 's1', batchId: 'b1',
    startedAt: new Date('2026-08-27'), fee: { mode: 'CURRENT_DUE_BASED', installmentIds: [] }, idempotencyKey: 'reenroll-1',
  });
  assert.equal(result.outcome, 'REENROLLED');
  assert.equal(db.student.created.length, 0);
  assert.equal(db.enrollment.created[0].studentId, 's1');
});

test('ending one enrollment leaves another active', async () => {
  await endEnrollment({
    instituteId: 'i1', actorId: 'a1', enrollmentId: 'e1',
    endedAt: new Date('2026-08-27'), reason: 'Moved schedule', idempotencyKey: 'end-1',
  });
  assert.equal(db.enrollment.byId('e1').status, 'ENDED');
  assert.equal(db.enrollment.byId('e2').status, 'ACTIVE');
});

test('permanent deletion rejects any enrollment history', async () => {
  const eligibility = await getPermanentDeletionEligibility({ instituteId: 'i1', studentId: 's1' });
  assert.deepEqual(eligibility, { eligible: false, blockers: ['ENROLLMENT_HISTORY'] });
});
```

- [ ] **Step 2: Run and observe missing service failures**

Run: `cd server && JWT_SECRET=test-secret NODE_ENV=test npx tsx --test tests/enrollmentService.test.ts`

Expected: FAIL because `enrollmentService` does not exist.

- [ ] **Step 3: Implement transaction and idempotency behavior**

Within one `prisma.$transaction`: validate institute ownership; return an existing `EnrollmentAction.result` for a repeated idempotency key; return `ALREADY_ENROLLED` if the partial unique membership exists; determine `CREATED` versus `REENROLLED` from ended history; create the enrollment; apply fees; persist the action result. `createStudentAndEnrollment` additionally allocates the human ID and permanent student in that same transaction. Convert Prisma `P2002` on the active partial index into `ALREADY_ENROLLED`.

Ending must require `reason.trim().length >= 3`, close only the selected enrollment and its month profile, preserve old fees/payments, and store an idempotent result.

- [ ] **Step 4: Implement permanent deletion guard and audit**

Check enrollments, marks, quiz submissions, all legacy and month fee relations, balances, UPI verifications, and operational references. Only when every count is zero, write `StudentDeletionAudit` with the actor, reason, and serialized empty profile, then delete the student in the same transaction.

- [ ] **Step 5: Run focused lifecycle tests and commit**

Run: `cd server && JWT_SECRET=test-secret NODE_ENV=test npx tsx --test tests/enrollmentService.test.ts tests/enrollmentFeeService.test.ts`

Expected: PASS.

```bash
git add server/src/services/enrollmentService.ts server/tests/enrollmentService.test.ts
git commit -m "feat: add transactional enrollment lifecycle"
```

---

### Task 6: Expose teacher enrollment APIs

**Files:**
- Modify: `server/src/schemas.ts`
- Create: `server/src/controllers/enrollmentController.ts`
- Modify: `server/src/routes/api.ts`
- Create: `server/tests/enrollmentApi.test.ts`
- Modify: `server/src/controllers/studentController.ts`
- Modify: `server/src/controllers/batchController.ts`

**Interfaces:**
- Produces: `GET /batches/:batchId/enrollment-candidates?q=`.
- Produces: `POST /batches/:batchId/enrollments/preview`.
- Produces: `POST /batches/:batchId/enrollments`.
- Produces: `DELETE /batches/:batchId/enrollments/:enrollmentId`.
- Produces: `GET /students/:studentId/deletion-eligibility` and `DELETE /students/:studentId/permanent`.

- [ ] **Step 1: Write failing API contract tests**

```ts
test('teacher re-enroll endpoint requires idempotency and fee choice', async () => {
  const response = await request(app).post('/api/batches/b1/enrollments').set(auth).send({ studentId: 's1' });
  assert.equal(response.status, 400);
});

test('remove endpoint requires a reason and scopes enrollment to route batch', async () => {
  const response = await request(app).delete('/api/batches/b1/enrollments/e1').set(auth).send({ reason: '' });
  assert.equal(response.status, 400);
});
```

- [ ] **Step 2: Run and verify missing route/schema failures**

Run: `cd server && JWT_SECRET=test-secret NODE_ENV=test npx tsx --test tests/enrollmentApi.test.ts`

Expected: FAIL with 404 or missing schema behavior.

- [ ] **Step 3: Add Zod schemas and thin controllers**

The create body is `{studentId,startedAt,fee,idempotencyKey}`; end body is `{endedAt?,reason,idempotencyKey}`; preview body is `{studentId,startedAt,fee}`. Controllers must take `instituteId` and `actorId` only from authenticated context, never from the body, and translate typed outcomes without reimplementing service logic.

- [ ] **Step 4: Retire legacy manual-add/archive behavior behind adapters**

Make old controller entry points call the new service or return a migration-safe deprecation response; do not leave a path that directly creates a second `Student` for an explicitly selected existing ID. Change `getBatchDetails` to list active enrollments with nested permanent students.

- [ ] **Step 5: Run API and controller regressions and commit**

Run: `cd server && JWT_SECRET=test-secret NODE_ENV=test npx tsx --test tests/enrollmentApi.test.ts tests/api.integration.test.ts tests/controller-success.test.ts tests/monthCoverageApi.test.ts`

Expected: PASS.

```bash
git add server/src/schemas.ts server/src/controllers/enrollmentController.ts server/src/routes/api.ts server/tests/enrollmentApi.test.ts server/src/controllers/studentController.ts server/src/controllers/batchController.ts
git commit -m "feat: expose batch enrollment APIs"
```

---

### Task 7: Add identity-review registration and signed fee choices

**Files:**
- Modify: `server/prisma/schema.prisma`
- Create: `server/prisma/migrations/20260827113000_secure_enrollment_invite_intent/migration.sql`
- Create: `server/src/services/identityReviewService.ts`
- Create: `server/src/controllers/identityReviewController.ts`
- Create: `server/tests/identityReviewService.test.ts`
- Modify: `server/src/controllers/studentController.ts`
- Modify: `server/src/controllers/inviteController.ts`
- Modify: `server/src/controllers/statusController.ts`
- Modify: `server/src/routes/api.ts`
- Modify: `server/src/schemas.ts`

**Interfaces:**
- Produces: `createIdentityReview`, `resolveIdentityReviewWithStudent`, and `resolveIdentityReviewAsNew`.
- Produces: `registerPublicStudent(submission): Promise<PublicRegistrationResult>`.
- Produces: `GET /identity-reviews` and `POST /identity-reviews/:id/resolve`.
- Produces: public registration outcome `202 {code:'IDENTITY_REVIEW_REQUIRED',reviewId}` for credible matches.

- [ ] **Step 1: Write failing public registration tests**

```ts
test('public registration with a credible match does not create a student', async () => {
  const result = await registerPublicStudent({
    batchId: 'b1', name: 'Riya', parentName: 'Asha', parentWhatsapp: '9876543210',
    parentEmail: null, schoolName: null, additionalData: {}, token: null,
  });
  assert.equal(result.code, 'IDENTITY_REVIEW_REQUIRED');
  assert.equal(db.student.created.length, 0);
});

test('teacher may resolve review to existing profile without student approval', async () => {
  const result = await resolveIdentityReviewWithStudent({
    reviewId: 'r1', studentId: 's1', actorId: 'a1',
    fee: { mode: 'CURRENT_DUE_BASED', installmentIds: [] }, idempotencyKey: 'k1',
  });
  assert.equal(result.outcome, 'REENROLLED');
});
```

- [ ] **Step 2: Run and observe automatic-create failure**

Run: `cd server && JWT_SECRET=test-secret NODE_ENV=test npx tsx --test tests/identityReviewService.test.ts`

Expected: FAIL because current registration creates directly and no review service exists.

- [ ] **Step 3: Implement deterministic review creation/resolution**

Candidate detection uses Task 3 match reasons. A credible candidate creates one pending review holding submitted fields and candidate IDs; resolution is tenant-scoped and idempotent. `USE_EXISTING` invokes `enrollExistingStudent`; `CREATE_NEW` creates one permanent student and enrollment transactionally.

- [ ] **Step 4: Carry fee choice in secure invitations**

Persist the teacher choice in `InviteToken.enrollmentIntent` and sign invitation claims `{instituteId,batchId,fee,issuedById,nonce,expiresAt}`. The migration adds the column with `ADD COLUMN IF NOT EXISTS`, so either Task 1 or this task may deploy it first during a mixed rollout. Validation must reject batch/institute mismatch, expired claims, nonce/token mismatch, unsupported installment IDs, or a fee month outside batch bounds. Do not send a registration link on `USE_EXISTING`.

- [ ] **Step 5: Run registration regressions and commit**

Run: `cd server && JWT_SECRET=test-secret NODE_ENV=test npx tsx --test tests/identityReviewService.test.ts tests/enrollmentApi.test.ts tests/schemas.test.ts`

Expected: PASS.

```bash
git add server/prisma/schema.prisma server/prisma/migrations/20260827113000_secure_enrollment_invite_intent/migration.sql server/src/services/identityReviewService.ts server/src/controllers/identityReviewController.ts server/tests/identityReviewService.test.ts server/src/controllers/studentController.ts server/src/controllers/inviteController.ts server/src/controllers/statusController.ts server/src/routes/api.ts server/src/schemas.ts
git commit -m "feat: review duplicate student registrations"
```

---

### Task 8: Add deduplicated lifecycle WhatsApp notifications

**Files:**
- Create: `server/src/services/enrollmentNotificationService.ts`
- Create: `server/tests/enrollmentNotificationService.test.ts`
- Modify: `server/src/utils/whatsapp.ts`
- Modify: `server/src/services/enrollmentService.ts`
- Modify: `server/src/controllers/enrollmentController.ts`
- Modify: `server/src/routes/api.ts`

**Interfaces:**
- Produces: `enqueueEnrollmentNotification(event): Promise<NotificationResult>` and `retryEnrollmentNotification(eventKey): Promise<NotificationResult>`.
- Produces: `resendEnrollmentNotification({enrollmentId,idempotencyKey}): Promise<NotificationResult>` for an explicit teacher resend.
- Produces: `POST /enrollments/:enrollmentId/notification/retry` and `POST /enrollments/:enrollmentId/notification/resend`.
- Consumes: `WhatsappJob.eventKey` unique field from Task 1.

- [ ] **Step 1: Write failing notification tests**

```ts
test('retry enqueues exactly one lifecycle message', async () => {
  await enqueueEnrollmentNotification(readdedEvent);
  await enqueueEnrollmentNotification(readdedEvent);
  assert.equal(db.whatsappJob.rows.filter(row => row.eventKey === 'enrollment:e2:READDED').length, 1);
});

test('queue failure does not change committed enrollment result', async () => {
  const result = await controllerResultWithFailingQueue();
  assert.equal(result.body.outcome, 'REENROLLED');
  assert.equal(result.body.notification.status, 'FAILED_RETRYABLE');
});

test('explicit teacher resend has its own idempotent event key', async () => {
  await resendEnrollmentNotification({ enrollmentId: 'e2', idempotencyKey: 'teacher-resend-1' });
  await resendEnrollmentNotification({ enrollmentId: 'e2', idempotencyKey: 'teacher-resend-1' });
  assert.equal(db.whatsappJob.rows.filter(row => row.eventKey === 'enrollment:e2:RESEND:teacher-resend-1').length, 1);
});
```

- [ ] **Step 2: Run and verify missing service failures**

Run: `cd server && JWT_SECRET=test-secret NODE_ENV=test npx tsx --test tests/enrollmentNotificationService.test.ts`

Expected: FAIL because the lifecycle notifier does not exist.

- [ ] **Step 3: Add exact templates and post-commit enqueueing**

Add `WHATSAPP_TEMPLATE_BATCH_ADDED`, `WHATSAPP_TEMPLATE_BATCH_READDED`, and `WHATSAPP_TEMPLATE_BATCH_REMOVED`. Added/re-added values are student, batch, effective date, fee start summary, institute. Removed values are student, batch, effective date, reason, institute. Use event keys `enrollment:<id>:ADDED`, `:READDED`, and `:REMOVED`; on unique conflict return the existing job instead of failing. A retry requeues the failed job with the same key. An explicit teacher resend after an already-sent message uses `enrollment:<id>:RESEND:<idempotencyKey>` so a deliberate resend is possible without retry duplicates.

Call this service only after the enrollment transaction returns. Add authenticated tenant-scoped retry/resend handlers to `enrollmentController` and `routes/api.ts`. Expose `QUEUED`, `ALREADY_QUEUED`, or `FAILED_RETRYABLE` in the controller response.

- [ ] **Step 4: Run WhatsApp and lifecycle regressions and commit**

Run: `cd server && JWT_SECRET=test-secret NODE_ENV=test npx tsx --test tests/enrollmentNotificationService.test.ts tests/enrollmentService.test.ts tests/testResultsWhatsApp.test.ts`

Expected: PASS.

```bash
git add server/src/services/enrollmentNotificationService.ts server/tests/enrollmentNotificationService.test.ts server/src/utils/whatsapp.ts server/src/services/enrollmentService.ts server/src/controllers/enrollmentController.ts server/src/routes/api.ts
git commit -m "feat: notify enrollment lifecycle changes"
```

---

### Task 9: Switch every server batch-membership read to enrollments

**Files:**
- Modify: `server/src/controllers/dashboardController.ts`
- Modify: `server/src/controllers/feeController.ts`
- Modify: `server/src/controllers/publicController.ts`
- Modify: `server/src/controllers/studentPortalController.ts`
- Modify: `server/src/controllers/testController.ts`
- Modify: `server/src/services/batchExportService.ts`
- Modify: `server/src/services/monthCoverageSummaryService.ts`
- Modify: `server/src/services/monthCoverageReportService.ts`
- Modify: `server/src/utils/feeCalculations.ts`
- Modify: `server/src/utils/quizBroadcasts.ts`
- Create: `server/tests/enrollmentReadMigration.test.ts`
- Modify: affected controller/service tests.

**Interfaces:**
- Consumes: `Enrollment` membership and query helpers.
- Produces: no runtime decision based on `Student.batchId`, `Student.status`, `leftAt`, or `leaveReason`.

- [ ] **Step 1: Add a failing source contract for membership reads**

```ts
// server/tests/enrollmentReadMigration.test.ts
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const migratedFiles = [
  'src/controllers/dashboardController.ts', 'src/controllers/feeController.ts',
  'src/controllers/publicController.ts', 'src/controllers/studentPortalController.ts',
  'src/controllers/testController.ts', 'src/services/batchExportService.ts',
  'src/services/monthCoverageSummaryService.ts', 'src/services/monthCoverageReportService.ts',
];

test('batch membership reads use Enrollment rather than Student.batchId', () => {
  const source = migratedFiles.map(file => readFileSync(path.join(process.cwd(), file), 'utf8')).join('\n');
  assert.doesNotMatch(source, /student\.batchId|s\."batchId"|s\.batchId/);
});
```

- [ ] **Step 2: Run and verify current legacy-query matches**

Run: `cd server && JWT_SECRET=test-secret NODE_ENV=test npx tsx --test tests/enrollmentReadMigration.test.ts`

Expected: FAIL with legacy membership matches.

- [ ] **Step 3: Replace batch-scoped reads subsystem by subsystem**

Use `Enrollment.status='ACTIVE'` joins for batch lists, dashboards, outstanding global installments, tests, quizzes, broadcasts, exports, public fees, and portal eligibility. A student-specific installment remains visible by `studentId`; a batch-global installment is visible only through an active enrollment in that installment's batch. Marks and payments remain attached to permanent `studentId`.

- [ ] **Step 4: Add multi-batch regression fixtures**

For every affected subsystem, include one student active in `b1` and `b2`, another ended in `b1`, and a same-phone sibling. Assert the active student appears once in each active batch, the ended membership does not grant future batch content, and histories remain available through permanent identity.

- [ ] **Step 5: Run focused server suites and commit**

Run: `cd server && JWT_SECRET=test-secret NODE_ENV=test npx tsx --test tests/enrollmentReadMigration.test.ts tests/classAverage.test.ts tests/customInvoice.test.ts tests/feeSecurity.test.ts tests/quiz.test.ts tests/batchExport.test.ts tests/monthCoverageSummaryService.test.ts`

Expected: PASS.

```bash
git add server/src/controllers/dashboardController.ts server/src/controllers/feeController.ts server/src/controllers/publicController.ts server/src/controllers/studentPortalController.ts server/src/controllers/testController.ts server/src/services/batchExportService.ts server/src/services/monthCoverageSummaryService.ts server/src/services/monthCoverageReportService.ts server/src/utils/feeCalculations.ts server/src/utils/quizBroadcasts.ts server/tests/enrollmentReadMigration.test.ts server/tests
git commit -m "refactor: read batch membership from enrollments"
```

Before committing, inspect `git diff --cached --name-only` and unstage unrelated tests; `git add server/tests` is permitted only after that inspection.

---

### Task 10: Add teacher enrollment and identity-review UI

**Files:**
- Create: `client/src/features/enrollments/types.ts`
- Create: `client/src/features/enrollments/api.ts`
- Create: `client/src/features/enrollments/AddStudentFlow.tsx`
- Create: `client/src/features/enrollments/FeeApplicabilityStep.tsx`
- Create: `client/src/features/enrollments/EndEnrollmentDialog.tsx`
- Create: `client/src/features/enrollments/EnrollmentHistory.tsx`
- Create: `client/src/features/enrollments/IdentityReviewQueue.tsx`
- Create: corresponding `*.test.tsx` files.
- Modify: `client/src/pages/BatchDetails.tsx`
- Modify: `client/src/pages/StudentProfile.tsx`
- Modify: `client/src/pages/Approvals.tsx`

**Interfaces:**
- Consumes: APIs from Tasks 6-8.
- Produces: explicit `USE_EXISTING` versus `CREATE_NEW` teacher choices and scoped removal UI.

- [ ] **Step 1: Write failing Add Student interaction tests**

```tsx
it('never reuses a candidate until the teacher selects Use existing profile', async () => {
  render(<AddStudentFlow batchId="b1" />);
  await user.type(screen.getByRole('searchbox'), '9876543210');
  expect(await screen.findByText('MB-MTH26-049')).toBeVisible();
  expect(api.enrollExisting).not.toHaveBeenCalled();
  await user.click(screen.getByRole('button', { name: /use existing profile/i }));
  expect(await screen.findByText(/choose fee start/i)).toBeVisible();
});

it('shows Already enrolled and offers notification resend', async () => {
  api.enrollExisting.mockResolvedValue({ outcome: 'ALREADY_ENROLLED', enrollmentId: 'e1' });
  render(<AddStudentFlow batchId="b1" />);
  // select candidate and confirm
  expect(await screen.findByText(/already enrolled/i)).toBeVisible();
  expect(screen.getByRole('button', { name: /resend notification/i })).toBeVisible();
});
```

- [ ] **Step 2: Run and verify missing components**

Run: `cd client && npm run test:run -- src/features/enrollments`

Expected: FAIL because enrollment components do not exist.

- [ ] **Step 3: Implement API contracts and identity-first flow**

Show student ID, student/parent names, phone, current batches, previous batches, and balance. Require an explicit candidate action. For existing profile, show fee selection and preview, then call the enrollment endpoint. For new profile, select fees before requesting the registration link. Render saved enrollment and notification status independently.

- [ ] **Step 4: Implement scoped removal and history**

`EndEnrollmentDialog` must name the selected batch, require a reason, and say other batches remain active. `EnrollmentHistory` must render each period with start/end/status/reason. Permanent deletion is a separate typed-confirmation action rendered only when the server says `eligible:true`.

- [ ] **Step 5: Implement identity-review queue and page integration**

Show submitted fields beside candidates and provide only `Use this profile` and `Create separate student` resolutions. Integrate the focused components into existing pages without moving unrelated page behavior.

- [ ] **Step 6: Run client tests/build and commit**

Run: `cd client && npm run test:run -- src/features/enrollments src/pages/BatchDetails.monthCoverage.test.tsx`

Run: `cd client && npm run build`

Expected: all commands exit 0.

```bash
git add client/src/features/enrollments client/src/pages/BatchDetails.tsx client/src/pages/StudentProfile.tsx client/src/pages/Approvals.tsx
git commit -m "feat: add teacher enrollment workflow"
```

---

### Task 11: Add shared-phone student portal account selection

**Files:**
- Modify: `server/src/controllers/studentPortalController.ts`
- Modify: `server/src/routes/studentPortalRoutes.ts`
- Create: `server/tests/studentPortalAccountSelection.test.ts`
- Create: `client/src/features/student-portal/StudentAccountSelector.tsx`
- Create: `client/src/features/student-portal/StudentAccountSelector.test.tsx`
- Modify: `client/src/pages/StudentPortalLogin.tsx`
- Modify: `client/src/pages/StudentPortalDashboard.tsx`

**Interfaces:**
- Produces: OTP verify result `{selectionToken,students}` when several profiles share the phone.
- Produces: `POST /student-portal/select-account` accepting `{selectionToken,studentId}` and returning a student-specific token.

- [ ] **Step 1: Write failing server authorization tests**

```ts
test('OTP verification returns a selector for shared phone', async () => {
  const result = await verifyOtpForPhone('i1', '9876543210', '123456');
  assert.deepEqual(result.students.map(s => s.id), ['s1', 's2']);
  assert.equal('token' in result, false);
});

test('selection token cannot choose another institute or phone account', async () => {
  const verified = await verifyOtpForPhone('i1', '9876543210', '123456');
  assert.equal('selectionToken' in verified, true);
  await assert.rejects(selectAccount(verified.selectionToken!, 'foreign-s3'), /ACCOUNT_NOT_ALLOWED/);
});
```

- [ ] **Step 2: Run and verify current `findFirst` behavior fails the contract**

Run: `cd server && JWT_SECRET=test-secret NODE_ENV=test npx tsx --test tests/studentPortalAccountSelection.test.ts`

Expected: FAIL because OTP verification currently chooses one `findFirst` student.

- [ ] **Step 3: Implement short-lived selection tokens**

Sign `{purpose:'STUDENT_ACCOUNT_SELECTION',instituteId,normalizedPhone,studentIds,exp}` for five minutes. With one match, issue the normal student token. With several, return only safe selector fields: `id`, `humanId`, `name`, and active batch names. The selection endpoint verifies purpose, expiry, institute, and membership in `studentIds` before issuing the student token.

- [ ] **Step 4: Write and implement the client selector test**

```tsx
it('stores a student token only after account selection', async () => {
  render(<StudentPortalLogin />);
  // complete shared-phone OTP
  expect(await screen.findByRole('heading', { name: /choose student/i })).toBeVisible();
  expect(localStorage.getItem('student_token_demo')).toBeNull();
  await user.click(screen.getByRole('button', { name: /riya.*class 10 boys/i }));
  expect(localStorage.getItem('student_token_demo')).toBe('student-specific-token');
});
```

Render `StudentAccountSelector` after OTP when needed; save/navigate only after the selection response returns a student token.

- [ ] **Step 5: Run portal regressions and commit**

Run: `cd server && JWT_SECRET=test-secret NODE_ENV=test npx tsx --test tests/studentPortalAccountSelection.test.ts tests/quiz.test.ts`

Run: `cd client && npm run test:run -- src/features/student-portal/StudentAccountSelector.test.tsx && npm run build`

Expected: all commands exit 0.

```bash
git add server/src/controllers/studentPortalController.ts server/src/routes/studentPortalRoutes.ts server/tests/studentPortalAccountSelection.test.ts client/src/features/student-portal client/src/pages/StudentPortalLogin.tsx client/src/pages/StudentPortalDashboard.tsx
git commit -m "fix: select shared-phone student accounts safely"
```

---

### Task 12: Complete switch verification and gated legacy contract

**Files:**
- Create: `server/scripts/auditEnrollmentCutover.ts`
- Create: `server/tests/enrollmentCutoverAudit.test.ts`
- Create after production acceptance: `server/prisma/migrations/20260827120000_contract_legacy_student_membership/migration.sql`
- Modify after production acceptance: `server/prisma/schema.prisma`
- Modify: remaining affected client/server regression fixtures.

**Interfaces:**
- Produces: machine-readable cutover counts and blockers.
- Produces after acceptance: a schema without `Student.batchId`, `status`, `leftAt`, `leaveReason`, or the old natural key.

- [ ] **Step 1: Write the failing cutover audit test**

```ts
test('cutover audit blocks on unresolved or inconsistent enrollment data', async () => {
  const report = await auditEnrollmentCutover(db);
  assert.deepEqual(report.blockers, [
    { code: 'UNRESOLVED_IDENTITY_REVIEW', count: 1 },
    { code: 'UNLINKED_MONTH_COVERAGE_ROW', count: 1 },
  ]);
  assert.equal(report.ready, false);
});
```

- [ ] **Step 2: Implement exact cutover checks**

Report current approved students, legacy pending students, active enrollments, duplicate active memberships, cross-tenant rows, unlinked fee rows, pending reconciliation entries, unresolved identity reviews, and lifecycle notification failures. Set `ready:true` only when all structural blocker counts—including legacy pending students—are zero; notification failures remain operational warnings, not data blockers.

- [ ] **Step 3: Run the full pre-contract verification**

Run: `cd server && JWT_SECRET=test-secret NODE_ENV=test npm test && npx prisma validate && npm run build`

Run: `cd client && npm run test:run && npm run build`

Run: `cd server && npx tsx scripts/auditEnrollmentCutover.ts --json`

Expected: tests/builds exit 0 and the audit prints `"ready":true` with zero structural blockers. Do not proceed to Step 4 if it does not.

- [ ] **Step 4: Require explicit production acceptance before contract**

Deploy the expanded/switched release, run the audit against production, and record a release decision only when it reports `ready:true` and the agreed monitoring window has no unresolved membership invariant. This is a human release gate; stopping here leaves a supported additive schema.

- [ ] **Step 5: Add the contract migration after the gate**

The migration must rerun the structural blockers in a `DO $$` block and raise `ENROLLMENT_CUTOVER_NOT_READY` on any mismatch. Then drop the old `student_natural_key`, remove `Student.batchId`, `status`, `leftAt`, and `leaveReason`, and remove their indexes and foreign key. Update Prisma relations so batch membership exists only through `Enrollment`.

- [ ] **Step 6: Rerun absence, schema, full test, and build checks**

Run: `cd server && JWT_SECRET=test-secret NODE_ENV=test npx tsx --test tests/enrollmentReadMigration.test.ts tests/enrollmentCutoverAudit.test.ts && npx prisma validate && npx prisma generate && npm test && npm run build`

Run: `cd client && npm run test:run && npm run build`

Expected: all commands exit 0; the source contract finds no legacy membership reads.

- [ ] **Step 7: Commit audit and contract separately**

```bash
git add server/scripts/auditEnrollmentCutover.ts server/tests/enrollmentCutoverAudit.test.ts
git commit -m "chore: audit enrollment cutover readiness"

git add server/prisma/schema.prisma server/prisma/migrations/20260827120000_contract_legacy_student_membership/migration.sql
git commit -m "refactor: remove legacy student membership fields"
```

The second commit is created only after Step 4's explicit production gate.
