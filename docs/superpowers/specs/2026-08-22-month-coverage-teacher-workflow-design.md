# Month-Coverage Teacher Workflow Design

## Goal

Make the month-coverage fee system fast for everyday teacher use while preserving detailed correction tools in the Fees dashboard, automatically establishing student fee periods, exposing configured onboarding data in teacher-facing student profiles, and supporting additional WhatsApp alert recipients.

The current due-based fee system remains behaviorally isolated and unchanged.

## Scope

This design covers:

- a dedicated month-coverage Quick Fee flow behind the central rupee action;
- automatic student fee-profile activation;
- teacher-facing student profile fields driven by onboarding configuration;
- opt-in WhatsApp fan-out to configured custom phone fields;
- removal of recent fee history from Batch Details;
- a mobile-safe void-payment dialog in Fees;
- an idempotent populated demo institute.

It does not redesign the legacy current due-based fee flow, parent fee UI, payment gateways, or subscription billing.

## Quick Fee Experience

For a `MONTH_COVERAGE` institute, the central rupee action opens a purpose-built Quick Fee dialog instead of the detailed month-coverage payment editor.

The teacher flow is:

1. Search for an active student by name, human ID, parent phone, or batch.
2. Select the student.
3. Enter the amount received.
4. Choose Monthly, Quarterly, Half-yearly, or Yearly from one dropdown.
5. Review the automatically calculated coverage range.
6. Save.

Quick Fee does not show receipt scanning, requested starting month, payment date, payment method, or note inputs. New Quick Fee payments use today's date, `CASH`, and no note. The server chooses the oldest uncovered applicable month and allocates the selected duration consecutively. The preview remains visible because it prevents accidental coverage mistakes, but it is read-only.

The existing detailed payment editor remains available only from the Fees dashboard for corrections and exceptional workflows. Editing an existing payment continues to use the detailed controls and audit trail.

## Automatic Student Fee Profiles

A teacher does not select a fee start month during routine student creation or approval.

For a student joining a month-coverage batch, the server calculates:

`feeStartMonth = max(batchStartMonth, studentJoiningMonth)`

The profile is activated atomically with student creation or approval. `feeEndMonth` comes from the batch end month. Directly added students and approved self-registration students follow the same rule.

The teacher can later edit the fee start month from the teacher-facing student profile. The edit must remain within the batch period. Existing covered months cannot be invalidated silently; conflicting edits return a clear validation error.

Pending setup remains an exceptional repair state for incomplete historical records, not the normal onboarding flow.

## Teacher-Facing Student Profiles

Teacher profile surfaces must render fields from the institute's current `config.registrationForm.fields` definition instead of relying on a fixed list.

System fields map to typed student columns:

- Student Name → `Student.name`
- Parent Name → `Student.parentName`
- WhatsApp Number / Parent Phone → `Student.parentWhatsapp`
- Parent Email → `Student.parentEmail`
- School Name → `Student.schoolName`

Custom field values come from `Student.additionalData[field.id]`. View and edit surfaces use the configured label, order, and input type. A field added after a student registered appears with an empty/not-provided value until edited. Removing a form field hides it from normal profile presentation without deleting historical `additionalData`.

For month coverage, the profile also shows fee start month, batch-derived fee end month, paid-month count, pending-month count, overdue-month count, and an Edit Fee Start action. Legacy amount-due and installment widgets are not shown for a month-coverage student.

## Additional WhatsApp Alert Recipients

Custom onboarding fields with a phone-compatible input type expose a `Send alerts to this number` checkbox in the onboarding form editor. The persisted field definition adds a boolean `sendAlerts` property. Critical system phone behavior remains unchanged; the primary `parentWhatsapp` always receives eligible messages.

A centralized server-side recipient resolver accepts the student and institute registration-field configuration and returns:

1. the normalized primary parent WhatsApp number; and
2. normalized values from custom phone fields whose current configuration has `sendAlerts: true`.

The resolver removes blanks, rejects malformed numbers, and deduplicates normalized recipients. If a custom field is removed or `sendAlerts` is disabled, its stored value no longer receives future notifications.

Every student-scoped WhatsApp pathway must use the resolver, including welcome messages, fee reminders and receipts, attendance alerts, test results, quiz messages, and batch announcements. One recipient failing must not prevent attempts to the remaining recipients. Logs must continue to redact phone numbers.

## Dashboard Ownership

Batch Details keeps student membership and month-progress information but removes the complete `Recent fee history` section.

The Fees dashboard owns payment history, detailed payment editing, filters, reports, and voiding. This avoids duplicating financial history across two screens.

## Void-Payment Dialog

The void dialog renders through a portal attached to `document.body` so it is not trapped under Layout stacking contexts or mobile navigation.

It uses an overlay above all app navigation, bottom safe-area padding, a bounded viewport height, an internally scrollable body, and a sticky action footer. Cancel and Confirm Void remain visible above the mobile navigation. The preview continues to state the amount and exact months that will reopen, and the optional reason remains available.

## Demo Institute

An idempotent seed script creates or refreshes one test tenant with these properties:

- name: `Month Coverage Demo`;
- plan: `ENTERPRISE`;
- fee mode: `MONTH_COVERAGE`;
- coaching/admin login phone: `9557940807`;
- every dummy primary and additional WhatsApp value: `9557940807`;
- three batches with explicit start and end dates;
- approximately twelve students covering pre-start and mid-batch joins;
- active profiles created by the automatic fee-start rule;
- monthly, quarterly, half-yearly, and yearly payments;
- fully paid, partly paid, pending, and overdue examples;
- at least one custom phone field with `sendAlerts: true`.

Seeding writes records directly and does not send WhatsApp notifications. It uses stable identifiers or natural keys, runs in a transaction, and is safe to rerun without multiplying records.

## API and Service Boundaries

- Quick Fee reuses month-coverage preview and create endpoints but omits `requestedStartMonth`; the service resolves the oldest uncovered month.
- Student creation and approval call one automatic activation service inside their existing transaction.
- Fee-start editing remains an explicit authenticated endpoint and writes the confirmer/audit metadata already associated with the profile.
- The WhatsApp recipient resolver is independent of transport, allowing every sender to fan out consistently without duplicating form-config parsing.
- Legacy fee endpoints remain guarded against month-coverage tenants, and month-coverage endpoints remain guarded against current due-based tenants.

## Error Handling

- Quick Fee blocks save when the duration exceeds remaining applicable months.
- A student with no active profile reports a repair-oriented message instead of exposing start-month selection in Quick Fee.
- Automatic activation fails the surrounding student transaction if batch dates are missing or invalid.
- Additional alert numbers never replace the primary number; malformed optional numbers are skipped and securely logged.
- Demo seeding aborts and rolls back if an identity collision points to an unrelated institute.

## Testing and Verification

Tests must cover:

- Quick Fee rendering only the approved inputs and submitting today/Cash with no requested start month;
- automatic oldest-month preview and allocation;
- automatic fee start for pre-start and mid-batch students during direct add and approval;
- profile view/edit rendering configured system and custom fields;
- alert-field checkbox persistence;
- recipient normalization, deduplication, disabled fields, malformed values, and multi-recipient failure isolation;
- representative welcome, fee, attendance, test, quiz, and announcement send paths using the resolver;
- absence of recent fee history in Batch Details and its presence in Fees;
- void dialog portal, stacking, scrolling, and visible mobile actions;
- idempotent demo seeding and expected scenario counts;
- unchanged legacy fee behavior.

Rendered QA uses the running localhost application at desktop and mobile widths. It verifies the central rupee flow, student profile data, fee history ownership, and void dialog without submitting destructive corrections against non-demo tenants.
