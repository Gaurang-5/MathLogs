# Razorpay Recurring AutoPay for Monthly Plans

**Date:** 2026-08-17
**Status:** Approved for implementation planning

## Objective

Replace one-time Razorpay Orders for monthly Quiz and Enterprise purchases with a customer-authorized Razorpay Subscription. The mandate renews monthly until the customer cancels, supports every recurring payment method Razorpay makes available to that customer, and starts eligible customers with the existing 14-day trial and five expiring quiz credits.

This change does not alter the canonical three-plan catalogue or prices:

| Plan | Monthly | Yearly | Payment model |
| --- | ---: | ---: | --- |
| Marketplace | Not applicable | Not applicable | ₹99 one time; promotional activation is currently free |
| Quiz | ₹249 | ₹2,499 | Monthly recurring mandate; yearly one-time payment |
| Enterprise | ₹499 | ₹4,999 | Monthly recurring mandate; yearly one-time payment |

Marketplace activation, annual Quiz and Enterprise purchases, and lifetime quiz-credit packs remain one-time flows. All plans continue to allow unlimited students.

## Customer experience

Monthly Quiz and Enterprise checkout explains, before opening Razorpay, that the customer is authorizing automatic monthly renewal for up to 10 years and can cancel at any time. It displays the plan, monthly amount, trial eligibility, first expected charge date, and cancellation behavior.

Razorpay Checkout may offer any supported recurring method, including UPI AutoPay, cards, and eMandate. MathLogs does not force a single method. The provider controls which methods appear based on the customer's device, bank, account, and Razorpay configuration.

For an eligible customer:

1. MathLogs creates a subscription with a future `start_at` exactly 14 days after authorization and `total_count: 120`.
2. The customer completes Razorpay's recurring-payment authentication immediately.
3. Razorpay may collect and automatically refund its native mandate-authentication amount. MathLogs does not create or refund a separate ₹2 Order.
4. After verified authentication, MathLogs starts the 14-day trial and grants five trial quiz credits that expire at the trial end.
5. Razorpay attempts the first ₹249 or ₹499 plan charge at the end of the trial and renews monthly thereafter.

For a customer who has already used a Quiz or Enterprise trial, the subscription begins without another trial. Paid access is granted only after the first subscription charge is verified; opening Checkout or merely creating a subscription never grants it.

If mandate authentication is abandoned or fails, no trial or paid entitlement starts. The customer can safely retry without creating duplicate active subscriptions.

## Trial eligibility

The server remains the sole authority for trial eligibility. Quiz and Enterprise share the existing one-trial-per-institute/owner-identity rule. The browser cannot select, extend, or replay a trial by changing request data, phone formatting, plan, or billing cycle.

A trial claim is consumed only when the recurring mandate is verifiably authenticated. Creating an incomplete provider subscription does not consume the customer's trial. Authentication and the durable local claim are applied idempotently so a duplicated callback or webhook cannot grant another five credits.

For a customer who selects monthly billing before starting a trial, the recurring mandate must be authenticated before that trial begins. This does not remove the existing cycle-neutral trial entry point or change annual checkout into a subscription: a customer who starts a trial before choosing a renewal cycle can still convert afterward through either a yearly one-time Order or a monthly mandate, without receiving a second trial. A customer who chooses annual purchase immediately continues through the existing one-time Order flow.

## Provider catalogue and configuration

Razorpay Dashboard contains fixed monthly provider plans for:

- Quiz: ₹249 every month.
- Enterprise: ₹499 every month.

Their provider plan IDs are server-only environment configuration. The server maps the canonical plan to the configured provider plan ID and expected amount. It fails closed when an ID is absent, malformed, or mapped to the wrong product. Provider plan IDs, amounts, customer notes, or client-supplied values never override the canonical catalogue.

Subscriptions use:

- `total_count: 120`, representing a 10-year maximum authorization.
- A future `start_at` for an eligible 14-day trial.
- Immediate start for a customer without trial eligibility.
- `customer_notify: true` unless deployment validation proves that MathLogs-owned notifications must replace a conflicting provider notification.
- Minimal notes containing opaque internal binding identifiers, not authoritative prices or entitlements.

Reaching 120 completed monthly cycles ends the subscription. Continuing beyond 10 years requires the customer to explicitly authorize a new mandate; MathLogs never creates a replacement mandate silently.

## Checkout and API contract

The server chooses a checkout mode from the canonical product and billing cycle:

- `SUBSCRIPTION` for monthly Quiz or Enterprise.
- `ORDER` for yearly Quiz or Enterprise and lifetime credit packs.
- Promotional Marketplace activation without Razorpay while the current free offer is enabled.

Monthly session creation determines trial eligibility, creates and durably records the subscription attempt, and then returns only the public Razorpay key, provider subscription ID, display metadata, and first expected charge date. The browser initializes Checkout with `subscription_id`, never `order_id`, for this mode.

The Checkout handler returns `razorpay_payment_id`, `razorpay_subscription_id`, and `razorpay_signature`. The server verifies the subscription-checkout signature using Razorpay's documented field order and secret, fetches the provider objects, and checks the stored subscription binding. Client success is treated as a prompt to verify or refresh state, not as an entitlement decision.

Order and subscription payloads use a tagged response contract so clients cannot accidentally send a subscription to an Order verifier. Public onboarding, Superadmin-invite onboarding, and the authenticated Billing page use the same server subscription service instead of independently implementing payment rules.

## Durable subscription record

Add an explicit subscription record rather than overloading the existing Order-oriented `BillingPayment` and `OnboardingPayment` rows. The record contains:

- A unique internal attempt ID and unique provider subscription ID.
- The institute ID when one already exists, or a single-use onboarding binding until provisioning completes.
- Canonical plan and `MONTHLY` billing cycle.
- Expected provider plan ID, amount, currency, and total count.
- Trial eligibility decision, intended trial start/end, and trial-claim state.
- Provider lifecycle status: created, authenticated, active, pending, halted, cancelled, completed, or expired.
- First-charge time, current paid-period start/end, next charge, and last successful charge.
- Payment-failure and grace timestamps.
- Cancellation request, effective cancellation time, and whether cancellation is immediate or end-of-period.
- Provider-created timestamp plus local created/updated timestamps.

Provider payment IDs are recorded uniquely against the subscription so one charge can grant only one billing period and one included-credit refresh. The existing webhook-event ledger remains the first line of duplicate-event protection.

`Institute.razorpaySubscriptionId` remains the current active binding for quick lookup, but it is not the only history. It is cleared only after the subscription is conclusively ended and the final entitlement boundary has been enforced.

## Authoritative lifecycle

Webhooks are the primary provider-state input. Checkout verification gives the customer an immediate response, but it runs the same idempotent state transition used by webhooks. The lifecycle handles at least:

- `subscription.authenticated`: record the authorized mandate. If this is an eligible, unclaimed trial, atomically claim the trial, activate it, and grant five expiring credits.
- `subscription.activated`: record active provider state. Do not independently grant another period if the corresponding charge was already handled.
- `subscription.charged`: verify the subscription, provider plan, payment, amount, and stored binding; then activate or extend the paid monthly period and refresh five included credits exactly once for that billing period.
- `subscription.pending`: record payment failure, begin the three-day grace window when needed, notify the customer, and retain paid features only through the approved grace boundary.
- `subscription.halted`: record that automatic retries are exhausted. Paid access ends at the later of the already-paid entitlement end and the applicable three-day grace end, then falls back to Marketplace.
- `subscription.cancelled`: apply the pre-charge or paid-period cancellation rule below.
- Provider completion or expiry: preserve already-earned access until its boundary, then fall back to Marketplace.

Unknown subscription IDs, mismatched provider plan IDs, wrong amounts, replayed charge IDs, and invalid signatures are recorded for investigation but cannot mutate entitlements.

## Cancellation behavior

Customers can request cancellation from MathLogs, and they may also revoke a mandate in their bank or payment app.

- During an authenticated trial before the first plan charge, MathLogs requests immediate provider cancellation. The customer owes no plan charge. Their already-started trial and its credits remain available only until the original trial end, then effective access falls back to Marketplace.
- During an active paid month, MathLogs requests cancellation at cycle end. Paid access remains through the stored current-period end, and no further renewal is expected.
- A provider-side mandate revocation is detected through `subscription.cancelled` and reconciled using the same rules.

The cancellation API does not immediately erase the provider subscription ID or paid entitlement. Repeated cancellation requests are idempotent and return the already-known effective end date.

## Payment failure and grace

When a first or later debit fails, the subscription becomes pending and Razorpay performs its configured retries. MathLogs sends an immediate payment-failed message and shows the payment state and recovery action in Billing.

The approved grace period is three days. It never shortens a period that was already paid:

- A failed first post-trial charge leaves trial access until the original trial end and may extend paid-feature access only through the explicit three-day grace boundary.
- A failed renewal retains paid access through the paid period end and, if later, through three days from the failed renewal.
- A successful retry before enforcement atomically activates the next paid period, clears failure/grace state, and cancels outstanding failure reminders.
- If retries are exhausted or the grace boundary passes without a verified charge, Quiz/Enterprise access stops and Marketplace remains available.

A scheduled lifecycle reconciler enforces trial, paid-period, and grace expiries even when a webhook is delayed or missed. It fetches provider state before making a failure-based downgrade where practical. Reconciliation and webhooks use the same locking, unique keys, and transition service so they cannot double-charge credits or regress a newer state.

## Onboarding and account provisioning

Both public and invite-based onboarding can create a subscription before an institute exists. A durable onboarding binding stores the minimum validated setup payload and links it to exactly one subscription attempt. Account provisioning occurs only after:

- verified mandate authentication for an eligible trial; or
- a verified first charge when no trial applies.

Provisioning and binding the resulting institute are transactional and retryable. Replayed callbacks return the existing provisioned result instead of creating another institute, admin, trial claim, or subscription. Expired or consumed onboarding links cannot be used to bind a different customer.

Superadmin-created institutes are not silently enrolled in AutoPay. Superadmin can send an onboarding or upgrade invitation, but the owner must complete recurring-payment authorization personally.

## Existing customers and migration

The database change is additive and data-preserving. It does not rewrite historical payments, delete subscriptions, reset the database, or attempt to manufacture consent.

Existing customers whose monthly access was purchased through a one-time Order keep their current access and expiry. At their next renewal they are shown the new mandate checkout and must explicitly authorize AutoPay. They are not automatically enrolled, and they do not receive a second trial.

Existing valid Razorpay subscription IDs, if any, are imported only after provider reconciliation proves their plan, customer, and status. Ambiguous records remain untouched for Superadmin review rather than receiving inferred entitlements.

## Communications and operations

Email and WhatsApp lifecycle messages cover:

- Mandate authorized and trial started, including first charge date.
- AutoPay activated after the first successful charge.
- Upcoming monthly debit.
- Payment failed and retry pending.
- Grace period ending.
- Payment recovered.
- AutoPay halted and Marketplace fallback.
- Cancellation requested and its effective date.
- Subscription completed after 120 cycles.

Existing channel preferences, durable delivery records, approved WhatsApp templates, retry behavior, and Superadmin visibility remain in force. Provider notifications may supplement MathLogs messages, but MathLogs owns the canonical wording for plan access and grace.

Superadmin billing detail shows mandate method when supplied by Razorpay, provider state, next charge, paid-period end, grace end, cancellation state, and recent subscription payments. Operators can reconcile or retry safe internal processing but cannot create customer consent, forge a successful charge, or replace provider verification with a manual plan edit.

## Security, concurrency, and failure handling

- Provider secrets and plan IDs remain server-side; only the public key and attempt-specific Checkout identifier reach the browser.
- Every callback and webhook signature is checked against the exact raw payload or documented subscription signature contract.
- Local records bind subscription ID, provider plan ID, canonical plan, amount, currency, customer/onboarding context, and institute.
- Charge fulfillment is transactional, keyed by unique provider payment and billing period, and safe under concurrent webhook, callback, and reconciliation execution.
- A provider API timeout returns a retryable status without granting access.
- Notification failure never rolls back a verified billing transition.
- Provider cancellation failure leaves local renewal state unchanged and presents a retryable error rather than pretending cancellation succeeded.
- Logs and audits exclude secrets, full payment credentials, and unnecessary personal data.
- Existing Order verification and webhook behavior remain isolated from the new subscription path.

## Testing strategy

Automated tests cover:

- Exact Quiz and Enterprise provider-plan mapping, monthly amounts, `total_count: 120`, and server-owned configuration.
- Every recurring method being allowed rather than a UPI-only restriction.
- Eligible 14-day subscription creation and ineligible immediate-start creation.
- Authentication success, abandonment, invalid signature, mismatched subscription, and provider-fetch failure.
- Single-use trial claim and exactly one five-credit trial grant under duplicate and concurrent events.
- First charge, monthly renewal, included-credit refresh, payment replay, wrong amount, and wrong provider plan.
- Pending payment, retry recovery, three-day grace, halted state, and Marketplace fallback.
- Customer cancellation during trial, paid-period cancellation, provider-side mandate revocation, and idempotent repeat cancellation.
- Completion after 120 cycles and explicit reauthorization for any continuation.
- Public onboarding, invite onboarding, authenticated Billing, and Superadmin visibility.
- Tagged Order-versus-Subscription API contracts and unchanged annual, Marketplace, and lifetime-credit flows.
- Existing monthly one-time customer transition without silent enrollment or a repeated trial.
- Webhook delay, reordering, duplication, reconciliation, and concurrent processing.
- Communication scheduling, deduplication, preference enforcement, failure, and recovery cancellation.

Release verification requires Prisma format, validate, and generate; migration tests against an isolated disposable schema; focused billing, onboarding, lifecycle, webhook, credit, entitlement, communication, and client tests; complete server and client test suites; type checks; changed-file lint; production builds; and `git diff --check`.

## Rollout and rollback

Before release, create and verify the two fixed Razorpay monthly plans in the correct provider mode, configure their IDs and webhook secret, enable the required subscription events, and confirm the account supports the desired recurring methods.

Roll out subscription creation behind a server-owned flag while webhook ingestion and read-only reconciliation are active. Validate a test-mode eligible trial, an immediate first charge, cancellation, a simulated failure/retry, and all three onboarding surfaces before enabling production monthly creation.

Rollback disables new subscription creation and restores the existing renewal prompt. It does not cancel already-authorized customer mandates. Existing subscription webhooks, reconciliation, cancellation, and entitlement enforcement must remain running until every live mandate is ended or migrated safely.

No shared or production database reset, forced push, destructive migration, or deletion is part of this design.

## Acceptance criteria

- Every new monthly Quiz or Enterprise customer explicitly authorizes a Razorpay recurring mandate.
- Checkout permits any recurring method Razorpay supports for the customer.
- Eligible customers receive one 14-day trial and five expiring credits only after mandate authentication.
- The first monthly plan debit occurs after the trial; ineligible customers are charged before paid access.
- Monthly renewal continues until cancellation or the 120-cycle limit.
- Trial cancellation causes no plan charge; paid cancellation preserves the paid period.
- Failed debits use provider retries and the approved three-day grace, then fall back to Marketplace when unresolved.
- Duplicate, reordered, or concurrent provider events cannot duplicate access periods or credits.
- Existing customers retain their current access and must explicitly authorize AutoPay at renewal.
- Annual plans, Marketplace, lifetime credit purchases, customer data, and historical payments remain unchanged.
