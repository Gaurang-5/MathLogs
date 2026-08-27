# Attendance Subsystem Removal Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove the unused attendance subsystem without losing data or leaving runtime, schema, UI, configuration, or product-copy references behind.

**Architecture:** First prove a forward-only PostgreSQL migration aborts when either attendance table contains data and succeeds only when both are empty. Then remove Prisma relations, unused utilities and WhatsApp helpers, profile/archive behavior, client types, tests, configuration, and public copy before running repository-wide absence checks.

**Tech Stack:** PostgreSQL, Prisma 5.22, Express 5, TypeScript 5.9, Node test runner, React 19, Vitest 3.

**Spec:** `docs/superpowers/specs/2026-08-27-student-enrollment-lifecycle-and-attendance-removal-design.md`

## Global Constraints

- Production inspection on 2026-08-27 found zero `AttendanceRecord` rows and zero `AttendanceSweepRun` rows; the migration must verify this again at execution time.
- Abort before dropping anything if either table contains a row.
- Add a new forward migration; do not edit any previously applied migration.
- Attendance is not replaced by another feature.
- Removing a student must no longer use attendance as an activity/history signal.
- Preserve unrelated uncommitted work and stage only the files named by each task.
- Follow TDD: observe each focused test fail, add the smallest implementation, rerun it, then run the relevant regression suite.

---

## File Structure and Responsibilities

### Files to create

- `server/prisma/migrations/20260827090000_remove_attendance_subsystem/migration.sql` — guarded forward-only destructive migration.
- `server/tests/attendanceRemovalMigration.test.ts` — executes the migration against empty and non-empty isolated PostgreSQL schemas.
- `server/tests/attendanceRemovalStatic.test.ts` — prevents runtime/schema/product-copy attendance remnants from returning.

### Files to delete

- `server/src/utils/attendanceLinks.ts` — unused signed attendance-photo URLs.
- `docs/plans/attendance-system.md` — obsolete implementation plan for a feature no longer in the product.

### Files to modify

- `server/prisma/schema.prisma` — remove attendance models, enum, and relations.
- `server/src/utils/whatsapp.ts` — remove attendance data types and send helpers.
- `server/src/controllers/studentController.ts` — remove attendance activity checks, profile records, and statistics.
- `server/remove-requested-students.ts`, `server/scripts/remove_students.ts` — remove attendance-dependent deletion checks.
- `server/src/index.ts`, `README.md`, `client/index.html` — remove product and SEO attendance claims.
- `client/src/components/StudentProfileDrawer.tsx`, `client/src/pages/StudentProfile.tsx`, `client/src/pages/BatchDetails.tsx` — remove attendance contracts/copy.
- `client/src/pages/AboutUs.tsx`, `client/src/pages/Home.tsx`, `client/src/pages/MarketplaceSettings.tsx`, `client/src/pages/Onboarding.tsx`, `client/src/pages/StudentPortalLogin.tsx`, `client/src/pages/TeacherRegistration.tsx` — remove attendance claims.
- `server/tests/monthCoverageApi.test.ts`, `server/tests/monthCoverageLifecycle.test.ts`, `client/src/components/StudentProfileDrawer.monthCoverage.test.tsx` — remove obsolete fixture fields/assertions.
- `docs/fee-coverage-teacher-questionnaire.md`, `docs/superpowers/specs/2026-08-22-month-coverage-teacher-workflow-design.md`, `docs/superpowers/plans/2026-08-15-superadmin-marketplace-operations.md`, `docs/superpowers/plans/2026-08-22-month-coverage-teacher-workflow.md` — correct live guidance that still treats attendance as a supported workflow.

---

### Task 1: Add and prove the guarded database migration

**Files:**
- Create: `server/tests/attendanceRemovalMigration.test.ts`
- Create: `server/prisma/migrations/20260827090000_remove_attendance_subsystem/migration.sql`

**Interfaces:**
- Produces: a migration that either removes both attendance tables and `AttendanceSource`, or changes nothing and raises `ATTENDANCE_DATA_PRESENT`.

- [ ] **Step 1: Write the failing migration tests**

```ts
// server/tests/attendanceRemovalMigration.test.ts
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { Client } from 'pg';
import 'dotenv/config';

const migrationPath = path.join(process.cwd(), 'prisma/migrations/20260827090000_remove_attendance_subsystem/migration.sql');

async function withSchema(run: (client: Client) => Promise<void>) {
  const name = `attendance_removal_${Date.now()}_${Math.random().toString(16).slice(2)}`;
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  try {
    await client.query(`CREATE SCHEMA "${name}"`);
    await client.query(`SET search_path TO "${name}"`);
    await client.query(`
      CREATE TYPE "AttendanceSource" AS ENUM ('KIOSK', 'MANUAL');
      CREATE TABLE "AttendanceRecord" (id TEXT PRIMARY KEY, source "AttendanceSource" NOT NULL);
      CREATE TABLE "AttendanceSweepRun" (id TEXT PRIMARY KEY);
    `);
    await run(client);
  } finally {
    await client.query(`DROP SCHEMA IF EXISTS "${name}" CASCADE`);
    await client.end();
  }
}

test('drops attendance schema only when both tables are empty', async () => {
  await withSchema(async client => {
    await client.query(await readFile(migrationPath, 'utf8'));
    const objects = await client.query(`
      SELECT to_regclass('"AttendanceRecord"') AS record,
             to_regclass('"AttendanceSweepRun"') AS sweep
    `);
    assert.deepEqual(objects.rows[0], { record: null, sweep: null });
  });
});

test('aborts without dropping either table when attendance data exists', async () => {
  await withSchema(async client => {
    await client.query(`INSERT INTO "AttendanceRecord" (id, source) VALUES ('a-1', 'KIOSK')`);
    await assert.rejects(
      client.query(await readFile(migrationPath, 'utf8')),
      /ATTENDANCE_DATA_PRESENT/,
    );
    const count = await client.query(`SELECT COUNT(*)::integer AS count FROM "AttendanceRecord"`);
    assert.equal(count.rows[0].count, 1);
    assert.notEqual((await client.query(`SELECT to_regclass('"AttendanceSweepRun"') AS name`)).rows[0].name, null);
  });
});
```

- [ ] **Step 2: Run the test and verify the missing migration failure**

Run: `cd server && JWT_SECRET=test-secret NODE_ENV=test npx tsx --test tests/attendanceRemovalMigration.test.ts`

Expected: FAIL with `ENOENT` for `20260827090000_remove_attendance_subsystem/migration.sql`.

- [ ] **Step 3: Add the guarded forward migration**

```sql
DO $$
BEGIN
  IF to_regclass('"AttendanceRecord"') IS NOT NULL
     AND EXISTS (SELECT 1 FROM "AttendanceRecord" LIMIT 1) THEN
    RAISE EXCEPTION 'ATTENDANCE_DATA_PRESENT: AttendanceRecord is not empty';
  END IF;
  IF to_regclass('"AttendanceSweepRun"') IS NOT NULL
     AND EXISTS (SELECT 1 FROM "AttendanceSweepRun" LIMIT 1) THEN
    RAISE EXCEPTION 'ATTENDANCE_DATA_PRESENT: AttendanceSweepRun is not empty';
  END IF;
END $$;

DROP TABLE IF EXISTS "AttendanceRecord";
DROP TABLE IF EXISTS "AttendanceSweepRun";
DROP TYPE IF EXISTS "AttendanceSource";
```

- [ ] **Step 4: Run the focused migration test**

Run: `cd server && JWT_SECRET=test-secret NODE_ENV=test npx tsx --test tests/attendanceRemovalMigration.test.ts`

Expected: PASS, 2 tests.

- [ ] **Step 5: Commit the migration contract**

```bash
git add server/tests/attendanceRemovalMigration.test.ts server/prisma/migrations/20260827090000_remove_attendance_subsystem/migration.sql
git commit -m "test: guard attendance data removal"
```

---

### Task 2: Remove attendance from Prisma and server runtime

**Files:**
- Modify: `server/prisma/schema.prisma`
- Modify: `server/src/controllers/studentController.ts`
- Modify: `server/src/utils/whatsapp.ts`
- Delete: `server/src/utils/attendanceLinks.ts`
- Modify: `server/remove-requested-students.ts`
- Modify: `server/scripts/remove_students.ts`
- Modify: `server/tests/monthCoverageApi.test.ts`
- Modify: `server/tests/monthCoverageLifecycle.test.ts`
- Create: `server/tests/attendanceRemovalStatic.test.ts`

**Interfaces:**
- Produces: student profile responses with no `attendanceRecords` or `attendancePercentage`.
- Produces: deletion/activity checks based on academic and financial history only.

- [ ] **Step 1: Add a failing server absence contract**

```ts
// server/tests/attendanceRemovalStatic.test.ts
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const files = [
  'prisma/schema.prisma',
  'src/controllers/studentController.ts',
  'src/utils/whatsapp.ts',
  'remove-requested-students.ts',
  'scripts/remove_students.ts',
];

test('server runtime and current Prisma schema contain no attendance subsystem', () => {
  const text = files.map(file => readFileSync(path.join(root, file), 'utf8')).join('\n');
  assert.doesNotMatch(text, /AttendanceRecord|AttendanceSweepRun|AttendanceSource|attendanceRecords|attendancePercentage|sendAttendance/i);
});
```

- [ ] **Step 2: Run the test and verify it identifies current remnants**

Run: `cd server && JWT_SECRET=test-secret NODE_ENV=test npx tsx --test tests/attendanceRemovalStatic.test.ts`

Expected: FAIL because the current schema, controller, and WhatsApp utility still contain attendance symbols.

- [ ] **Step 3: Remove schema and runtime references**

Delete the two models and `AttendanceSource`; remove relation fields from `Institute`, `Admin`, `Batch`, and `Student`. Delete `attendanceLinks.ts`. Remove `AttendanceCheckInWAData`, `AttendanceAbsentWAData`, `sendAttendanceCheckInWhatsApp`, and `sendAttendanceAbsentWhatsApp`. In `archiveStudent` and both cleanup scripts, calculate history without attendance. In `getStudentProfile`, remove the attendance include, calculation, and response fields.

The remaining archive history test must use this exact shape:

```ts
const hasDurableHistory =
  student.fees.length > 0 ||
  student.feePayments.length > 0 ||
  student.marks.length > 0 ||
  student.quizSubmissions.length > 0;
```

- [ ] **Step 4: Remove obsolete fixture properties and run focused tests**

Run: `cd server && JWT_SECRET=test-secret NODE_ENV=test npx tsx --test tests/attendanceRemovalStatic.test.ts tests/monthCoverageApi.test.ts tests/monthCoverageLifecycle.test.ts`

Expected: PASS.

- [ ] **Step 5: Validate and regenerate Prisma types**

Run: `cd server && npx prisma validate && npx prisma generate && npm run build`

Expected: all commands exit 0 and generated types contain no attendance models.

- [ ] **Step 6: Commit server removal**

```bash
git add server/prisma/schema.prisma server/src/controllers/studentController.ts server/src/utils/whatsapp.ts server/remove-requested-students.ts server/scripts/remove_students.ts server/tests/monthCoverageApi.test.ts server/tests/monthCoverageLifecycle.test.ts server/tests/attendanceRemovalStatic.test.ts
git add -u server/src/utils/attendanceLinks.ts
git commit -m "refactor: remove attendance server subsystem"
```

---

### Task 3: Remove attendance UI contracts and product claims

**Files:**
- Modify: `client/src/components/StudentProfileDrawer.tsx`
- Modify: `client/src/components/StudentProfileDrawer.monthCoverage.test.tsx`
- Modify: `client/src/pages/StudentProfile.tsx`
- Modify: `client/src/pages/BatchDetails.tsx`
- Modify: `client/src/pages/AboutUs.tsx`
- Modify: `client/src/pages/Home.tsx`
- Modify: `client/src/pages/MarketplaceSettings.tsx`
- Modify: `client/src/pages/Onboarding.tsx`
- Modify: `client/src/pages/StudentPortalLogin.tsx`
- Modify: `client/src/pages/TeacherRegistration.tsx`
- Modify: `client/index.html`
- Modify: `server/src/index.ts`
- Modify: `README.md`
- Modify: `docs/fee-coverage-teacher-questionnaire.md`
- Modify: `docs/superpowers/specs/2026-08-22-month-coverage-teacher-workflow-design.md`
- Modify: `docs/superpowers/plans/2026-08-15-superadmin-marketplace-operations.md`
- Modify: `docs/superpowers/plans/2026-08-22-month-coverage-teacher-workflow.md`
- Delete: `docs/plans/attendance-system.md`

**Interfaces:**
- Produces: profile UI contracts aligned with the server response from Task 2.
- Produces: public and operational copy that makes no attendance feature claim.

- [ ] **Step 1: Extend the static test with explicit client and copy files**

```ts
const productFiles = [
  '../client/index.html', '../client/src/pages/AboutUs.tsx', '../client/src/pages/Home.tsx',
  '../client/src/pages/MarketplaceSettings.tsx', '../client/src/pages/Onboarding.tsx',
  '../client/src/pages/StudentPortalLogin.tsx', '../client/src/pages/TeacherRegistration.tsx',
  '../client/src/pages/StudentProfile.tsx', '../client/src/components/StudentProfileDrawer.tsx',
  '../README.md', 'src/index.ts',
];

test('client contracts and product copy make no attendance claim', () => {
  const text = productFiles.map(file => readFileSync(path.join(root, file), 'utf8')).join('\n');
  assert.doesNotMatch(text, /attendance/i);
});
```

- [ ] **Step 2: Run the absence test and verify it fails on public copy and UI types**

Run: `cd server && JWT_SECRET=test-secret NODE_ENV=test npx tsx --test tests/attendanceRemovalStatic.test.ts`

Expected: FAIL with one or more attendance matches.

- [ ] **Step 3: Remove the UI data contract and replace copy accurately**

Remove `attendancePercentage`, `attendanceRecords`, and any attendance rendering. Change the batch removal explanation to: `Academic and financial history is preserved. Empty mistaken profiles can be permanently deleted separately.` Replace marketing lists with supported features such as `student records, fees, tests, online quizzes, and parent communication`. Delete the obsolete attendance plan and remove live guidance that instructs engineers to support attendance messages.

- [ ] **Step 4: Run client and absence regressions**

Run: `cd client && npm run test:run -- src/components/StudentProfileDrawer.monthCoverage.test.tsx`

Run: `cd server && JWT_SECRET=test-secret NODE_ENV=test npx tsx --test tests/attendanceRemovalStatic.test.ts`

Run: `cd client && npm run build`

Expected: all commands exit 0.

- [ ] **Step 5: Commit UI and copy removal**

```bash
git add client/src/components/StudentProfileDrawer.tsx client/src/components/StudentProfileDrawer.monthCoverage.test.tsx client/src/pages/StudentProfile.tsx client/src/pages/BatchDetails.tsx client/src/pages/AboutUs.tsx client/src/pages/Home.tsx client/src/pages/MarketplaceSettings.tsx client/src/pages/Onboarding.tsx client/src/pages/StudentPortalLogin.tsx client/src/pages/TeacherRegistration.tsx client/index.html server/src/index.ts README.md docs/fee-coverage-teacher-questionnaire.md docs/superpowers/specs/2026-08-22-month-coverage-teacher-workflow-design.md docs/superpowers/plans/2026-08-15-superadmin-marketplace-operations.md docs/superpowers/plans/2026-08-22-month-coverage-teacher-workflow.md
git add -u docs/plans/attendance-system.md
git commit -m "docs: remove attendance product claims"
```

---

### Task 4: Verify the complete removal

**Files:**
- Verify only; modify a failing owner file if a check exposes a missed runtime or product reference.

**Interfaces:**
- Consumes: guarded migration and absence contract from Tasks 1-3.
- Produces: evidence that the removal is safe and complete.

- [ ] **Step 1: Run both migration safety cases and all server tests**

Run: `cd server && JWT_SECRET=test-secret NODE_ENV=test npm test`

Expected: exit 0 with no failed Node tests.

- [ ] **Step 2: Run Prisma and build verification**

Run: `cd server && npx prisma validate && npx prisma generate && npm run build`

Run: `cd client && npm run test:run && npm run build`

Expected: all commands exit 0.

- [ ] **Step 3: Run a repository absence scan with deliberate exclusions**

Run:

```bash
rg -n -i 'attendance|AttendanceRecord|AttendanceSweepRun|AttendanceSource' . \
  --glob '!node_modules/**' --glob '!.worktrees/**' --glob '!server/prisma/migrations/**' \
  --glob '!docs/superpowers/specs/2026-08-27-student-enrollment-lifecycle-and-attendance-removal-design.md' \
  --glob '!docs/superpowers/plans/2026-08-27-attendance-subsystem-removal.md' \
  --glob '!server/tests/attendanceRemovalMigration.test.ts' \
  --glob '!server/tests/attendanceRemovalStatic.test.ts'
```

Expected: no output and exit 1 from `rg` because no unexcluded matches exist.

- [ ] **Step 4: Check migration scope and working tree**

Run: `git diff --check && git status --short`

Expected: no whitespace errors; only intentional task changes are staged or committed, and unrelated pre-existing changes remain untouched.
