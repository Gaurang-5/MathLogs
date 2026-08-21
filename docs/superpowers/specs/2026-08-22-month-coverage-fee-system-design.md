# Month-Coverage Fee System Design

**Date:** 2026-08-22

**Status:** Approved design

**Scope:** Add a second, fully isolated coaching-fee model while preserving the existing amount-due model.

## 1. Objective

MathLogs will support two institute-level coaching-fee systems:

1. `CURRENT_DUE_BASED`: the existing batch fee, installment, amount-due, balance, and payment workflow.
2. `MONTH_COVERAGE`: a new workflow in which a teacher records an amount already received and selects how many months it covers. The system measures received, pending, and overdue months instead of calculating a future rupee amount due.

The systems must remain operationally and technically separate. Existing institutes and their data must not change. A new institute selects its fee system during coaching setup, and that selection applies to all of its batches.

## 2. Core Product Rules

### 2.1 Institute fee mode

- Each institute has exactly one fee mode.
- All existing institutes default to `CURRENT_DUE_BASED`.
- A new institute selects its mode during coaching setup.
- The selected mode is fixed through normal product workflows. Changing it is not part of this feature.
- An institute cannot use both models across different batches.

### 2.2 No cross-model behavior

- Current-system institutes continue using the existing tables, endpoints, calculations, reports, and screens.
- Month-coverage institutes use separate payment, allocation, audit, calculation, and reporting paths.
- A payment is never written to both models.
- Month-coverage calculations never read legacy installments, balances, or amount-due records.
- Legacy calculations never read month-coverage records.
- The models may share only institute, batch, student, teacher/admin identity, authorization infrastructure, and visual components.

## 3. Batch and Student Fee Periods

### 3.1 Batch period

- Batch start date and end date are required for month-coverage institutes.
- Both boundary months count.
- Fee progress uses calendar months in the institute timezone.
- Example: 1 April 2026 through 31 March 2027 contains 12 fee months.
- The end date must not precede the start date.

### 3.2 Student fee profile

Every student in a month-coverage institute has a separate month-coverage fee profile. Enrollment date and fee start month are distinct values.

- The teacher selects the student's fee start month when adding or approving the student.
- If the student joins before the batch starts, the default is the batch start month.
- If the student joins after the batch starts, the default is the student's joining month.
- The teacher may choose a later month.
- The teacher may backdate the fee start as far as the batch start month; the UI warns when the chosen month precedes the recorded joining month.
- The fee start cannot precede the batch start.
- The student's fee end month comes from the batch end date.
- The student's total applicable months are counted inclusively from the selected fee start month through the batch end month.

Example: a batch runs from April 2026 through March 2027. A student's fee start is July 2026, so the student's progress denominator is nine months. A quarterly payment changes progress from `0/9` to `3/9`.

Students marked left or inactive retain their payment history. Future months after they leave stop contributing to pending and overdue calculations. Historical months and payments remain visible.

## 4. Month-Coverage Payment Workflow

### 4.1 Payment entry

Only authorized teachers and institute admins can record month-coverage fees. Parents cannot submit or initiate payments in this mode.

The teacher provides:

- Student
- Amount already received
- Payment date, defaulting to today
- Payment method
- Coverage duration
- Optional note

The amount must be greater than zero. It is the total received for the selected duration, not an amount per month. The system does not store or calculate a standard monthly, quarterly, half-yearly, or yearly price.

Coverage choices are fixed:

- Monthly: 1 month
- Quarterly: 3 months
- Half-yearly: 6 months
- Yearly: 12 months

A duration longer than the number of remaining uncovered months is disabled. The teacher can use shorter available choices in subsequent payments; arbitrary custom month counts are outside this feature.

### 4.2 Automatic allocation

- The system automatically proposes the oldest uncovered months.
- Example: if July and August are pending, a Monthly payment recorded in September proposes July.
- Before saving, the UI shows the amount, duration, and exact covered months.
- The teacher may edit the proposed starting month.
- Months before the student's fee start, before the batch start, or after the batch end cannot be selected.
- An active covered month cannot be covered by a second payment. The UI displays `Fee already received` and requires the teacher to choose an uncovered month.
- A teacher may intentionally leave a gap. The UI identifies the skipped pending month and requires explicit confirmation before continuing.

### 4.3 Confirmation and duplicate protection

Saving a payment creates one payment record and one allocation for each covered month in a single database transaction. The operation uses idempotency or an equivalent unique submission key so a double-click or retry cannot create duplicate payments.

Database uniqueness and transactional checks prevent two concurrent operations from actively covering the same student-month.

## 5. Corrections, Voiding, and Audit History

- An authorized teacher/admin may edit a saved payment's amount, date, method, duration, note, or covered months.
- The edit screen previews the resulting covered months and applies the same boundary, overlap, and gap rules as creation.
- A correction reason is optional.
- Every edit records the actor, timestamp, previous values, new values, and optional reason.
- The UI may call the action `Delete`, but the server voids the payment rather than physically erasing the financial record.
- Before voiding, the confirmation screen shows the payment details, covered months, and which months will become pending again.
- A void reason is optional.
- Voiding releases the payment's active month allocations and immediately updates progress, pending, overdue, and reports.
- A voided payment remains available in audit history and cannot contribute to received-month or collected-amount totals.

## 6. Status Definitions and Calculations

### 6.1 Student totals

For an active student:

- `applicableMonths`: inclusive calendar months from the student's fee start through the effective fee end.
- `receivedMonths`: distinct applicable months with an active allocation.
- `pendingMonths`: applicable months without an active allocation, including future months.
- `overdueMonths`: pending months whose calendar month has already started in the institute timezone.
- `totalCollected`: sum of active, non-voided month-coverage payments.
- `progressPercent`: `receivedMonths / applicableMonths * 100`, with safe handling for an empty period.

Future pending months affect progress but never place the student in fee follow-up before their month begins.

### 6.2 Institute and batch totals

Aggregate progress uses student-months, not rupees:

- Sum applicable months across eligible active students.
- Sum distinct received months across those students.
- Pending and overdue totals are sums of the corresponding student totals.
- The overall progress bar is aggregate received student-months divided by aggregate applicable student-months.
- Total rupees collected is displayed separately and never used as the month-progress denominator.

## 7. User Experience

### 7.1 Visual compatibility

The month-coverage experience must follow the existing MathLogs UI rather than introduce a new visual system.

- Reuse the existing Fee page structure, cards, filters, student table, payment modal, transaction history, reports entry point, spacing, colors, typography, and responsive behavior.
- Reuse the current dashboard card and progress patterns.
- Reuse the Quick Fee modal entry point and extend its fields conditionally for month-coverage institutes.
- Keep equivalent workflows in the Fee page, teacher dashboard, batch details, and batch student table.

Only fee semantics change for month-coverage institutes:

- Amount due becomes months pending.
- Rupee collection rate becomes month-collection progress.
- Oldest due date becomes oldest overdue month.
- Installment-oriented filters become batch and coverage-status filters.

### 7.2 Month-coverage dashboard

The dashboard shows:

- Total rupees collected
- Received student-months
- Pending student-months
- Overdue student-months
- Overall month-collection progress bar

Each student row shows:

- Student and batch
- Fee start month and batch end month
- Received months out of total applicable months
- Individual progress bar
- Overdue month count
- Next pending month
- Total amount received

### 7.3 Payment preview and history

The payment confirmation displays a sentence such as:

> ₹1,000 received · Quarterly · Covers July, August, and September 2026

Payment history shows amount, duration, covered months, payment date, payment method, status, and the teacher/admin who recorded it.

## 8. Reports and Reminders

- The month-based pending report lists student, batch, fee period, received months, pending months, and overdue months.
- Transaction reports recognize revenue on the actual collection date and show the amount received.
- The system does not invent, estimate, or display a future rupee amount due.
- Fee follow-up lists include only students with overdue months.
- Teacher-initiated reminders identify the overdue months and do not contain a parent payment link.
- Parent payment submission and UPI verification entry points are unavailable for month-coverage institutes.

## 9. Data Boundaries

The logical records and intended names are:

- `Institute.coachingFeeMode`, backed by a `CoachingFeeMode` enum with `CURRENT_DUE_BASED` and `MONTH_COVERAGE`.
- `Batch.startDate` and `Batch.endDate`.
- `StudentMonthCoverageProfile`, containing the student fee start month and lifecycle state.
- `MonthCoveragePayment`, containing amount, date, method, duration, note, creator, status, and idempotency key.
- `MonthCoverageAllocation`, containing payment, student, and canonical calendar month.
- `MonthCoverageAuditEvent`, containing action, actor, timestamp, before/after snapshots, and optional reason.

`MonthCoverageAllocation` represents current active coverage only and has a database unique constraint on student and canonical month. Editing or voiding a payment removes its active allocations in the same transaction that creates replacement allocations or marks the payment void. Immutable audit-event snapshots preserve the historical allocation state. This provides a simple database-level guarantee that only one active payment can cover a student-month.

## 10. API and Authorization Boundaries

- Existing fee endpoints remain behaviorally unchanged and reject month-coverage institutes.
- New month-coverage endpoints reject current-system institutes.
- Every operation verifies institute ownership and teacher/admin authorization.
- Dashboard and report entry points dispatch to a mode-specific service before reading fee data.
- Mode-specific serializers prevent legacy amount-due fields from leaking into month-coverage responses and prevent coverage fields from affecting current-system responses.
- Parent-facing payment endpoints reject month-coverage institutes even if called directly.

## 11. Migration and Rollout Safety

- The schema migration is additive.
- Existing fee records, balances, installments, payments, and reports are not transformed.
- Existing institutes are backfilled or defaulted to `CURRENT_DUE_BASED` deterministically.
- No historical coverage is inferred from existing payments.
- New tables remain empty for existing institutes unless an authorized administrative migration is designed separately in the future.
- Rollout can be protected by an application feature flag in addition to the institute fee mode, but the fee mode remains the source of business behavior after release.

## 12. Error Handling

The server returns specific, user-facing errors for:

- Missing batch dates or invalid date order
- Fee start outside the batch period
- Invalid or non-positive amount
- Unsupported duration
- Insufficient remaining uncovered months
- Already-covered month
- Gap requiring confirmation
- Concurrent coverage conflict
- Duplicate submission
- Wrong institute fee mode
- Unauthorized or cross-institute access

The client preserves entered data when a recoverable validation error occurs and refreshes the proposed allocation after a concurrent conflict.

## 13. Verification Strategy

### 13.1 Existing-system regression

- Existing institutes retain the current mode after migration.
- Existing batch creation, installments, payments, balance calculations, reminders, reports, dashboard totals, Quick Fee flow, and parent payment behavior remain unchanged.
- Current-system endpoints never read or write month-coverage tables.

### 13.2 Month-coverage unit and service tests

- Inclusive month generation across year boundaries and leap years
- Default student fee start before and after batch start
- Teacher-selected and backdated fee starts
- Oldest-uncovered-month allocation
- Monthly, Quarterly, Half-yearly, and Yearly allocation
- Gap warning and confirmation
- Overlap rejection
- Duration availability based on remaining months
- Student, batch, and institute progress calculations
- Pending versus overdue calculation at month boundaries
- Left/inactive student handling
- Edit and void recalculation
- Audit snapshots

### 13.3 Isolation, authorization, and reliability tests

- Legacy endpoints reject month-coverage institutes.
- Coverage endpoints reject legacy institutes.
- Parent payment endpoints reject month-coverage institutes.
- Cross-institute records cannot be read or changed.
- Duplicate submissions are idempotent.
- Concurrent attempts to cover the same student-month produce one successful allocation.
- Voided allocations may be covered again without double-counting history.

### 13.4 UI and integration tests

- Each institute mode renders the correct fields while retaining the existing visual structure.
- Month-coverage payment preview matches server allocation.
- Warnings, overlap errors, edit previews, and void confirmations are visible and actionable.
- Dashboard, Fee page, Quick Fee modal, batch details, reports, and transaction history refresh consistently after create, edit, or void.
- Existing mobile and desktop layouts remain usable.

## 14. Explicitly Out of Scope

- Converting an existing institute from one fee model to the other
- Combining both fee models within one institute
- Predefined monthly, quarterly, half-yearly, or yearly prices
- Calculating future rupee dues, concessions, or waived amounts
- Parent-initiated payments for month-coverage institutes
- Arbitrary custom coverage lengths
- Automatically inferring month coverage from legacy payments
- Physical deletion of financial and audit records

## 15. Acceptance Criteria

The feature is complete when:

1. Existing institutes behave identically before and after deployment.
2. A new institute can select the month-coverage model during setup and cannot use legacy fee operations.
3. A month-based batch requires valid start and end dates.
4. A teacher can select each student's fee start month, including admission before batch start and warned backdating after batch start.
5. A teacher can record an amount received with one of the four durations and see/edit the exact proposed months before confirmation.
6. The oldest uncovered months are selected automatically; duplicates are blocked and gaps require confirmation.
7. Student and aggregate progress use months, while collected rupees remain a separate metric.
8. Only overdue months drive fee follow-ups.
9. Editing and voiding update month status atomically and preserve audit history.
10. Parent payment submission is unavailable in month-coverage mode.
11. The month-based screens match the structure and visual language of the current Fee and dashboard interfaces.
12. Automated tests demonstrate model isolation, tenant isolation, idempotency, concurrency safety, and current-system regression protection.
