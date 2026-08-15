# Canonical Three-Plan Billing and Entitlements Design

**Date:** 2026-08-15  
**Status:** Approved for implementation planning

## Objective

Replace the overlapping legacy plan, access, price, credit, and student-limit rules with one authoritative three-plan model used by the public website, onboarding, billing, runtime authorization, Marketplace, and Superadmin.

The release must preserve all existing business records. Every existing institute is migrated to Enterprise while retaining its current subscription dates. Existing quiz credits become non-expiring lifetime credits. All plans have unlimited students.

## Canonical product catalogue

| Canonical plan | Price | Duration | Included access | Included quiz credits |
| --- | ---: | --- | --- | ---: |
| Marketplace | ₹99 one time; promotional price ₹0 for now | Lifetime | Public listing, ownership, Marketplace account, and leads | None |
| Quiz | ₹249 monthly or ₹2,499 yearly | Subscription | Lifetime Marketplace access and all quiz features | 5 per billing month |
| Enterprise | ₹499 monthly or ₹4,999 yearly | Subscription | Lifetime Marketplace access, all quiz features, and all coaching-management features | 5 per billing month |

Marketplace activation bypasses Razorpay while the promotional price is active. The UI shows the ₹99 list price and clearly labels the current offer as free. Marketplace access never expires.

Quiz and Enterprise include unlimited students and a 14-day free trial. Starting a trial requires no payment method and grants five trial quiz credits. A trial is available once per institute/owner identity. Trial credits expire when the trial ends. If a trial or paid subscription expires, effective access falls back to Marketplace.

The server owns the product catalogue. Public pages and authenticated clients read catalogue data from the server instead of defining prices or feature lists independently. Client-provided product prices are never trusted during order creation or payment verification.

## Canonical terminology and compatibility

New application state uses only these plan identifiers:

- `MARKETPLACE`
- `QUIZ`
- `ENTERPRISE`

Legacy identifiers such as `FREE`, `BASIC`, `PRO`, `NO_PLAN`, `PAGE_ONLY`, `QUIZ_ONLY`, `FULL`, `listing`, `quiz_only`, and `all_inclusive` are removed from display copy, filters, reports, and new persisted writes. A narrow compatibility mapper may accept known legacy identifiers at API boundaries during rollout so an old browser session or already-created payment cannot corrupt or lose an operation. Compatibility aliases always normalize to a canonical plan before domain logic runs.

Legacy PostgreSQL enum values may remain temporarily available for rollback compatibility, but the data migration leaves no institute assigned to a legacy plan and application code cannot create new legacy assignments.

## Entitlements and lifecycle

Effective access is calculated by one entitlement service rather than scattered checks of `plan`, `isQuizOnly`, `config.planName`, or `planExpiryDate`.

- Marketplace entitlement is permanent once granted by Marketplace, Quiz, or Enterprise activation.
- An active Quiz subscription grants Marketplace and quiz access.
- An active Enterprise subscription grants Marketplace, quiz, and coaching-management access.
- An expired Quiz or Enterprise subscription grants Marketplace access only.
- Stored lifetime quiz credits do not grant quiz-feature access on their own. They remain available when Quiz or Enterprise is reactivated.
- Monthly and yearly subscriptions end at their stored expiry unless a verified renewal extends them.
- Cancellation stops future renewal but preserves access through the paid expiry date.
- Failed or pending payment never grants or extends paid access.

Student creation and import have no plan-based numeric cap. Existing `maxStudents` configuration can be ignored during compatibility rollout and is removed from public and Superadmin controls. This change does not delete students or otherwise alter student records.

## Trial rules

Quiz and Enterprise trials share these rules:

- Duration is exactly 14 days from activation.
- Five included trial credits are granted at activation.
- Trial credits expire at the trial end, even if unused.
- Purchased lifetime credits are never consumed while trial credits remain.
- Trial expiry changes effective access to Marketplace and does not remove the listing or leads.
- Trial eligibility is recorded durably so changing phone formatting, browser, or plan cannot create repeated trials for the same institute/owner.
- A paid upgrade can occur during the trial. The paid billing period begins from the verified activation decision and receives the normal included-credit period.

## Quiz-credit wallet

The user-visible balance is composed of two distinct buckets:

1. **Included credits** — five credits for the active trial or billing month, with a required expiry timestamp.
2. **Lifetime credits** — purchased packs, preserved pre-migration balances, and explicit Superadmin lifetime adjustments, with no expiry.

Credit consumption is atomic and always spends included credits first. If included credits are insufficient, the same transaction consumes the remainder from lifetime credits. A quiz-generation request fails without changing either balance if the combined usable balance is insufficient or effective Quiz access is inactive.

For monthly paid plans, included credits refresh on the subscription anniversary. For yearly plans, they also refresh monthly on the subscription anniversary day. Plans starting on the 29th, 30th, or 31st use the last valid day in shorter months. A refresh resets the included balance to five rather than adding five, so unused included credits expire and cannot accumulate. Refresh operations use a unique period key and transaction so retries cannot grant twice.

The existing lifetime add-on packs remain unchanged:

| Credits | Price | Expiry |
| ---: | ---: | --- |
| 5 | ₹250 | Never |
| 10 | ₹500 | Never |
| 25 | ₹1,000 | Never |
| 40 | ₹1,500 | Never |

All purchase and manual-adjustment paths explicitly update the lifetime bucket and produce an audit record.

## Billing data and operations

Institute billing state records the canonical subscribed plan, billing cycle, start date, expiry date, trial state/end, permanent Marketplace entitlement, included-credit balance and expiry, lifetime-credit balance, and the next included-credit refresh.

The existing verified-payment flow remains the authority for paid activation. Order creation resolves amount from the server catalogue. Verification binds the provider order/subscription to the intended canonical product and billing cycle, validates the signature, prevents replay, and performs plan activation and credit granting transactionally.

Superadmin billing operations support:

- Immediate or scheduled canonical plan change.
- Trial inspection and approved extension where operationally necessary.
- Monthly/yearly cycle and subscription-date correction with reason and re-authentication.
- Lifetime-credit adjustment with reason.
- Payment reference inspection and audited manual reconciliation.
- Safe retry of failed scheduled operations.

Student-limit adjustment and legacy/custom plan selection are removed. Included credits are lifecycle-managed and are not edited as an ordinary manual balance.

## Communications

Plan lifecycle communications use paired email and approved WhatsApp templates for:

- Trial started.
- Paid plan activated.
- Renewal or expiry approaching.
- Payment due.
- Payment failed.
- Payment successful.
- Trial or plan expired and Marketplace fallback activated.

Messages use server-owned variables including owner name, institute name, canonical plan label, billing cycle, amount, expiry/due date, payment link, and support contact. Templates never rely on client-supplied amounts or dates.

The schedule is:

- Activation confirmation immediately.
- Expiry/renewal reminders 7, 3, and 1 day before expiry.
- Due/expired notice on the due date.
- Unpaid reminders 1, 3, and 7 days after the due date.
- All outstanding reminders cancelled or skipped immediately after verified payment.

A durable notification record is unique by institute, lifecycle event, effective date, and channel. This prevents duplicate sends after worker restart or retry. Existing `EmailJob` and `WhatsappJob` delivery infrastructure remains responsible for transport. Delivery status is visible in Superadmin and failed sends can be retried safely. Communication preferences are respected. Missing provider configuration records an actionable failed delivery without changing billing or access.

The repository includes email bodies, WhatsApp template definitions/variables, environment configuration documentation, and an operator checklist. Actual WhatsApp template registration and approval remain an external Meta dashboard step.

## Website and Superadmin

The public Home page, Marketplace ownership/upgrade journey, onboarding, account setup, Billing, upgrade prompts, and help documentation use the server catalogue and the same names, prices, benefits, trial language, and unlimited-student statement.

Superadmin plan filters and operations expose only Marketplace, Quiz, and Enterprise. Institute and revenue workspaces show:

- Subscribed plan and effective access.
- Monthly/yearly billing cycle.
- Trial, start, refresh, renewal, and expiry dates.
- Permanent Marketplace entitlement.
- Included credits, their expiry, lifetime credits, and combined usable balance.
- Payment, plan-operation, reminder, and delivery history.

Reports and activity entries use canonical plan names. Legacy plan ambiguity is not exposed to operators.

## Module boundaries

Implementation is divided into four focused server modules:

- **Plan catalogue:** immutable canonical product definitions, price resolution, display metadata, and legacy input normalization.
- **Entitlements:** pure calculation of effective access from canonical billing state and time.
- **Quiz-credit wallet:** balance projection, atomic consumption, period refresh, purchase grant, migration grant, and audit.
- **Subscription lifecycle:** trial activation, verified paid activation, expiry fallback, renewal scheduling, and lifecycle notification creation.

Controllers validate transport input and delegate to these modules. Middleware asks the entitlement module for access decisions. React components consume typed API contracts and do not reproduce pricing or entitlement logic.

## Failure handling and security

- Unknown plans or billing cycles are rejected before payment-order creation.
- A plan amount mismatch, provider signature failure, replay, or already-bound order is rejected without mutating access.
- Insufficient or inactive quiz access does not decrement credits.
- Concurrent quiz generation cannot overspend either credit bucket.
- Concurrent refresh workers cannot grant the same monthly allowance twice.
- A failed reminder does not fail or roll back plan activation.
- A failed activation communication remains retryable and visible to Superadmin.
- Superadmin billing mutations retain re-authentication, reason, idempotency, optimistic concurrency, and audit requirements.

## Existing-account migration

The migration is transactional, rerunnable where practical, and preceded by count and invariant checks.

For every existing institute it will:

1. Preserve its identity, students, admins, payments, quizzes, Marketplace listing, leads, and subscription dates.
2. Set its stored canonical plan to Enterprise.
3. Preserve existing start and expiry dates without inventing a new paid period.
4. Establish permanent Marketplace entitlement.
5. Copy the current aggregate `quizCredits` balance into lifetime credits.
6. Grant five included credits for the current period only when Enterprise access is active.
7. Leave already-expired accounts effectively in Marketplace access.
8. Leave accounts with no existing expiry as Enterprise without inventing an expiry.
9. Remove runtime student-cap enforcement without deleting or modifying student rows.

Before and after checks compare institute, admin, student, batch, payment, quiz, listing, lead, and review counts and verify that IDs remain present. The migration reports plan and credit totals for review. It must not run against the configured shared database until schema validation, migration tests, focused behavior tests, complete server/client tests, and production builds pass.

## Test strategy

Automated coverage includes:

- Exact catalogue names, prices, feature sets, trial terms, and API output.
- Legacy identifier normalization and rejection of unknown identifiers.
- Unlimited student creation/import for all applicable access levels.
- Trial eligibility, activation, five-credit grant, expiry, paid conversion, and Marketplace fallback.
- Monthly and annual anniversary refresh, short-month handling, expiry, and retry idempotency.
- Atomic included-first consumption and concurrent insufficient-balance behavior.
- Lifetime pack purchase, preservation, and inactive-subscription behavior.
- Server-authoritative Razorpay order amounts, signature verification, replay protection, and transactional activation.
- Reminder schedule, payment cancellation, channel preference, delivery deduplication, failure, and retry.
- Superadmin filters, plan operations, credit display/adjustment, audit, and removal of student-limit controls.
- Public Home, onboarding, setup, Billing, Marketplace upgrade, and expired-account UI copy.
- Migration fixtures covering each legacy plan/config combination, expired and non-expiring accounts, and existing credits.

Release verification requires Prisma format/validate/generate, migration tests, focused server tests, the complete server and client suites, lint/type checks, production builds, and a clean diff review. The shared database migration is applied only after a read-only preflight confirms the expected target and row counts.

## Acceptance criteria

- No customer-facing or Superadmin surface displays or creates a legacy plan.
- The three canonical plans have the approved prices and benefits everywhere.
- Quiz and Enterprise trials last 14 days and grant five expiring trial credits.
- Quiz and Enterprise paid periods refresh five non-accumulating included credits monthly.
- Purchased and migrated lifetime credits never expire and are spent after included credits.
- Marketplace entitlement remains active after trial/subscription expiry.
- All plan-supported student operations are unlimited by count.
- Existing institutes are Enterprise with preserved dates and preserved lifetime credits.
- Lifecycle email and WhatsApp reminders are scheduled once, observable, preference-aware, and safely retryable.
- No existing institute, student, payment, quiz, listing, lead, or review record is lost.
