# Student Enrollment Lifecycle and Attendance Removal Design

**Date:** 2026-08-27

**Status:** Approved design

**Scope:** Separate permanent student identity from batch participation, prevent duplicate profiles during re-enrollment, support simultaneous batches and teacher-selected fee applicability in both fee modes, add enrollment lifecycle WhatsApp notifications, correct shared-phone portal behavior, and remove the unused attendance subsystem.

## 1. Objective

MathLogs must keep one permanent student profile per learner while allowing that learner to join, leave, and rejoin batches without losing or splitting marks, payments, fees, or the human-readable student ID.

The present model stores one `batchId` and one lifecycle `status` directly on `Student`. Removing a student clears `batchId`, and a later registration searches only the destination batch and phone number. The old profile is therefore invisible to that registration, so a second profile and human ID can be created. The same structure also prevents one student from joining multiple batches at the same time.

The replacement model makes batch participation an explicit enrollment. Student identity remains permanent; enrollment history records participation in each batch.

## 2. Product Decisions

- A student is a permanent learner identity within one institute.
- A student can have multiple active enrollments in different batches at the same time.
- A student can have at most one active enrollment in the same batch.
- Ending an enrollment never deletes the student profile.
- Rejoining the same batch creates a new enrollment period and preserves the ended period.
- A teacher who explicitly selects an old profile authorizes immediate re-enrollment. No student review or registration form is required.
- A genuinely new student still completes the normal registration flow.
- Removing a student means ending one selected batch enrollment. It does not affect other enrollments.
- Permanent profile deletion is a separate guarded correction for empty, mistaken profiles only.
- The teacher chooses fee applicability when adding or re-enrolling a student in either fee mode.
- Existing paid and unpaid records are preserved and are never duplicated by enrollment changes.
- Enrollment addition, re-enrollment, and removal produce WhatsApp notifications through the existing job system.
- Attendance is not part of the product and will be removed.

## 3. Chosen Architecture

### 3.1 Alternatives considered

1. **Permanent `Student` plus explicit `Enrollment` records — chosen.** This represents simultaneous batches, separate participation periods, fee boundaries, and history directly.
2. **Reattach archived students through `Student.batchId`.** This is smaller but still cannot support simultaneous batches or preserve multiple participation periods.
3. **Keep one student profile per batch and add a master-person link.** This retains split IDs and histories and requires permanent merge logic.

### 3.2 Student

`Student` owns permanent identity and institute-wide information:

- Human-readable student ID
- Name and parent details
- WhatsApp and email contacts
- School and configured profile fields
- Marks and quiz history
- Payments and financial history
- Student portal identity

Batch membership and leave state do not belong to `Student`. Whether a student is currently participating is derived from active enrollments.

### 3.3 Enrollment

`Enrollment` represents one continuous period in one batch. Its logical fields are:

- `id`
- `instituteId`
- `studentId`
- `batchId`
- `status`: `ACTIVE` or `ENDED`
- `startedAt`
- `endedAt`
- `endReason`
- `createdById`
- `endedById`
- `createdAt`
- `updatedAt`

The database must enforce at most one active enrollment for a student and batch. PostgreSQL should use a partial unique index on `(studentId, batchId)` where status is `ACTIVE`. Service-level idempotency is additional protection, not a substitute for the constraint.

Historical periods for the same student and batch are separate enrollment rows.

## 4. Fee Applicability

Fee applicability is selected before the teacher confirms a new enrollment or re-enrollment. The UI must preview the financial effect before saving.

### 4.1 Month-coverage mode

- The teacher selects a fee start month inside the batch period.
- The month may be the current month or an earlier allowed month.
- The enrollment owns its month-coverage profile.
- Removing the student ends future applicability for that enrollment while preserving allocations and payments already recorded.
- Re-enrollment creates a new profile for the new enrollment period.

`StudentMonthCoverageProfile`, `MonthCoveragePayment`, `MonthCoverageAllocation`, and related audit data must reference `enrollmentId`. Existing uniqueness on `StudentMonthCoverageProfile.studentId` must become enrollment-scoped. Existing allocation uniqueness on `(studentId, coverageMonth)` must become `(enrollmentId, coverageMonth)` so one student can pay for two simultaneous batches in the same calendar month.

### 4.2 Current-due mode

- The teacher sees the destination batch's existing installments.
- The teacher selects the current and/or older installments that apply to the enrollment.
- The preview shows the new assigned amount and any existing balance.
- Existing `FeeInstallmentAssignment` uniqueness on student and installment prevents reassignment duplicates.
- Existing payments are never recreated, reassigned, or erased.
- Future global installments apply only while the enrollment is active, according to the existing batch installment rules.

### 4.3 Transaction boundary

Creating an enrollment and applying its selected fee configuration happen in one database transaction. A fee failure prevents partial enrollment creation. WhatsApp dispatch happens after the transaction through a durable job and cannot roll back the enrollment.

## 5. Teacher Add and Re-enrollment Flow

The batch **Add Student** flow begins with institute-wide identity search by name, normalized phone, or student ID. Search includes students with no active enrollment.

Candidate rows show enough information for a safe teacher decision:

- Student ID
- Student and parent names
- Normalized phone
- Current batches
- Previous batches
- Existing fee balance

The teacher chooses one of two paths.

### 5.1 Use existing profile

1. Teacher selects the permanent profile.
2. MathLogs checks for an active enrollment in the destination batch.
3. If already active, it returns an idempotent `ALREADY_ENROLLED` result and creates nothing.
4. Otherwise the teacher selects fee applicability and sees the preview.
5. Confirmation creates an active enrollment immediately and applies fees.
6. MathLogs queues an added or re-added WhatsApp notification.
7. No registration link or student review is used.

The same profile, student ID, marks, payments, and history remain unchanged.

### 5.2 Create new student

If none of the candidates is the intended learner, the teacher chooses **Create new student**. MathLogs sends the existing secure registration link. Successful submission creates one permanent student and one enrollment transactionally, with the teacher-selected fee applicability carried in the signed invitation.

## 6. Public Registration and Duplicate Protection

Public QR or open-link registration must not silently reuse or create a profile when a credible existing match is present.

- Exact active student/batch match: return already enrolled.
- Credible existing-profile candidates: create an identity-review request, not a second student.
- No credible candidate: create the new student and enrollment normally.
- Teacher review chooses an existing profile or confirms creation of a new student.

Phone number is a contact identifier, not a unique student identity. Siblings may share a parent phone, phone numbers may change, and different learners may have identical names. Automatic merging based only on name or phone is forbidden.

Candidate detection must be deterministic and explainable. It may use normalized phone, normalized full name, parent name, school, and human ID, but only an explicit teacher selection can reuse a profile.

## 7. Ending an Enrollment

The teacher acts on one student row inside one batch and supplies a reason.

In one transaction, MathLogs:

1. Confirms that the enrollment is active and belongs to the teacher's institute.
2. Sets it to `ENDED` with effective timestamp, reason, and actor.
3. Closes future fee applicability for that enrollment.
4. Preserves all existing fees, payments, marks, and student information.

Other active enrollments remain unchanged. A repeated request is idempotent and returns the already-ended state.

After commit, MathLogs queues a WhatsApp message containing the student name, batch, effective date, and teacher-provided reason.

## 8. Permanent Deletion of Mistaken Profiles

Permanent deletion is not part of the normal batch-removal flow. It is available only when the profile is an empty mistake.

Deletion is rejected if the student has any of the following:

- Active or ended enrollments
- Marks or quiz submissions
- Fee assignments, balances, payments, allocations, or audit events
- Any other durable operational history

The UI uses a separate, strongly worded action and typed confirmation. The operation writes a system audit record before deletion. Profiles with history are never hard-deleted; administrators must correct or reconcile them instead.

## 9. Student Portal and Shared Phones

OTP authentication remains scoped to institute and normalized phone. After OTP verification:

- One matching student: open that student's portal.
- Multiple matching students: return a student selector and issue a student-specific session only after selection.
- Profiles with no active enrollment remain visible only where historical portal access is intentionally supported.

The server must never use an unordered `findFirst` or the first array item to choose a student sharing a phone number.

## 10. WhatsApp Notifications

Approved templates are required for:

- Added to batch
- Added again to batch
- Removed from batch

Each enrollment lifecycle event has a stable event key. Enqueuing uses that key to prevent duplicate messages on request retry. Messages are created only after the enrollment transaction commits.

Notification delivery failure does not undo enrollment state. The teacher receives the saved enrollment result plus notification status, and failed jobs remain visible and retryable through the existing operational job tooling.

Re-enrollment does not send a registration link. New-student invitations continue to send the registration link.

## 11. Attendance Subsystem Removal

Production inspection on 2026-08-27 found zero `AttendanceRecord` rows and zero `AttendanceSweepRun` rows. No active attendance route, screen, kiosk, or worker exists. The remaining subsystem is incomplete and unused.

Removal includes:

- `AttendanceRecord` and `AttendanceSweepRun` models and relations
- `AttendanceSource`
- Attendance profile fields and statistics
- Attendance participation in student archive/delete decisions
- Signed attendance-photo utilities
- Attendance WhatsApp types and helpers
- Attendance-specific environment settings and templates
- Client types, empty fixtures, and profile UI
- Marketing, onboarding, login, SEO, and product-description claims
- The obsolete attendance implementation-plan document

A new forward migration must check both attendance tables at execution time and abort if either contains data. Only after the empty-table guard passes may it drop constraints, tables, and the enum. Previously applied migration files must not be edited.

## 12. Service Boundaries

Enrollment behavior belongs in a dedicated service rather than the existing large student controller. Its public operations are conceptually:

- `searchEnrollmentCandidates`
- `createStudentAndEnrollment`
- `enrollExistingStudent`
- `endEnrollment`
- `previewEnrollmentFees`
- `reviewPotentialDuplicateRegistration`

Each operation accepts institute and actor context explicitly, validates tenant ownership, and returns typed domain outcomes such as `CREATED`, `REENROLLED`, `ALREADY_ENROLLED`, `ENDED`, or `IDENTITY_REVIEW_REQUIRED`.

Controllers translate HTTP requests and errors only. Fee-mode adapters own mode-specific fee preview and application. Notification enqueueing consumes committed enrollment events.

## 13. Error Handling and Concurrency

The system returns specific errors for:

- Student, batch, or enrollment not found
- Cross-institute access
- Student already active in the batch
- Enrollment already ended
- Invalid fee start month
- Invalid or unavailable installment selection
- Attempt to duplicate an existing fee assignment or covered month
- Candidate profile requiring identity review
- Attempt to delete a non-empty student
- Concurrent enrollment conflict

All mutating endpoints use idempotency keys or equivalent stable action keys. Database constraints decide concurrent conflicts. Retrying a completed operation returns its existing result instead of creating another enrollment, fee assignment, or notification.

## 14. Data Migration and Rollout

The rollout uses expand, migrate, switch, and contract phases.

### 14.1 Attendance removal

1. Remove application references.
2. Run the guarded empty-table migration.
3. Verify no runtime or generated-client references remain.

### 14.2 Expand

1. Add enrollment tables, enums, indexes, audit fields, and nullable enrollment references.
2. Retain legacy `Student.batchId`, `status`, `leftAt`, and `leaveReason` temporarily.
3. Deploy code capable of reading legacy data while enrollment backfill runs.

### 14.3 Backfill and reconciliation

- Every current approved student with a `batchId` receives one active enrollment.
- Month-coverage profiles receive the corresponding enrollment reference.
- Current-due installment assignments remain linked to student and batch installments and are validated against the new enrollment.
- Removed students whose old `batchId` was cleared are inferred only from trustworthy relations such as month profiles, fee installments/payments, and tests.
- Ambiguous historical batch membership is never guessed. It is emitted to a reconciliation report with student ID and evidence for administrative review.
- Similar names or shared phones are never automatically merged.

The migration reports source counts, created enrollment counts, unresolved counts, invalid cross-tenant rows, and duplicate-active conflicts. The application switch is blocked until all unexpected mismatches are resolved or explicitly accepted as reconciliation items.

### 14.4 Switch and contract

1. Switch batch lists, student search, registration, fees, tests, reports, and portal queries to enrollment-based membership.
2. Monitor invariant and notification failures.
3. In a later migration, remove obsolete student batch/lifecycle fields and compatibility code.

No single deployment both creates and immediately depends exclusively on the new schema.

## 15. User Interface Changes

- Batch detail lists active enrollments rather than `Student.batchId` relations.
- Add Student becomes an identity-first search with **Use existing profile** and **Create new student** paths.
- Fee selection and financial preview appear before enrollment confirmation.
- Student profile shows current and previous batch participation periods.
- Remove action is labeled **Remove from this batch** and shows its limited scope.
- Permanent deletion appears separately only when the server reports the profile eligible.
- Identity-review requests show submitted registration data beside candidate profiles.
- Notification delivery status appears after add, re-add, and removal actions.

## 16. Verification Strategy

### 16.1 Enrollment and identity

- New student registration creates one student and one enrollment.
- Teacher selection reuses the exact old profile and human ID.
- Re-enrollment preserves marks, fees, payments, and ended periods.
- One student can hold multiple active enrollments in different batches.
- The same student and batch cannot have two active enrollments.
- Same-name students and siblings sharing a phone stay separate.
- Public registration with a credible match enters identity review.
- Concurrent and retried requests are idempotent.

### 16.2 Fees

- Month-coverage start can be current or earlier within batch bounds.
- Two simultaneous batch enrollments can cover the same calendar month independently.
- Current-due mode applies only the teacher-selected batch installments.
- Existing paid and unpaid records are not duplicated or erased.
- Fee preview matches committed results.
- Ending one enrollment stops only its future applicability.

### 16.3 Notifications and portal

- Added, re-added, and removed events enqueue exactly one message.
- Failed messages do not roll back enrollment and can be retried.
- Shared-phone OTP login returns a student selector.
- Student-specific sessions cannot cross institute or student boundaries.

### 16.4 Attendance removal

- Empty-table guard succeeds on empty fixtures.
- Guard fails without dropping data when either table contains a row.
- Generated Prisma client, server type check, client type check, and builds contain no attendance references.
- Marketing and product copy contain no attendance claims.

### 16.5 Migration and regression

- Active student/batch counts equal active enrollment backfill counts.
- Cross-tenant and duplicate-active records are rejected and reported.
- Unresolved historical records appear in the reconciliation output.
- Batch details, student profiles, marks entry, both fee modes, reports, registration, and portal access continue to work.
- Full server and client tests, TypeScript checks, Prisma validation, and production builds pass before rollout.

## 17. Out of Scope

- Automatic merging of existing duplicate student profiles
- Student self-service approval of teacher re-enrollment
- Attendance replacement
- Reconstructing ambiguous historical batch membership without evidence
- Changing an institute's selected fee mode
- Deleting financial or academic history
