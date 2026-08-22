# Month-Coverage Teacher Workflow Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver a fast month-coverage teacher workflow with automatic fee profiles, a compact Quick Fee form, configuration-driven student profiles, additional WhatsApp alert recipients, corrected fee-history ownership and void UI, plus a populated demo tenant.

**Architecture:** Keep the legacy fee system untouched behind its existing guards. Add focused month-coverage UI components and server services: automatic profile activation owns fee-start defaults, Quick Fee delegates chronological allocation to the existing preview/create services, profile field mapping is configuration-driven, and a centralized recipient resolver fans out student-scoped WhatsApp sends.

**Tech Stack:** React 19, TypeScript 5.9, TanStack Query, Vitest/jsdom, Express 5, Prisma 5/PostgreSQL, Node test runner, Tailwind CSS 4.

**Spec:** `docs/superpowers/specs/2026-08-22-month-coverage-teacher-workflow-design.md`

## Global Constraints

- Do not change current due-based fee behavior or parent fee surfaces.
- The central rupee action uses the compact flow only for `MONTH_COVERAGE` institutes.
- Quick Fee uses today, `CASH`, no note, and the oldest uncovered applicable month.
- Automatic fee start is the later of batch start month and student joining month.
- Primary parent WhatsApp always remains a recipient; configured additional numbers are normalized and deduplicated.
- Never send WhatsApp messages while seeding the demo institute.
- Use `9557940807` for the demo institute login and every dummy WhatsApp value.
- Preserve unrelated staged, unstaged, and untracked workspace changes.
- Do not push to GitHub.

---

### Task 1: Automatically activate month-coverage student profiles

**Files:**
- Modify: `server/src/services/studentMonthCoverageService.ts`
- Modify: `server/src/controllers/studentController.ts`
- Modify: `server/src/schemas.ts`
- Modify: `client/src/pages/Approvals.tsx`
- Modify: `client/src/pages/BatchDetails.tsx`
- Test: `server/tests/studentMonthCoverageService.test.ts`
- Test: `server/tests/monthCoverageLifecycle.test.ts`

**Interfaces:**
- Produces: `activateStudentFeeProfileAutomatically(input, deps)` returning `{ profile, warning }`.
- Consumes: existing `confirmStudentFeeProfile`, calendar month comparison, and transaction-scoped `studentMonthCoverageDepsFor(tx)`.
- Behavior: direct add and approval no longer accept or require a routine `feeStartMonth`; repair/edit endpoint remains explicit.

- [ ] **Step 1: Add failing service tests for automatic defaults**

Add literal pre-start and mid-batch cases:

```ts
test('automatic activation starts a pre-batch student at the batch start month', async () => {
  const result = await activateStudentFeeProfileAutomatically({
    instituteId: 'inst-1', studentId: 'student-1', actorId: 'admin-1',
  }, depsFor({ batchStart: '2026-06-01', batchEnd: '2027-03-31', joinedAt: '2026-05-20' }));
  assert.equal(result.profile.feeStartMonth, '2026-06');
  assert.equal(result.profile.feeEndMonth, '2027-03');
});

test('automatic activation starts a mid-batch student at the joining month', async () => {
  const result = await activateStudentFeeProfileAutomatically({
    instituteId: 'inst-1', studentId: 'student-1', actorId: 'admin-1',
  }, depsFor({ batchStart: '2026-06-01', batchEnd: '2027-03-31', joinedAt: '2026-08-18' }));
  assert.equal(result.profile.feeStartMonth, '2026-08');
});
```

- [ ] **Step 2: Run the focused tests and verify RED**

Run:

```bash
cd server
JWT_SECRET=test-secret NODE_ENV=test npx tsx --test tests/studentMonthCoverageService.test.ts tests/monthCoverageLifecycle.test.ts
```

Expected: fail because `activateStudentFeeProfileAutomatically` does not exist and controllers still require teacher input.

- [ ] **Step 3: Implement the automatic activation service**

Add the exact public input and calculation:

```ts
export type ActivateStudentFeeProfileAutomaticallyInput = {
  instituteId: string;
  studentId: string;
  actorId: string;
};

export async function activateStudentFeeProfileAutomatically(
  input: ActivateStudentFeeProfileAutomaticallyInput,
  deps: StudentMonthCoverageDeps = prismaStudentMonthCoverageDeps,
) {
  const context = await loadValidatedStudent(input.instituteId, input.studentId, deps);
  const joinedMonth = currentMonthInTimezone(context.student.createdAt, context.timezone);
  const feeStartMonth = compareMonths(joinedMonth, context.batchStartMonth) < 0
    ? context.batchStartMonth
    : joinedMonth;
  return confirmStudentFeeProfile({ ...input, feeStartMonth }, deps);
}
```

Use it inside the existing Prisma transactions for manual add and approval. Remove `FEE_START_MONTH_REQUIRED` from those routine flows. Public self-registration may still create `PENDING_SETUP`; approval immediately activates it automatically.

- [ ] **Step 4: Remove routine fee-start prompts from teacher UI**

In `Approvals.tsx`, approval posts an empty body and never opens `StudentFeeStartDialog`. In `BatchDetails.tsx`, direct add omits `feeStartMonth`; retain the explicit profile repair/edit action for exceptional historical profiles.

- [ ] **Step 5: Run focused server and client tests and verify GREEN**

Run:

```bash
cd server
JWT_SECRET=test-secret NODE_ENV=test npx tsx --test tests/studentMonthCoverageService.test.ts tests/monthCoverageLifecycle.test.ts
cd ../client
npm run test:run -- src/features/month-coverage/StudentFeeStartDialog.test.tsx src/pages/BatchDetails.monthCoverage.test.tsx
```

Expected: all selected tests pass; update obsolete prompt assertions to assert automatic approval behavior, not removed source text.

- [ ] **Step 6: Commit only Task 1 files**

```bash
git add server/src/services/studentMonthCoverageService.ts server/src/controllers/studentController.ts server/src/schemas.ts server/tests/studentMonthCoverageService.test.ts server/tests/monthCoverageLifecycle.test.ts client/src/pages/Approvals.tsx client/src/pages/BatchDetails.tsx client/src/pages/BatchDetails.monthCoverage.test.tsx
git commit -m "feat: automate month coverage fee starts"
```

---

### Task 2: Build the compact month-coverage Quick Fee flow

**Files:**
- Create: `client/src/features/month-coverage/QuickMonthCoverageFeeForm.tsx`
- Create: `client/src/features/month-coverage/QuickMonthCoverageFeeForm.test.tsx`
- Modify: `client/src/components/QuickFeeModal.tsx`
- Modify: `client/src/components/QuickFeeModal.monthCoverage.test.tsx`
- Modify: `client/src/features/month-coverage/types.ts`
- Modify: `client/src/features/month-coverage/api.ts`

**Interfaces:**
- Consumes: `MonthCoverageStudentSummary`, `previewMonthCoveragePayment`, `createMonthCoveragePayment`, and `createPaymentAttemptId`.
- Produces: `QuickMonthCoverageFeeForm({ students, onClose, onSaved })`.
- Submission contract: `{ studentId, amount, paymentDate: today at 12:00Z, paymentMethod: 'CASH', duration, requestedStartMonth: null, allowGap: false }`.

- [ ] **Step 1: Write failing Quick Fee component tests**

Cover the user-visible contract:

```tsx
it('shows only search, amount, duration and chronological preview', async () => {
  renderQuickForm();
  expect(screen.getByPlaceholderText('Search student')).toBeVisible();
  expect(screen.getByLabelText('Amount received')).toBeVisible();
  expect(screen.getByLabelText('Fee duration')).toBeVisible();
  expect(screen.queryByText('Scan receipt')).toBeNull();
  expect(screen.queryByLabelText('Starting month')).toBeNull();
  expect(screen.queryByLabelText('Payment date')).toBeNull();
  expect(screen.queryByLabelText('Payment method')).toBeNull();
});

it('submits quarterly coverage from the oldest pending month using today and Cash', async () => {
  // select Aarav, enter 3000, choose QUARTERLY, save
  expect(previewInput).toEqual({
    studentId: 'student-1', duration: 'QUARTERLY', requestedStartMonth: null, allowGap: false,
  });
  expect(createInput).toMatchObject({
    studentId: 'student-1', amount: 3000, duration: 'QUARTERLY',
    requestedStartMonth: null, paymentMethod: 'CASH', allowGap: false,
  });
});
```

- [ ] **Step 2: Run the Quick Fee tests and verify RED**

Run:

```bash
cd client
npm run test:run -- src/features/month-coverage/QuickMonthCoverageFeeForm.test.tsx src/components/QuickFeeModal.monthCoverage.test.tsx
```

Expected: fail because the compact component does not exist and `QuickFeeModal` still opens the detailed dialog.

- [ ] **Step 3: Implement the compact form**

Use a single dropdown with exact values:

```tsx
<select aria-label="Fee duration" value={duration} onChange={event => setDuration(event.target.value as MonthCoverageDuration)}>
  <option value="MONTHLY">Monthly</option>
  <option value="QUARTERLY">Quarterly</option>
  <option value="HALF_YEARLY">Half-yearly</option>
  <option value="YEARLY">Yearly</option>
</select>
```

Preview with `requestedStartMonth: null`. Show the returned literal coverage range and remaining-month count read-only. Keep one stable idempotency key for the dialog instance. Disable save for missing student, non-positive amount, unavailable preview, or duration exceeding remaining months.

- [ ] **Step 4: Route the central rupee action to the compact form**

Replace the month-mode branch in `QuickFeeModal.tsx`; do not modify its current due-based branch. Search across all active, setup-complete month students and include name, human ID, parent phone, and batch name matching.

- [ ] **Step 5: Run focused tests and verify GREEN**

Run:

```bash
cd client
npm run test:run -- src/features/month-coverage/QuickMonthCoverageFeeForm.test.tsx src/components/QuickFeeModal.monthCoverage.test.tsx src/features/month-coverage/MonthCoveragePaymentDialog.test.tsx
```

Expected: compact Quick Fee tests pass and the detailed Fees-dashboard dialog tests remain unchanged.

- [ ] **Step 6: Commit only Task 2 files**

```bash
git add client/src/features/month-coverage/QuickMonthCoverageFeeForm.tsx client/src/features/month-coverage/QuickMonthCoverageFeeForm.test.tsx client/src/components/QuickFeeModal.tsx client/src/components/QuickFeeModal.monthCoverage.test.tsx client/src/features/month-coverage/types.ts client/src/features/month-coverage/api.ts
git commit -m "feat: simplify month coverage quick fee"
```

---

### Task 3: Make teacher student profiles configuration-driven

**Files:**
- Create: `client/src/features/student-profile/registrationFields.ts`
- Create: `client/src/features/student-profile/registrationFields.test.ts`
- Create: `client/src/features/student-profile/ConfiguredStudentFields.tsx`
- Modify: `server/src/controllers/studentController.ts`
- Modify: `client/src/components/StudentProfileDrawer.tsx`
- Modify: `client/src/pages/StudentProfile.tsx`
- Modify: `client/src/pages/BatchDetails.tsx`
- Test: `server/tests/monthCoverageApi.test.ts`
- Create: `client/src/components/StudentProfileDrawer.monthCoverage.test.tsx`

**Interfaces:**
- Produces: `RegistrationFieldDefinition` with `{ id, label, type, required, system?, sendAlerts? }`.
- Produces: `studentFieldValue(student, field): string` mapping system columns and `additionalData`.
- Profile API adds `additionalData`, `registrationFields`, `coachingFeeMode`, `monthCoverageProfile`, and `monthCoverageStats`.

- [ ] **Step 1: Write failing mapper and profile API tests**

Use hand-written field fixtures:

```ts
expect(studentFieldValue(student, { id: 'parentWhatsapp', label: 'Parent phone', type: 'tel', system: true })).toBe('9557940807');
expect(studentFieldValue(student, { id: 'emergencyPhone', label: 'Emergency phone', type: 'tel' })).toBe('9557940807');
expect(studentFieldValue(student, { id: 'newField', label: 'New field', type: 'text' })).toBe('');
```

The API test must assert a foreign-institute student remains forbidden and a month student returns month counts without legacy balance widgets being treated as its fee model.

- [ ] **Step 2: Run focused tests and verify RED**

Run:

```bash
cd server
JWT_SECRET=test-secret NODE_ENV=test npx tsx --test tests/monthCoverageApi.test.ts
cd ../client
npm run test:run -- src/features/student-profile/registrationFields.test.ts src/components/StudentProfileDrawer.monthCoverage.test.tsx
```

Expected: fail because configured fields and month profile data are absent from the response and components.

- [ ] **Step 3: Extend the profile response safely**

Select `additionalData`, batch dates, institute `config/coachingFeeMode/timezone`, month profile, and active allocations. Return a discriminated response:

```ts
type StudentProfileFeeView =
  | { mode: 'CURRENT_DUE_BASED'; balance: { totalFee: number; totalPaid: number; balance: number } | null }
  | { mode: 'MONTH_COVERAGE'; feeStartMonth: string | null; feeEndMonth: string | null; paidMonths: number; pendingMonths: number; overdueMonths: number };
```

Derive month counts using the existing calendar utilities and distinct active allocations. Do not query legacy fee history for the month-mode branch.

- [ ] **Step 4: Render and edit configured profile fields**

Use `ConfiguredStudentFields` in `StudentProfileDrawer`, `StudentProfile`, and Batch Details' edit form. Render current configured order and labels; missing newly added fields show `Not provided`. The edit form writes custom values into `additionalData` while system fields continue using their typed columns.

For month mode, replace Fee Balance with paid/pending/overdue month metrics and add an Edit Fee Start action that invokes the existing explicit confirmation endpoint.

- [ ] **Step 5: Run focused tests and verify GREEN**

Run the commands from Step 2. Expected: all focused profile tests pass.

- [ ] **Step 6: Commit only Task 3 files**

```bash
git add client/src/features/student-profile client/src/components/StudentProfileDrawer.tsx client/src/components/StudentProfileDrawer.monthCoverage.test.tsx client/src/pages/StudentProfile.tsx client/src/pages/BatchDetails.tsx server/src/controllers/studentController.ts server/tests/monthCoverageApi.test.ts
git commit -m "feat: show configured fields in student profiles"
```

---

### Task 4: Add alert-enabled phone fields and a central recipient resolver

**Files:**
- Modify: `client/src/pages/Settings.tsx`
- Create: `client/src/pages/Settings.registrationAlerts.test.tsx`
- Create: `server/src/services/studentAlertRecipientService.ts`
- Create: `server/tests/studentAlertRecipientService.test.ts`

**Interfaces:**
- Produces: `resolveStudentAlertRecipients(input): string[]`.
- Produces: `sendStudentAlert(input, sender): Promise<{ attempted: number; delivered: number; failed: number }>`.
- Consumes: institute `config.registrationForm.fields`, `Student.parentWhatsapp`, and `Student.additionalData`.

- [ ] **Step 1: Write failing resolver tests**

Cover normalization and configuration semantics:

```ts
assert.deepEqual(resolveStudentAlertRecipients({
  parentWhatsapp: '95579 40807',
  additionalData: { emergencyPhone: '+91 9557940807', secondGuardian: '9876543210', ignoredPhone: '9999999999' },
  registrationFields: [
    { id: 'emergencyPhone', type: 'tel', sendAlerts: true },
    { id: 'secondGuardian', type: 'tel', sendAlerts: true },
    { id: 'ignoredPhone', type: 'tel', sendAlerts: false },
  ],
}), ['9557940807', '9876543210']);
```

Also test blank/malformed values and that one sender rejection does not prevent the other recipient attempt.

- [ ] **Step 2: Write the failing Settings interaction test**

Add a custom `tel` field, check `Send alerts to this number`, save, and assert the outgoing config contains `sendAlerts: true`. Assert non-phone fields do not expose the checkbox.

- [ ] **Step 3: Run tests and verify RED**

Run:

```bash
cd server
JWT_SECRET=test-secret NODE_ENV=test npx tsx --test tests/studentAlertRecipientService.test.ts
cd ../client
npm run test:run -- src/pages/Settings.registrationAlerts.test.tsx
```

Expected: fail because `sendAlerts` and the resolver do not exist.

- [ ] **Step 4: Implement field configuration and recipient resolution**

Persist `sendAlerts` inside the existing JSON registration field definition; no database migration is required. Only show the checkbox when `field.type === 'tel'` or the form builder's phone-compatible type.

Implement:

```ts
export function resolveStudentAlertRecipients(input: AlertRecipientInput): string[];

export async function sendStudentAlert<T>(
  input: AlertRecipientInput,
  sender: (recipient: string) => Promise<T>,
): Promise<{ attempted: number; delivered: number; failed: number }>;
```

Normalize to the last ten Indian mobile digits accepted by existing WhatsApp helpers, preserve first-seen order, and use `Promise.allSettled` for independent delivery attempts.

- [ ] **Step 5: Run tests and verify GREEN**

Run the Step 3 commands. Expected: all resolver and Settings tests pass.

- [ ] **Step 6: Commit only Task 4 files**

```bash
git add client/src/pages/Settings.tsx client/src/pages/Settings.registrationAlerts.test.tsx server/src/services/studentAlertRecipientService.ts server/tests/studentAlertRecipientService.test.ts
git commit -m "feat: configure additional WhatsApp recipients"
```

---

### Task 5: Fan out every existing student-scoped WhatsApp pathway

**Files:**
- Modify: `server/src/controllers/studentController.ts`
- Modify: `server/src/controllers/batchController.ts`
- Modify: `server/src/controllers/feeController.ts`
- Modify: `server/src/controllers/testController.ts`
- Modify: `server/src/controllers/studentPortalController.ts`
- Modify: `server/src/utils/quizBroadcasts.ts`
- Create: `server/tests/studentAlertDeliveryIntegration.test.ts`

**Interfaces:**
- Consumes: `sendStudentAlert` from Task 4.
- Contract: sender callbacks remain the existing typed WhatsApp functions; auth OTPs and institute-owner setup messages are not student alerts and remain single-recipient.

- [ ] **Step 1: Write failing representative integration tests**

Test real controller/service boundaries with the WhatsApp transport stubbed below the resolver. Include at least:

- welcome invite;
- fee reminder and receipt;
- batch welcome/announcement;
- test marks and quiz schedule/results;
- student-portal test marks.

For each, provide primary `9557940807` and additional `9876543210`, then assert both enqueue attempts receive identical template data. Add a duplicate-number case expecting one attempt.

- [ ] **Step 2: Run the integration test and verify RED**

Run:

```bash
cd server
JWT_SECRET=test-secret NODE_ENV=test npx tsx --test tests/studentAlertDeliveryIntegration.test.ts
```

Expected: fail because existing paths read only `parentWhatsapp`.

- [ ] **Step 3: Expand Prisma selects and route sends through the resolver**

At each student-scoped call site, select:

```ts
{
  parentWhatsapp: true,
  additionalData: true,
  institute: { select: { config: true } },
}
```

Then replace a direct send with:

```ts
await sendStudentAlert(
  alertRecipientInput(student),
  recipient => sendPaymentReceiptWhatsApp(recipient, templateData),
);
```

Do not fan out authentication OTPs, teacher onboarding links, or generic one-off invite numbers that are not bound to an existing student. Attendance template helpers currently have no active caller; document their future student caller requirement beside the resolver rather than inventing a new attendance workflow.

- [ ] **Step 4: Run focused tests and verify GREEN**

Run the Step 2 command plus existing fee/security tests:

```bash
JWT_SECRET=test-secret NODE_ENV=test npx tsx --test tests/studentAlertDeliveryIntegration.test.ts tests/feeSecurity.test.ts tests/feeCalculations.test.ts
```

Expected: all pass, including independent failure isolation.

- [ ] **Step 5: Commit only Task 5 files**

```bash
git add server/src/controllers/studentController.ts server/src/controllers/batchController.ts server/src/controllers/feeController.ts server/src/controllers/testController.ts server/src/controllers/studentPortalController.ts server/src/utils/quizBroadcasts.ts server/tests/studentAlertDeliveryIntegration.test.ts
git commit -m "feat: fan out student WhatsApp alerts"
```

---

### Task 6: Move fee history ownership and repair the mobile void dialog

**Files:**
- Modify: `client/src/pages/BatchDetails.tsx`
- Modify: `client/src/pages/BatchDetails.monthCoverage.test.tsx`
- Create: `client/src/features/month-coverage/VoidPaymentDialog.tsx`
- Create: `client/src/features/month-coverage/VoidPaymentDialog.test.tsx`
- Modify: `client/src/features/month-coverage/MonthCoverageFeesView.tsx`
- Modify: `client/src/features/month-coverage/MonthCoverageFeesView.test.tsx`

**Interfaces:**
- Produces: `VoidPaymentDialog({ preview, reason, busy, onReasonChange, onCancel, onConfirm })`.
- Consumes: existing Fees dashboard preview/void state and API calls.

- [ ] **Step 1: Write failing ownership and mobile-dialog tests**

Assert Batch Details no longer renders a payment-history list for month mode, while Fees still renders payment rows. For the dialog, assert it is portaled under `document.body`, has `role="dialog"`, uses a bounded scroll body, and exposes visible Cancel/Confirm controls in a sticky footer.

```tsx
expect(document.body.querySelector('[data-testid="void-payment-dialog"]')).not.toBeNull();
expect(screen.getByRole('button', { name: 'Confirm void' })).toBeVisible();
expect(screen.getByTestId('void-dialog-footer')).toHaveClass('sticky');
```

- [ ] **Step 2: Run focused UI tests and verify RED**

Run:

```bash
cd client
npm run test:run -- src/pages/BatchDetails.monthCoverage.test.tsx src/features/month-coverage/MonthCoverageFeesView.test.tsx src/features/month-coverage/VoidPaymentDialog.test.tsx
```

Expected: fail because Batch Details owns a duplicate recent history section and the void sheet is inline under mobile navigation.

- [ ] **Step 3: Remove Batch Details recent fee history**

Delete only the `Recent fee history` month-mode section. Preserve each student's month progress cells/cards and Fee Dashboard history.

- [ ] **Step 4: Implement the portaled void dialog**

Use `createPortal(dialog, document.body)` with:

```tsx
<div className="fixed inset-0 z-[220] flex items-end justify-center bg-black/45 sm:items-center sm:p-4">
  <section className="flex max-h-[calc(100dvh-env(safe-area-inset-top)-1rem)] w-full max-w-md flex-col overflow-hidden rounded-t-[28px] bg-white sm:rounded-[28px]">
    <div className="overflow-y-auto p-6">{dialogBody}</div>
    <div data-testid="void-dialog-footer" className="sticky bottom-0 flex gap-3 border-t bg-white p-4 pb-[calc(1rem+env(safe-area-inset-bottom))]">
      <button type="button" onClick={onCancel}>Cancel</button>
      <button type="button" onClick={onConfirm}>Confirm void</button>
    </div>
  </section>
</div>
```

Keep the exact reopened-month preview and optional reason semantics.

- [ ] **Step 5: Run focused tests and verify GREEN**

Run the Step 2 command. Expected: all selected tests pass.

- [ ] **Step 6: Commit only Task 6 files**

```bash
git add client/src/pages/BatchDetails.tsx client/src/pages/BatchDetails.monthCoverage.test.tsx client/src/features/month-coverage/VoidPaymentDialog.tsx client/src/features/month-coverage/VoidPaymentDialog.test.tsx client/src/features/month-coverage/MonthCoverageFeesView.tsx client/src/features/month-coverage/MonthCoverageFeesView.test.tsx
git commit -m "fix: clarify month fee history and void flow"
```

---

### Task 7: Create an idempotent populated demo institute

**Files:**
- Create: `server/scripts/seedMonthCoverageDemo.ts`
- Create: `server/tests/seedMonthCoverageDemo.test.ts`
- Modify: `server/package.json`

**Interfaces:**
- Produces: `seedMonthCoverageDemo(prisma): Promise<DemoSeedResult>`.
- Produces package script: `seed:month-coverage-demo`.
- Stable slug: `month-coverage-demo`.
- Stable login phone: `9557940807`.

- [ ] **Step 1: Write a failing disposable-schema seed test**

Run the seed twice and assert both results describe exactly one institute, one admin, three batches, twelve students, twelve active profiles, and the same payment/allocation counts. Assert every institute/student custom phone equals `9557940807` and no `WhatsappJob` is created by the seed.

- [ ] **Step 2: Run the seed test and verify RED**

Run:

```bash
cd server
JWT_SECRET=test-secret NODE_ENV=test npx tsx --test tests/seedMonthCoverageDemo.test.ts
```

Expected: fail because the seed module does not exist.

- [ ] **Step 3: Implement the transactional idempotent seed**

Use a single Prisma transaction and stable keys. Create/update:

```ts
const demo = {
  slug: 'month-coverage-demo',
  name: 'Month Coverage Demo',
  phone: '9557940807',
  plan: 'ENTERPRISE' as const,
  coachingFeeMode: 'MONTH_COVERAGE' as const,
  batches: [
    { key: 'foundation', name: 'Foundation 2026-27', start: '2026-04-01', end: '2027-03-31' },
    { key: 'target', name: 'Target Jul-Dec 2026', start: '2026-07-01', end: '2026-12-31' },
    { key: 'weekend', name: 'Weekend Aug-Jan', start: '2026-08-01', end: '2027-01-31' },
  ],
};
```

Use four stable students per batch. Set `createdAt` before batch start for some and inside the range for others. Activate profiles using the same default rule as Task 1. Create active payment examples using durations `MONTHLY`, `QUARTERLY`, `HALF_YEARLY`, and `YEARLY`, with allocations that produce paid, partial, pending, and overdue dashboard states. Use the demo admin as creator/audit actor. Delete and recreate only records owned by the stable demo institute when refreshing; abort if slug or phone resolves to an unrelated institute identity.

Hash a random non-login password for the admin username `9557940807`; OTP login continues through the existing authentication path.

- [ ] **Step 4: Add the package script and verify GREEN**

Add:

```json
"seed:month-coverage-demo": "tsx scripts/seedMonthCoverageDemo.ts"
```

Run the test from Step 2 twice. Expected: both runs pass with unchanged counts.

- [ ] **Step 5: Commit only Task 7 files**

```bash
git add server/scripts/seedMonthCoverageDemo.ts server/tests/seedMonthCoverageDemo.test.ts server/package.json
git commit -m "feat: add month coverage demo tenant seed"
```

---

### Task 8: Full verification, localhost QA, and guarded demo creation

**Files:**
- No new production files expected.
- Update tests only if verification exposes a real uncovered contract; preserve the red-green cycle for any correction.

**Interfaces:**
- Consumes all prior tasks.
- Produces verified localhost workflow and one populated configured-database demo tenant.

- [ ] **Step 1: Validate Prisma and TypeScript**

Run:

```bash
cd server
npx prisma validate
npx prisma generate
npx tsc --noEmit
```

Expected: all exit 0.

- [ ] **Step 2: Run the full server suite**

Run:

```bash
cd server
JWT_SECRET=test-secret NODE_ENV=test npx tsx --test --test-concurrency=1 tests/*.test.ts
```

Expected: zero failures. If configured-database integration tests are isolated by schema, verify cleanup runs even after failure.

- [ ] **Step 3: Run the full client suite, lint, and production build**

Run:

```bash
cd client
npm run test:run
npm run lint
cd ..
npm run build
```

Expected: zero test/lint/build failures.

- [ ] **Step 4: Restart localhost from current main**

Stop only the known MathLogs dev processes, then run:

```bash
./dev.sh
```

Keep the process running. Confirm `http://127.0.0.1:5173/` and `http://localhost:3001/health` respond.

- [ ] **Step 5: Perform rendered QA at desktop and mobile widths**

Target flow:

`localhost login → central ₹ action → search student → amount + duration → preview → save in demo tenant → Fees history → void preview → student profile configured fields`

Verify page identity, nonblank content, no framework overlay, relevant console health, interaction proof, and screenshots. At mobile width, confirm the void footer sits above navigation and remains visible after focusing the reason field.

- [ ] **Step 6: Run the demo seed against the configured database with explicit approval**

Before mutation, read-only check that `month-coverage-demo` and `9557940807` do not identify unrelated records. Then run:

```bash
cd server
npm run seed:month-coverage-demo
```

The script must print the institute ID/slug and exact counts without secrets. Run a separate read-only verification confirming Enterprise, month coverage, 3 batches, 12 students, 12 active profiles, expected payment/allocation counts, and zero seed-created WhatsApp jobs.

- [ ] **Step 7: Check Git scope and preserve unrelated work**

Run:

```bash
git status --short
git diff --check
git diff --cached --check
git log --oneline --decorate -12
```

Confirm no GitHub push occurred, no unrelated staged changes were committed, and the existing safety stash remains available.

- [ ] **Step 8: Final handoff**

Report the user-visible flows, demo login phone, seed counts, verification commands/results, localhost URL, preserved unrelated workspace state, and the fact that nothing was pushed to GitHub.
