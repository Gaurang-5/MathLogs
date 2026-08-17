# Razorpay Recurring AutoPay Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make every new monthly Quiz and Enterprise purchase use a customer-authorized Razorpay recurring mandate with a 14-day eligible trial, verified renewals, cancellation, and three-day payment-failure grace.

**Architecture:** Keep one-time Orders intact and introduce a separate durable subscription aggregate. A provider adapter owns Razorpay calls and signature rules; checkout, provisioning, lifecycle transitions, and reconciliation are separate services that share transactional locks and unique provider bindings. All three clients consume one tagged `ORDER | SUBSCRIPTION | ACTIVATED` checkout contract, while webhooks remain the authoritative lifecycle input.

**Tech Stack:** Node.js 25, TypeScript 5.9, Express 5, Prisma 5.22/PostgreSQL, Razorpay Node SDK 2.9, React 19, Vite 7, Vitest 3, Node test runner.

## Global Constraints

- Monthly Quiz costs ₹249 and monthly Enterprise costs ₹499; resolve both from the canonical server catalogue.
- Monthly subscriptions use `total_count: 120`, allow every recurring payment method Razorpay offers, and renew until cancellation or completion.
- Eligible monthly customers authenticate the mandate now and receive a 14-day trial plus five expiring quiz credits; the first plan debit is scheduled after the trial.
- A customer without trial eligibility receives no paid entitlement until the first subscription charge is verified.
- Trial cancellation causes no plan charge and preserves only the original trial window; paid cancellation takes effect at the current paid-period end.
- An unresolved debit failure receives a three-day grace period, after which effective access falls back to Marketplace.
- Yearly plans, lifetime quiz-credit packs, and Marketplace remain on their existing one-time or promotional paths.
- Existing monthly one-time customers keep current access and explicitly authorize AutoPay at renewal; never manufacture consent or grant a second trial.
- Use Razorpay's native mandate-authentication transaction; never create a separate ₹2 Order or manual refund.
- Database work is additive and data-preserving. Never reset, force-push, truncate, or delete production/customer data.
- `RAZORPAY_SUBSCRIPTIONS_ENABLED` is fail-closed: only exact normalized `true` enables new subscription creation. Webhook processing, reconciliation, and cancellation remain available after creation is disabled.
- The approved design is `docs/superpowers/specs/2026-08-17-razorpay-recurring-autopay-design.md`.

## File and responsibility map

- `server/prisma/schema.prisma`: durable subscription, successful charge, and webhook binding records.
- `server/prisma/migrations/20260817150000_razorpay_recurring_autopay/migration.sql`: additive tables, foreign keys, checks, and partial unique indexes.
- `server/src/services/planSubscriptionProvider.ts`: fixed provider-plan mapping, feature flag, Razorpay adapter, and checkout signature verification.
- `server/src/services/accountProvisioningService.ts`: transaction-safe institute/invite provisioning shared by Order and Subscription onboarding.
- `server/src/services/planSubscriptionCheckoutService.ts`: create/recover a monthly subscription attempt and verify the Checkout callback.
- `server/src/services/planSubscriptionLifecycleService.ts`: idempotent authenticated/charged/pending/halted/cancelled/completed transitions and charge fulfillment.
- `server/src/services/planSubscriptionReconciliationService.ts`: provider reconciliation and due grace/period enforcement.
- `server/src/controllers/billingController.ts`: tagged authenticated checkout, verification, status, and cancellation endpoints.
- `server/src/controllers/onboardingController.ts`: tagged public onboarding checkout and verification.
- `server/src/controllers/adminOnboardingController.ts`: tagged invite onboarding checkout and verification.
- `server/src/controllers/billingWebhookController.ts`: raw-signature verification, bounded subscription projection, and lifecycle dispatch.
- `server/src/services/planNotificationService.ts`: AutoPay lifecycle templates and deduplicated schedules.
- `server/src/services/superAdminBillingProvider.ts` and `server/src/services/superAdminRevenueService.ts`: operational subscription state and payment visibility.
- `client/src/features/billing/checkout.ts`: shared tagged checkout types and Razorpay option builder.
- `client/src/pages/Billing.tsx`, `client/src/pages/Onboarding.tsx`, `client/src/pages/JoinOnboarding.tsx`: subscription-aware monthly UX.

---

### Task 1: Add the durable subscription schema

**Files:**
- Modify: `server/prisma/schema.prisma`
- Create: `server/prisma/migrations/20260817150000_razorpay_recurring_autopay/migration.sql`
- Create: `server/tests/planSubscriptionMigration.test.ts`

**Interfaces:**
- Produces: Prisma models `PlanSubscription` and `PlanSubscriptionCharge`; nullable `BillingWebhookEvent.planSubscriptionId`.
- Produces: at most one open subscription per institute and at most one open pre-provision subscription per owner identity.

- [ ] **Step 1: Write an isolated migration test that proves additive and rerunnable behavior**

```ts
const migrationSql = readFileSync(
  resolve('prisma/migrations/20260817150000_razorpay_recurring_autopay/migration.sql'),
  'utf8'
);
const applyRecurringMigration = (db: Client) => db.query(migrationSql);
const hasIndex = async (db: Client, name: string) => (await db.query(
  'SELECT 1 FROM pg_indexes WHERE schemaname = current_schema() AND indexname = $1', [name]
)).rowCount === 1;

test('recurring migration preserves institutes and creates guarded subscription tables', async () => {
  const before = await db.query('SELECT id FROM "Institute" ORDER BY id');
  await applyRecurringMigration(db);
  await applyRecurringMigration(db);
  assert.deepEqual((await db.query('SELECT id FROM "Institute" ORDER BY id')).rows, before.rows);
  assert.equal(await hasUniqueIndex(db, 'PlanSubscription_providerSubscriptionId_key'), true);
  assert.equal(await hasIndex(db, 'PlanSubscription_one_open_institute'), true);
  assert.equal(await hasIndex(db, 'PlanSubscriptionCharge_one_period'), true);
});
```

- [ ] **Step 2: Run the test and confirm RED**

Run: `cd server && npx tsx --test --test-force-exit tests/planSubscriptionMigration.test.ts`

Expected: FAIL because the migration and `PlanSubscription` table do not exist.

- [ ] **Step 3: Add the Prisma models and relations**

Use these field names so later tasks share one contract:

```prisma
model PlanSubscription {
  id                     String                   @id @default(uuid())
  instituteId            String?
  onboardingLinkId       String?
  ownerIdentityHash      String                   @db.VarChar(128)
  providerSubscriptionId String?                  @unique
  providerPlanId         String
  plan                   Tier
  billingCycle           BillingCycle             @default(MONTHLY)
  amountPaise            Int
  currency               String                   @default("INR")
  totalCount             Int                      @default(120)
  trialEligible          Boolean                  @default(false)
  trialClaimedAt         DateTime?
  intendedStartAt        DateTime
  trialEndsAt            DateTime?
  status                 String                   @default("CREATING")
  providerCreatedAt      DateTime?
  firstChargedAt         DateTime?
  lastChargedAt          DateTime?
  currentPeriodStart     DateTime?
  currentPeriodEnd       DateTime?
  nextChargeAt           DateTime?
  paymentFailedAt        DateTime?
  graceEndsAt            DateTime?
  cancelRequestedAt      DateTime?
  cancelAtPeriodEnd      Boolean                  @default(false)
  cancelEffectiveAt      DateTime?
  endedAt                DateTime?
  provisioningData       Json?
  createdAt              DateTime                 @default(now())
  updatedAt              DateTime                 @updatedAt
  institute              Institute?               @relation(fields: [instituteId], references: [id], onDelete: Restrict)
  charges                PlanSubscriptionCharge[]
  webhookEvents          BillingWebhookEvent[]

  @@index([status, nextChargeAt])
  @@index([status, graceEndsAt])
  @@index([onboardingLinkId])
  @@index([ownerIdentityHash, createdAt])
}

model PlanSubscriptionCharge {
  id                     String           @id @default(uuid())
  planSubscriptionId     String
  providerPaymentId      String           @unique
  providerInvoiceId      String?          @unique
  amountPaise            Int
  currency               String           @default("INR")
  periodStart            DateTime
  periodEnd              DateTime
  creditedAt             DateTime?
  createdAt              DateTime         @default(now())
  updatedAt              DateTime         @updatedAt
  subscription           PlanSubscription @relation(fields: [planSubscriptionId], references: [id], onDelete: Restrict)

  @@unique([planSubscriptionId, periodStart], name: "PlanSubscriptionCharge_one_period")
  @@index([planSubscriptionId, createdAt])
}
```

Add `planSubscriptions PlanSubscription[]` to `Institute`, and add `planSubscriptionId String?` plus its relation/index to `BillingWebhookEvent`.

- [ ] **Step 4: Write additive SQL with database-level invariants**

The migration must use `CREATE TABLE IF NOT EXISTS`, conditional enum-safe foreign keys, `CHECK ("billingCycle" = 'MONTHLY')`, `CHECK ("totalCount" = 120)`, `CHECK ("amountPaise" IN (24900, 49900))`, and partial unique indexes over open statuses `CREATING`, `CREATED`, `AUTHENTICATED`, `ACTIVE`, `PENDING`, `PROVIDER_UNKNOWN`:

```sql
CREATE UNIQUE INDEX IF NOT EXISTS "PlanSubscription_one_open_institute"
ON "PlanSubscription" ("instituteId")
WHERE "instituteId" IS NOT NULL AND status IN ('CREATING','CREATED','AUTHENTICATED','ACTIVE','PENDING','PROVIDER_UNKNOWN');

CREATE UNIQUE INDEX IF NOT EXISTS "PlanSubscription_one_open_owner"
ON "PlanSubscription" ("ownerIdentityHash")
WHERE "instituteId" IS NULL AND status IN ('CREATING','CREATED','AUTHENTICATED','ACTIVE','PENDING','PROVIDER_UNKNOWN');
```

- [ ] **Step 5: Validate schema and migration GREEN**

Run:

```bash
cd server
npx prisma format
npx prisma validate
npx prisma generate
npx tsx --test --test-force-exit tests/planSubscriptionMigration.test.ts
npx tsc --noEmit
```

Expected: all commands PASS; the test drops only its randomized disposable schema.

- [ ] **Step 6: Commit**

```bash
git add server/prisma/schema.prisma server/prisma/migrations/20260817150000_razorpay_recurring_autopay/migration.sql server/tests/planSubscriptionMigration.test.ts
git commit -m "feat: add recurring subscription persistence"
```

### Task 2: Add the provider configuration and adapter boundary

**Files:**
- Create: `server/src/services/planSubscriptionProvider.ts`
- Create: `server/tests/planSubscriptionProvider.test.ts`
- Modify: `server/src/utils/env.ts`
- Modify: `server/.env.example`

**Interfaces:**
- Produces: `getMonthlySubscriptionProduct(plan, env?)` returning `{ plan, providerPlanId, amountPaise, currency: 'INR', totalCount: 120 }`.
- Produces: `verifySubscriptionCheckoutSignature(paymentId, subscriptionId, signature, secret?)`.
- Produces: injectable `PlanSubscriptionProvider` with `create`, `fetchSubscription`, `fetchPayment`, and `cancel` methods.

- [ ] **Step 1: Write failing provider-boundary tests**

```ts
test('maps only approved monthly plans and fails closed', () => {
  const env = { RAZORPAY_PLAN_QUIZ_MONTHLY: 'plan_quiz', RAZORPAY_PLAN_ENTERPRISE_MONTHLY: 'plan_enterprise' };
  assert.deepEqual(getMonthlySubscriptionProduct('QUIZ', env), {
    plan: 'QUIZ', providerPlanId: 'plan_quiz', amountPaise: 24900, currency: 'INR', totalCount: 120
  });
  assert.throws(() => getMonthlySubscriptionProduct('MARKETPLACE', env), /INVALID_SUBSCRIPTION_PLAN/);
  assert.throws(() => getMonthlySubscriptionProduct('QUIZ', {}), /SUBSCRIPTION_PLAN_NOT_CONFIGURED/);
});

test('verifies payment_id pipe subscription_id in documented order', () => {
  const signature = crypto.createHmac('sha256', 'secret').update('pay_1|sub_1').digest('hex');
  assert.equal(verifySubscriptionCheckoutSignature('pay_1', 'sub_1', signature, 'secret'), true);
  assert.equal(verifySubscriptionCheckoutSignature('pay_1', 'sub_2', signature, 'secret'), false);
});
```

- [ ] **Step 2: Run RED**

Run: `cd server && npx tsx --test --test-force-exit tests/planSubscriptionProvider.test.ts`

Expected: FAIL because `planSubscriptionProvider` does not exist.

- [ ] **Step 3: Implement fail-closed configuration and adapter**

```ts
export interface PlanSubscriptionProvider {
  create(input: { planId: string; totalCount: 120; startAt?: Date; customerNotify: true; notes: Record<string, string> }): Promise<ProviderSubscription>;
  fetchSubscription(id: string): Promise<ProviderSubscription>;
  fetchPayment(id: string): Promise<ProviderPayment>;
  findByAttemptId(attemptId: string): Promise<ProviderSubscription[]>;
  cancel(id: string, cancelAtCycleEnd: boolean): Promise<ProviderSubscription>;
}

export function subscriptionsCreationEnabled(env = process.env): boolean {
  return env.RAZORPAY_SUBSCRIPTIONS_ENABLED?.trim().toLowerCase() === 'true';
}
```

The Razorpay implementation calls `razorpay.subscriptions.create`, `.fetch`, `.all`, and `.cancel`. `findByAttemptId` searches at most 100 recent provider subscriptions for the opaque `attemptId` note and is used only to repair an uncertain creation response; reaching that bound without a unique match raises an operator-visible reconciliation error. Always send `customer_notify: true`. Do not pass a Checkout `method` option; that allows every provider-supported recurring method. Convert all provider timestamps from epoch seconds at this boundary.

- [ ] **Step 4: Document exact environment keys**

Add these disabled defaults to `server/.env.example` without real IDs or secrets:

```dotenv
RAZORPAY_SUBSCRIPTIONS_ENABLED=false
RAZORPAY_PLAN_QUIZ_MONTHLY=
RAZORPAY_PLAN_ENTERPRISE_MONTHLY=
RAZORPAY_WEBHOOK_SECRET=
```

- [ ] **Step 5: Run GREEN and commit**

Run: `cd server && npx tsx --test --test-force-exit tests/planSubscriptionProvider.test.ts tests/billingPlans.test.ts && npx tsc --noEmit`

```bash
git add server/src/services/planSubscriptionProvider.ts server/src/utils/env.ts server/.env.example server/tests/planSubscriptionProvider.test.ts
git commit -m "feat: add Razorpay subscription provider boundary"
```

### Task 3: Extract reusable account provisioning

**Files:**
- Create: `server/src/services/accountProvisioningService.ts`
- Create: `server/tests/accountProvisioningService.test.ts`
- Modify: `server/src/services/onboardingPaymentService.ts`
- Modify: `server/src/controllers/onboardingController.ts`
- Modify: `server/src/controllers/adminOnboardingController.ts`

**Interfaces:**
- Produces: `ProvisioningInput` tagged as `PUBLIC` or `INVITE`.
- Produces: `provisionInstitute(tx, input, activation): Promise<{ instituteId: string; inviteToken: string | null }>`.
- Preserves: current Order onboarding behavior and its replay/consumed-link responses.

- [ ] **Step 1: Write RED tests for transactional provisioning and replay**

```ts
test('public provisioning creates one institute and invite', async () => {
  const first = await service.provision(input, paidActivation);
  const replay = await service.provision(input, paidActivation);
  assert.equal(replay.instituteId, first.instituteId);
  assert.equal(await prisma.institute.count({ where: { phoneNumber: input.phone } }), 1);
});

test('invite provisioning atomically consumes only its bound link', async () => {
  const result = await service.provision(inviteInput, trialActivation);
  assert.equal((await prisma.adminOnboardingLink.findUniqueOrThrow({ where: { id: inviteId } })).instituteId, result.instituteId);
});
```

- [ ] **Step 2: Run RED**

Run: `cd server && npx tsx --test --test-force-exit tests/accountProvisioningService.test.ts`

Expected: FAIL because the reusable provisioning service is missing.

- [ ] **Step 3: Extract one typed input and transaction helper**

```ts
export type ProvisioningInput = {
  kind: 'PUBLIC' | 'INVITE'; onboardingLinkId?: string;
  instituteName: string; ownerName: string; phone: string; email: string;
  marketplace: { listed: boolean; city?: string; area?: string; subjects?: string[]; googleMapsUrl?: string };
};

export type ProvisioningActivation =
  | { kind: 'TRIAL'; plan: 'QUIZ' | 'ENTERPRISE'; startsAt: Date; endsAt: Date; ownerIdentityHash: string }
  | { kind: 'PAID'; plan: 'QUIZ' | 'ENTERPRISE'; billingCycle: 'MONTHLY' | 'YEARLY'; startsAt: Date; endsAt: Date }
  | { kind: 'MARKETPLACE'; startsAt: Date };
```

Move slug allocation, institute creation, invite creation, link claiming, and initial plan/credit fields into this service. Accept a Prisma transaction client so subscription lifecycle processing can provision and bind atomically.

- [ ] **Step 4: Route existing Order provisioning through the extracted service**

Keep `verifyAndClaimOnboardingPayment` and Order signatures unchanged. `provisionClaimedOnboardingPayment` translates its stored JSON into `ProvisioningInput` and invokes the new service.

- [ ] **Step 5: Run focused regression tests GREEN**

Run:

```bash
cd server
npx tsx --test --test-force-exit tests/accountProvisioningService.test.ts tests/superAdminOnboarding.test.ts tests/superAdminOnboardingContract.test.ts tests/api.integration.test.ts
npx tsc --noEmit
```

- [ ] **Step 6: Commit**

```bash
git add server/src/services/accountProvisioningService.ts server/src/services/onboardingPaymentService.ts server/src/controllers/onboardingController.ts server/src/controllers/adminOnboardingController.ts server/tests/accountProvisioningService.test.ts
git commit -m "refactor: share onboarding account provisioning"
```

### Task 4: Create and verify monthly subscription checkout attempts

**Files:**
- Create: `server/src/services/planSubscriptionCheckoutService.ts`
- Create: `server/tests/planSubscriptionCheckoutService.test.ts`
- Modify: `server/src/services/subscriptionLifecycleService.ts`

**Interfaces:**
- Consumes: Task 1 models, Task 2 provider/config, Task 3 `ProvisioningInput` JSON shape.
- Produces: `createMonthlySubscriptionCheckout(input): Promise<SubscriptionCheckoutSession>`.
- Produces: `verifyMonthlySubscriptionCheckout(input): Promise<PlanSubscription>`.
- Produces: `hashTrialOwnerIdentity(identity, secret?)` exported from `subscriptionLifecycleService.ts`.

- [ ] **Step 1: Write RED tests for trial, immediate billing, deduplication, and ambiguous provider failure**

```ts
test('eligible checkout schedules 14 days and 120 cycles', async () => {
  const session = await service.createMonthlySubscriptionCheckout({
    context: { kind: 'INSTITUTE', instituteId, ownerIdentity: '9999999999' }, plan: 'QUIZ', now
  });
  assert.equal(session.mode, 'SUBSCRIPTION');
  assert.equal(session.trialEligible, true);
  assert.equal(session.firstChargeAt.toISOString(), '2026-08-31T00:00:00.000Z');
  assert.equal(provider.createCalls[0].planId, 'plan_quiz');
  assert.equal(provider.createCalls[0].totalCount, 120);
});

test('used trial starts immediately but grants nothing before charge', async () => {
  const session = await service.createMonthlySubscriptionCheckout(usedTrialInput);
  assert.equal(session.trialEligible, false);
  assert.equal((await prisma.institute.findUniqueOrThrow({ where: { id: instituteId } })).plan, 'MARKETPLACE');
});

test('an existing paid one-time month schedules AutoPay at its current expiry', async () => {
  const session = await service.createMonthlySubscriptionCheckout(existingPaidInput);
  assert.equal(session.trialEligible, false);
  assert.equal(session.firstChargeAt.toISOString(), currentPlanExpiry.toISOString());
});

test('a different plan is rejected while another mandate is open', async () => {
  await service.createMonthlySubscriptionCheckout(quizInput);
  await assert.rejects(() => service.createMonthlySubscriptionCheckout(enterpriseInput), /ACTIVE_SUBSCRIPTION_EXISTS/);
});

test('provider timeout becomes PROVIDER_UNKNOWN and retry does not create another mandate', async () => {
  await assert.rejects(() => service.createMonthlySubscriptionCheckout(input), /SUBSCRIPTION_PROVIDER_UNCERTAIN/);
  await assert.rejects(() => service.createMonthlySubscriptionCheckout(input), /SUBSCRIPTION_RECONCILIATION_REQUIRED/);
  assert.equal(provider.createCalls.length, 1);
});
```

- [ ] **Step 2: Run RED**

Run: `cd server && npx tsx --test --test-force-exit tests/planSubscriptionCheckoutService.test.ts`

- [ ] **Step 3: Implement the tagged session and persistent attempt-first workflow**

```ts
export type SubscriptionCheckoutSession = {
  mode: 'SUBSCRIPTION'; attemptId: string; subscriptionId: string; keyId: string;
  plan: 'QUIZ' | 'ENTERPRISE'; billingCycle: 'MONTHLY'; amount: number;
  currency: 'INR'; trialEligible: boolean; firstChargeAt: Date; totalCount: 120;
};

export type CheckoutContext =
  | { kind: 'INSTITUTE'; instituteId: string; ownerIdentity: string }
  | { kind: 'PUBLIC_ONBOARDING'; ownerIdentity: string; provisioning: ProvisioningInput }
  | { kind: 'INVITE_ONBOARDING'; onboardingLinkId: string; ownerIdentity: string; provisioning: ProvisioningInput };
```

Create the local row before the provider call. Put only `attemptId` and context kind in Razorpay notes. On a definite provider rejection set `PROVIDER_FAILED`; on a timeout/unknown result set `PROVIDER_UNKNOWN` and require reconciliation. Reuse an existing open same-plan attempt rather than creating a second provider subscription, and reject a different-plan attempt while a mandate is open. For an existing one-time monthly customer with future paid expiry, use that expiry as `start_at` without granting another trial; otherwise an ineligible subscription starts immediately.

- [ ] **Step 4: Implement callback verification without granting access**

Verify `payment_id|subscription_id`, fetch both provider entities, and match the payment's subscription binding plus the stored provider plan/currency. The Checkout payment may be Razorpay's small refundable mandate-authentication transaction, so do not compare its amount with ₹249/₹499 and never treat it as a paid billing period. Return the verified stored row without granting entitlement in this intermediate commit. Task 5 wires this verified result into the authoritative lifecycle transition before any controller exposes the flow.

- [ ] **Step 5: Run GREEN and commit**

Run: `cd server && npx tsx --test --test-force-exit tests/planSubscriptionCheckoutService.test.ts tests/subscriptionLifecycle.test.ts && npx tsc --noEmit`

```bash
git add server/src/services/planSubscriptionCheckoutService.ts server/src/services/subscriptionLifecycleService.ts server/tests/planSubscriptionCheckoutService.test.ts
git commit -m "feat: create recurring checkout attempts"
```

### Task 5: Implement the authoritative subscription lifecycle and reconciliation

**Files:**
- Create: `server/src/services/planSubscriptionLifecycleService.ts`
- Create: `server/src/services/planSubscriptionReconciliationService.ts`
- Create: `server/tests/planSubscriptionLifecycleService.test.ts`
- Create: `server/tests/planSubscriptionConcurrency.test.ts`
- Modify: `server/src/services/planSubscriptionCheckoutService.ts`
- Modify: `server/src/controllers/billingWebhookController.ts`
- Modify: `server/src/index.ts`

**Interfaces:**
- Consumes: `PlanSubscription`, provider adapter, and `provisionInstitute`.
- Produces: `applySubscriptionEvent(event, now?)` and `reconcileDueSubscriptions(now?, take?)`.
- Produces: bounded `SanitizedBillingWebhook` fields `providerPlanId`, `providerStatus`, `currentStart`, `currentEnd`, and `chargeAt`.

- [ ] **Step 1: Write lifecycle RED tests**

Cover these exact transitions:

```ts
await lifecycle.applySubscriptionEvent(authenticatedEvent, now);
assert.equal((await institute()).trialEndsAt?.toISOString(), trialEnd.toISOString());
assert.equal((await institute()).includedQuizCredits, 5);

await Promise.all([charged(), charged()]);
assert.equal(await prisma.planSubscriptionCharge.count({ where: { providerPaymentId: 'pay_1' } }), 1);
assert.equal((await institute()).planExpiryDate?.toISOString(), '2026-09-30T00:00:00.000Z');

await lifecycle.applySubscriptionEvent(pendingEvent, failedAt);
assert.equal((await subscription()).graceEndsAt?.toISOString(), addDays(failedAt, 3).toISOString());

await lifecycle.applySubscriptionEvent(cancelledDuringTrial, cancelledAt);
assert.equal((await institute()).trialEndsAt?.toISOString(), originalTrialEnd.toISOString());

await lifecycle.applySubscriptionEvent(completedAfterCycle120, completedAt);
assert.equal((await subscription()).status, 'COMPLETED');
assert.equal((await subscription()).endedAt?.toISOString(), completedAt.toISOString());
```

Also assert wrong amount, wrong provider plan, unknown subscription, reordered older status, and duplicate period are rejected without institute mutation.

- [ ] **Step 2: Run RED**

Run: `cd server && npx tsx --test --test-force-exit tests/planSubscriptionLifecycleService.test.ts tests/planSubscriptionConcurrency.test.ts`

- [ ] **Step 3: Implement one serializable transition engine**

```ts
export type SubscriptionEvent = {
  providerEventId: string; type: 'AUTHENTICATED' | 'ACTIVATED' | 'CHARGED' | 'PENDING' | 'HALTED' | 'CANCELLED' | 'COMPLETED' | 'EXPIRED';
  subscriptionId: string; paymentId?: string; invoiceId?: string;
  amountPaise?: number; currency?: string; providerPlanId?: string;
  occurredAt: Date; currentStart?: Date; currentEnd?: Date; nextChargeAt?: Date;
};
```

Within one serializable transaction, lock the subscription and institute using advisory transaction locks. For an unbound authenticated trial or unbound first charge, provision the institute first and bind `PlanSubscription.instituteId` in that same transaction. `CHARGED` inserts a unique charge row, sets/extends one monthly paid period, refreshes included credits to exactly five, clears trial/failure/grace fields, and marks the charge credited.

- [ ] **Step 4: Implement grace and expiry enforcement**

`PENDING` sets `paymentFailedAt` once and `graceEndsAt = max(currentPeriodEnd, occurredAt + 3 days)`. `HALTED` records provider state but does not shorten paid access. For `PROVIDER_UNKNOWN`, reconciliation calls `findByAttemptId`; it binds exactly one matching provider subscription, leaves zero matches retryable for operator review, and cancels/reports extras instead of guessing. Reconciliation fetches provider state before downgrade when credentials are available, then falls back to Marketplace only after `max(trialEndsAt, currentPeriodEnd, graceEndsAt)` has passed without a verified charge.

- [ ] **Step 5: Dispatch bounded webhook projections**

Extend `sanitizeBillingWebhook` without storing customer contact or full provider payload. Map Razorpay events `subscription.authenticated`, `activated`, `charged`, `pending`, `halted`, `cancelled`, `completed`, and `expired` to `SubscriptionEvent`. Preserve Order events unchanged. Bind the stored `BillingWebhookEvent.planSubscriptionId` and keep provider-event idempotency.

Update `verifyMonthlySubscriptionCheckout` to translate the verified provider state into the same `SubscriptionEvent` and await `applySubscriptionEvent` before returning. This removes the Task 4 intermediate state before any API route enables subscription checkout.

- [ ] **Step 6: Schedule reconciliation without disabling it with checkout creation**

Call `reconcileDueSubscriptions()` beside `runLifecycleSweep()` in `server/src/index.ts`. It runs when the server worker runs even if `RAZORPAY_SUBSCRIPTIONS_ENABLED=false`, because rollback must still maintain existing mandates.

- [ ] **Step 7: Run GREEN and commit**

Run:

```bash
cd server
npx tsx --test --test-force-exit tests/planSubscriptionLifecycleService.test.ts tests/planSubscriptionConcurrency.test.ts tests/billingPlans.test.ts tests/subscriptionLifecycle.test.ts
npx tsc --noEmit
```

```bash
git add server/src/services/planSubscriptionLifecycleService.ts server/src/services/planSubscriptionReconciliationService.ts server/src/services/planSubscriptionCheckoutService.ts server/src/controllers/billingWebhookController.ts server/src/index.ts server/tests/planSubscriptionLifecycleService.test.ts server/tests/planSubscriptionConcurrency.test.ts
git commit -m "feat: process recurring subscription lifecycle"
```

### Task 6: Integrate authenticated Billing checkout, status, and cancellation

**Files:**
- Modify: `server/src/controllers/billingController.ts`
- Modify: `server/src/routes/api.ts`
- Create: `server/tests/billingSubscriptionApi.test.ts`

**Interfaces:**
- Consumes: Tasks 2, 4, and 5 services.
- Produces: `POST /api/billing/create` tagged checkout response, `POST /api/billing/verify`, `GET /api/billing/subscription`, and idempotent `DELETE /api/billing/cancel`.

- [ ] **Step 1: Write API RED tests**

```ts
assert.equal(monthly.body.success, true);
assert.equal(monthly.body.mode, 'SUBSCRIPTION');
assert.equal(monthly.body.plan, 'QUIZ');
assert.equal(monthly.body.billingCycle, 'MONTHLY');
assert.equal(monthly.body.totalCount, 120);
assert.equal(yearly.body.mode, 'ORDER');
assert.equal(pack.body.mode, 'ORDER');
assert.equal((await cancelDuringTrial()).body.effectiveAt, originalTrialEnd.toISOString());
assert.equal((await cancelPaid()).body.cancelAtPeriodEnd, true);
```

Assert the route rejects a subscription belonging to another institute, disabled creation, invalid callback signatures, cancellation provider failure, and repeated cancellation without clearing access.

- [ ] **Step 2: Run RED**

Run: `cd server && npx tsx --test --test-force-exit tests/billingSubscriptionApi.test.ts`

- [ ] **Step 3: Branch only monthly plan products to subscriptions**

Return one of:

```ts
type BillingCheckoutResponse =
  | { success: true; mode: 'ACTIVATED'; plan: 'MARKETPLACE' }
  | { success: true; mode: 'ORDER'; billingPaymentId: string; orderId: string; amount: number; currency: 'INR'; keyId: string }
  | { success: true; mode: 'SUBSCRIPTION'; subscriptionId: string; amount: number; currency: 'INR'; keyId: string; plan: 'QUIZ' | 'ENTERPRISE'; billingCycle: 'MONTHLY'; trialEligible: boolean; firstChargeAt: string; totalCount: 120 };
```

Order verification continues using `order_id|payment_id`; subscription verification uses `payment_id|subscription_id` and then Task 5's transition path.

- [ ] **Step 4: Fix cancellation semantics**

If authenticated/trial and never charged, call provider cancellation with `false`; otherwise call with `true`. Persist the provider response before returning. Do not clear `Institute.razorpaySubscriptionId` in the request handler. Return the effective access end date on every replay.

- [ ] **Step 5: Run GREEN and commit**

Run: `cd server && npx tsx --test --test-force-exit tests/billingSubscriptionApi.test.ts tests/billingPlans.test.ts tests/api.integration.test.ts && npm run build`

```bash
git add server/src/controllers/billingController.ts server/src/routes/api.ts server/tests/billingSubscriptionApi.test.ts
git commit -m "feat: expose recurring billing checkout"
```

### Task 7: Integrate public and invite onboarding

**Files:**
- Modify: `server/src/controllers/onboardingController.ts`
- Modify: `server/src/controllers/adminOnboardingController.ts`
- Modify: `server/src/routes/api.ts`
- Create: `server/tests/subscriptionOnboarding.test.ts`
- Modify: `server/tests/superAdminOnboarding.test.ts`
- Modify: `server/tests/superAdminOnboardingContract.test.ts`

**Interfaces:**
- Consumes: Tasks 3–5.
- Produces: tagged checkout from existing `/onboarding/create-order` and `/admin-onboarding/create-order`; both existing verify routes accept the matching tagged callback.
- Preserves: annual Orders, Marketplace activation, expired/consumed invite rejection, and setup-link delivery.

- [ ] **Step 1: Write onboarding RED tests**

```ts
test('public monthly checkout provisions only after authenticated trial', async () => {
  const session = await createPublicMonthly();
  assert.equal(await prisma.institute.count({ where: { phoneNumber } }), 0);
  await postAuthenticatedWebhook(session.subscriptionId);
  assert.equal(await prisma.institute.count({ where: { phoneNumber } }), 1);
  assert.equal(await prisma.planTrialClaim.count({ where: { ownerIdentityHash } }), 1);
});

test('invite monthly replay creates one institute and consumes one link', async () => {
  const [a, b] = await Promise.all([verifyInvite(), verifyInvite()]);
  assert.equal([a.status, b.status].filter(status => status === 200).length, 1);
  assert.equal(await prisma.institute.count({ where: { phoneNumber } }), 1);
});
```

Add annual Order and cycle-neutral trial regressions so monthly changes cannot remove them.

- [ ] **Step 2: Run RED**

Run: `cd server && npx tsx --test --test-force-exit tests/subscriptionOnboarding.test.ts tests/superAdminOnboarding.test.ts tests/superAdminOnboardingContract.test.ts`

- [ ] **Step 3: Route monthly payloads into `CheckoutContext`**

Normalize public fields into `ProvisioningInput` and store only that bounded JSON. Invite checkout binds `onboardingLinkId` and refuses a mismatched, expired, processing, or consumed link. The browser cannot choose `trialEligible`; the service derives it from the owner hash and existing claims.

- [ ] **Step 4: Return or recover the setup link idempotently**

After authenticated trial or first successful charge, use the institute/invite produced by Task 3. Callback replay returns the same setup result when still recoverable and never creates a second account. Send setup email/WhatsApp with `Promise.allSettled` after the transaction; transport failure does not undo provisioning.

- [ ] **Step 5: Run GREEN and commit**

Run:

```bash
cd server
npx tsx --test --test-force-exit tests/subscriptionOnboarding.test.ts tests/superAdminOnboarding.test.ts tests/superAdminOnboardingContract.test.ts tests/api.integration.test.ts
npx tsc --noEmit
```

```bash
git add server/src/controllers/onboardingController.ts server/src/controllers/adminOnboardingController.ts server/src/routes/api.ts server/tests/subscriptionOnboarding.test.ts server/tests/superAdminOnboarding.test.ts server/tests/superAdminOnboardingContract.test.ts
git commit -m "feat: add recurring mandate onboarding"
```

### Task 8: Add one shared client checkout contract and update Billing

**Files:**
- Create: `client/src/features/billing/checkout.ts`
- Create: `client/src/features/billing/checkout.test.ts`
- Create: `client/src/features/billing/SubscriptionStatusCard.tsx`
- Create: `client/src/features/billing/SubscriptionStatusCard.test.tsx`
- Modify: `client/src/pages/Billing.tsx`

**Interfaces:**
- Produces: `CheckoutSession`, `RazorpayCheckoutResult`, `buildRazorpayOptions(session, customer, handler)`.
- Produces: status presentation for authenticated, active, pending/grace, halted, cancelled, and completed states.

- [ ] **Step 1: Write client RED tests**

```ts
it('uses subscription_id only for monthly subscription checkout', () => {
  expect(buildRazorpayOptions(subscription, customer, handler)).toMatchObject({ subscription_id: 'sub_1' });
  expect(buildRazorpayOptions(subscription, customer, handler)).not.toHaveProperty('order_id');
});

it('does not restrict the recurring payment method', () => {
  expect(buildRazorpayOptions(subscription, customer, handler)).not.toHaveProperty('method');
});

it('shows the retry deadline without claiming payment succeeded', () => {
  expect(renderStatus(pending)).toContain('Retrying payment');
  expect(renderStatus(pending)).toContain('3 days');
});
```

- [ ] **Step 2: Run RED**

Run: `cd client && npm run test:run -- src/features/billing/checkout.test.ts src/features/billing/SubscriptionStatusCard.test.tsx`

- [ ] **Step 3: Implement the tagged option builder**

```ts
export type CheckoutSession =
  | { mode: 'ACTIVATED'; plan: 'MARKETPLACE' }
  | { mode: 'ORDER'; orderId: string; amount: number; currency: 'INR'; keyId: string }
  | { mode: 'SUBSCRIPTION'; subscriptionId: string; amount: number; currency: 'INR'; keyId: string; trialEligible: boolean; firstChargeAt: string; totalCount: 120 };
```

The handler posts all Razorpay-returned fields to the same verify endpoint. The server decides which verifier applies from the tagged stored binding; the client never reports a payment as successful before verification.

- [ ] **Step 4: Update Billing copy and controls**

Before monthly checkout, show: “Authorize automatic ₹249/₹499 monthly payments. Your first payment is on {date} after your eligible 14-day trial. Renews monthly for up to 10 years until cancelled.” Show any supported Razorpay recurring method, cancellation effective date, next charge, and grace status. Keep annual and lifetime-credit buttons on Order checkout.

- [ ] **Step 5: Run GREEN and commit**

Run: `cd client && npm run test:run -- src/features/billing/checkout.test.ts src/features/billing/SubscriptionStatusCard.test.tsx && npx eslint src/features/billing src/pages/Billing.tsx && npm run build`

```bash
git add client/src/features/billing client/src/pages/Billing.tsx
git commit -m "feat: add recurring billing checkout UI"
```

### Task 9: Update both onboarding clients

**Files:**
- Modify: `client/src/pages/Onboarding.tsx`
- Modify: `client/src/pages/JoinOnboarding.tsx`
- Create: `client/src/features/billing/onboardingCheckout.test.ts`

**Interfaces:**
- Consumes: Task 8 shared checkout types/builder.
- Preserves: Marketplace setup, annual checkout, cycle-neutral free trial, setup-link recovery, and lead tracking.

- [ ] **Step 1: Write onboarding contract RED tests**

```ts
it('builds public and invite monthly checkout with subscription_id', () => {
  expect(toOnboardingCheckout(monthlySession)).toMatchObject({ subscription_id: 'sub_monthly' });
});

it('keeps annual onboarding on order_id', () => {
  expect(toOnboardingCheckout(yearlySession)).toMatchObject({ order_id: 'order_yearly' });
});

it('labels authorization separately from a successful plan payment', () => {
  expect(monthlySuccessMessage(authenticatedTrial)).toBe('AutoPay authorized. Your 14-day trial has started.');
});
```

- [ ] **Step 2: Run RED**

Run: `cd client && npm run test:run -- src/features/billing/onboardingCheckout.test.ts`

- [ ] **Step 3: Replace duplicated Razorpay option construction**

Both pages call `buildRazorpayOptions`. Monthly copy explains authorization, first debit, renewal, cancellation, and the 10-year maximum. Yearly copy continues to describe one-time payment. A dismissed or failed mandate keeps the form data and offers retry; it does not show a setup link.

- [ ] **Step 4: Preserve lead and setup-link state transitions**

Mark a lead `CONVERTED` only after the server returns a provisioned setup link. An authenticated trial can display “AutoPay authorized”; an immediate-start subscription displays “Waiting for verified payment” until charge confirmation.

- [ ] **Step 5: Run GREEN and commit**

Run: `cd client && npm run test:run -- src/features/billing/onboardingCheckout.test.ts src/features/billing/checkout.test.ts && npx eslint src/pages/Onboarding.tsx src/pages/JoinOnboarding.tsx src/features/billing && npm run build`

```bash
git add client/src/pages/Onboarding.tsx client/src/pages/JoinOnboarding.tsx client/src/features/billing/onboardingCheckout.test.ts
git commit -m "feat: use recurring checkout in onboarding"
```

### Task 10: Add AutoPay communications and Superadmin observability

**Files:**
- Modify: `server/src/services/planNotificationService.ts`
- Modify: `server/tests/planNotifications.test.ts`
- Modify: `server/src/services/superAdminBillingProvider.ts`
- Modify: `server/src/services/superAdminRevenueService.ts`
- Modify: `server/tests/superAdminBillingSchema.test.ts`
- Modify: `client/src/features/superadmin-revenue/types.ts`
- Modify: `client/src/features/superadmin-revenue/api.ts`
- Modify: `client/src/features/superadmin-revenue/BillingOperationDialog.tsx`
- Modify: `client/src/features/superadmin-revenue/BillingOperationDialog.test.tsx`
- Modify: `docs/guides/WHATSAPP_BOT_SETUP.md`

**Interfaces:**
- Produces notification events: `AUTOPAY_AUTHORIZED`, `AUTOPAY_ACTIVATED`, `AUTOPAY_CHARGE_UPCOMING`, `AUTOPAY_GRACE_ENDING`, `AUTOPAY_RECOVERED`, `AUTOPAY_CANCELLED`, `AUTOPAY_COMPLETED` in addition to existing events.
- Produces billing-history fields: provider status, payment method, next charge, paid-period end, grace end, cancellation mode/effective date, and local charge history.

- [ ] **Step 1: Write communications and visibility RED tests**

```ts
assert.ok(PLAN_NOTIFICATION_TEMPLATES.AUTOPAY_AUTHORIZED);
assert.ok(PLAN_NOTIFICATION_TEMPLATES.AUTOPAY_GRACE_ENDING);
assert.equal(events.filter(e => e.event === 'AUTOPAY_GRACE_ENDING').length, 2);
assert.equal(history.subscription.status, 'PENDING');
assert.equal(history.subscription.graceEndsAt.toISOString(), graceEndsAt.toISOString());
assert.equal(history.subscription.nextChargeAt.toISOString(), nextChargeAt.toISOString());
```

Assert successful retry cancels outstanding failure/grace notifications and channel preferences still prevent unauthorized delivery.

- [ ] **Step 2: Run RED**

Run: `cd server && npx tsx --test --test-force-exit tests/planNotifications.test.ts tests/superAdminBillingSchema.test.ts`

- [ ] **Step 3: Implement templates and schedules**

Use paired email/WhatsApp templates with server-owned plan, amount, first/next charge, grace end, cancellation effective date, billing link, and support contact. Add environment names to the WhatsApp guide:

```text
WHATSAPP_TEMPLATE_AUTOPAY_AUTHORIZED
WHATSAPP_TEMPLATE_AUTOPAY_ACTIVATED
WHATSAPP_TEMPLATE_AUTOPAY_CHARGE_UPCOMING
WHATSAPP_TEMPLATE_AUTOPAY_GRACE_ENDING
WHATSAPP_TEMPLATE_AUTOPAY_RECOVERED
WHATSAPP_TEMPLATE_AUTOPAY_CANCELLED
WHATSAPP_TEMPLATE_AUTOPAY_COMPLETED
```

- [ ] **Step 4: Expose read-only provider and local subscription state**

Join the active `PlanSubscription` and recent `PlanSubscriptionCharge` rows into billing history. Provider failures return `UNAVAILABLE` without hiding local state. Add a read-only AutoPay section in the Superadmin dialog; do not add an operation that creates consent or marks a charge successful.

- [ ] **Step 5: Run server and client GREEN**

Run:

```bash
cd server
npx tsx --test --test-force-exit tests/planNotifications.test.ts tests/superAdminBillingSchema.test.ts
npm run build
cd ../client
npm run test:run -- src/features/superadmin-revenue/BillingOperationDialog.test.tsx
npx eslint src/features/superadmin-revenue
npm run build
```

- [ ] **Step 6: Commit**

```bash
git add server/src/services/planNotificationService.ts server/src/services/superAdminBillingProvider.ts server/src/services/superAdminRevenueService.ts server/tests/planNotifications.test.ts server/tests/superAdminBillingSchema.test.ts client/src/features/superadmin-revenue docs/guides/WHATSAPP_BOT_SETUP.md
git commit -m "feat: surface recurring billing operations"
```

### Task 11: Run release verification and prepare the guarded rollout

**Files:**
- Create: `docs/guides/RAZORPAY_SUBSCRIPTIONS_ROLLOUT.md`
- Modify: `README.md`
- Test: all server and client tests changed above plus complete suites.

**Interfaces:**
- Produces: an operator checklist that enables creation only after provider plans, webhook events, secrets, and test-mode scenarios are verified.
- Produces: rollback that stops new subscription creation without abandoning existing mandate processing.

- [ ] **Step 1: Write the rollout checklist before enabling anything**

The guide must require:

```text
1. Create Quiz ₹249/month and Enterprise ₹499/month plans in Razorpay production mode.
2. Confirm each plan interval is monthly and record its immutable provider plan ID.
3. Configure authenticated, activated, charged, pending, halted, cancelled, completed, and expired subscription webhooks.
4. Configure the webhook secret and both provider plan IDs with creation still disabled.
5. Run test-mode trial, immediate charge, renewal, cancellation, failure/retry, and mandate-revocation scenarios.
6. Confirm annual, Marketplace, lifetime-credit, fee, and quiz purchase regressions.
7. Set RAZORPAY_SUBSCRIPTIONS_ENABLED=true only after the smoke evidence is recorded.
8. Roll back by setting creation false; keep webhooks, reconciliation, status, and cancellation running.
```

- [ ] **Step 2: Apply the migration only to a disposable local schema and verify it**

Run:

```bash
cd server
npx prisma format
npx prisma validate
npx prisma generate
npx tsx --test --test-force-exit tests/planSubscriptionMigration.test.ts
```

Expected: PASS without changing the shared or production database.

- [ ] **Step 3: Run focused server verification**

```bash
cd server
npx tsx --test --test-force-exit tests/planSubscriptionProvider.test.ts tests/accountProvisioningService.test.ts tests/planSubscriptionCheckoutService.test.ts tests/planSubscriptionLifecycleService.test.ts tests/planSubscriptionConcurrency.test.ts tests/billingSubscriptionApi.test.ts tests/subscriptionOnboarding.test.ts tests/billingPlans.test.ts tests/subscriptionLifecycle.test.ts tests/planNotifications.test.ts tests/superAdminOnboarding.test.ts tests/superAdminOnboardingContract.test.ts tests/superAdminBillingSchema.test.ts
npm run build
```

Expected: all focused tests and TypeScript build PASS.

- [ ] **Step 4: Run focused client verification**

```bash
cd client
npm run test:run -- src/features/billing/checkout.test.ts src/features/billing/onboardingCheckout.test.ts src/features/billing/SubscriptionStatusCard.test.tsx src/features/superadmin-revenue/BillingOperationDialog.test.tsx
npx eslint src/features/billing src/features/superadmin-revenue src/pages/Billing.tsx src/pages/Onboarding.tsx src/pages/JoinOnboarding.tsx
npm run build
```

Expected: tests, targeted lint, and production build PASS.

- [ ] **Step 5: Run complete regression suites**

```bash
cd server && npm test
cd ../client && npm run test:run
cd .. && npm run build
git diff --check
git status --short
```

Expected: all tests/builds PASS, diff check is empty, and status contains only intended implementation/docs changes.

- [ ] **Step 6: Perform a non-mutating security and data review**

Verify from the final diff that no client bundle contains Razorpay secrets or provider plan IDs, no webhook stores contact/payment credentials, no monthly Order path remains reachable for Quiz/Enterprise, annual Orders are unchanged, cancellation does not erase active entitlement early, and no migration contains `DROP`, `TRUNCATE`, destructive `ALTER`, or data rewrite statements.

- [ ] **Step 7: Commit the rollout guide and final integration corrections**

```bash
git add README.md docs/guides/RAZORPAY_SUBSCRIPTIONS_ROLLOUT.md
git commit -m "docs: add recurring billing rollout guide"
```

- [ ] **Step 8: Stop before production mutation**

Present the test evidence, migration preflight, required Razorpay Dashboard plan IDs/webhook events, environment changes, and rollback command to the user. Do not configure production, apply the production migration, push, or deploy without explicit user authorization for those external changes.

## Reference documentation

- [Razorpay subscription creation](https://razorpay.com/docs/payments/subscriptions/create/?preferred-country=IN)
- [Supported subscription payment methods](https://razorpay.com/docs/payments/subscriptions/supported-payment-methods/?preferred-country=IN)
- [Subscription workflow and states](https://razorpay.com/docs/payments/subscriptions/workflow/?preferred-country=IN)
- [Payment retries](https://razorpay.com/docs/payments/subscriptions/payment-retries/?preferred-country=IN)
- [Subscription webhooks](https://razorpay.com/docs/webhooks/subscriptions/?preferred-country=IN)
- [Cancellation API](https://razorpay.com/docs/api/payments/subscriptions/cancel-subscription/?preferred-country=IN)
