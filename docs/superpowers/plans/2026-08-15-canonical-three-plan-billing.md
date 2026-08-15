# Canonical Three-Plan Billing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace every legacy plan, entitlement, student-limit, quiz-credit, billing, communication, and Superadmin surface with the approved Marketplace, Quiz, and Enterprise model and safely migrate every existing institute to Enterprise.

**Architecture:** A server-owned plan catalogue feeds public and authenticated clients. Focused entitlement, quiz-credit wallet, subscription lifecycle, and lifecycle-notification modules become the only plan decision points; controllers and middleware delegate to them. Schema changes land before an idempotent, preflighted account backfill, while legacy identifiers remain accepted only by a narrow normalization boundary during rollout.

**Tech Stack:** TypeScript, Express, Prisma/PostgreSQL, Razorpay, Node test runner, React 19, Vite, Vitest, existing EmailJob/WhatsappJob workers.

## Global Constraints

- Canonical plan identifiers are exactly `MARKETPLACE`, `QUIZ`, and `ENTERPRISE`.
- Marketplace costs ₹99 once and is promotional ₹0 now; access is lifetime.
- Quiz costs ₹249 monthly or ₹2,499 yearly.
- Enterprise costs ₹499 monthly or ₹4,999 yearly.
- Quiz and Enterprise have one 14-day no-card trial with five expiring trial credits.
- Quiz and Enterprise refresh five non-accumulating included credits monthly on the billing-anniversary day.
- Included credits are consumed before lifetime credits.
- Existing aggregate quiz credits migrate to lifetime credits and never expire.
- Lifetime credit packs remain 5/₹250, 10/₹500, 25/₹1,000, and 40/₹1,500.
- Lifetime credits require active Quiz or Enterprise access to be consumed.
- Expired Quiz or Enterprise access falls back to lifetime Marketplace access.
- All plans have unlimited students; no runtime or Superadmin numeric student cap remains.
- Every existing institute migrates to Enterprise with its existing start and expiry dates unchanged.
- No existing institute, admin, student, batch, payment, quiz, listing, lead, review, or other business record may be deleted.
- Prices, credit grants, dates, and entitlements are server-authoritative; client-supplied amounts are never trusted.
- Lifecycle sends are preference-aware, durable, deduplicated, observable, and independently retryable.
- Renewal reminders send 7, 3, and 1 days before expiry, on the due date, and 1, 3, and 7 days after while unpaid; verified payment cancels remaining reminders.
- Use TDD for every behavior change: write and run RED, implement GREEN, rerun, then refactor.

---

## File Structure

### New server files

- `server/src/domain/plans/planCatalog.ts` — canonical products, price lookup, feature metadata, and legacy alias normalization.
- `server/src/domain/plans/entitlements.ts` — pure effective-access and anniversary calculations.
- `server/src/services/quizCreditWalletService.ts` — transactional included/lifetime grants, refresh, projection, and consumption.
- `server/src/services/subscriptionLifecycleService.ts` — trial and paid activation, expiration fallback, renewal refresh, and cancellation decisions.
- `server/src/services/planNotificationService.ts` — notification event creation, schedule reconciliation, cancellation, dispatch, and retry.
- `server/src/controllers/planCatalogController.ts` — public catalogue endpoint.
- `server/src/controllers/billingWebhookController.ts` — raw-body Razorpay lifecycle webhook verification and idempotent event handling.
- `server/src/scripts/migrateCanonicalPlans.ts` — read-only preflight and explicit idempotent account backfill.
- `server/tests/planCatalog.test.ts` — catalogue/alias contract.
- `server/tests/planEntitlements.test.ts` — effective-access and anniversary boundaries.
- `server/tests/quizCreditWallet.test.ts` — credit integrity and concurrency.
- `server/tests/subscriptionLifecycle.test.ts` — trial, activation, expiry, and refresh.
- `server/tests/planNotifications.test.ts` — templates, schedule, deduplication, and cancellation.
- `server/tests/canonicalPlanMigration.test.ts` — isolated-schema migration/backfill invariants.
- `server/tests/billingPlans.test.ts` — catalogue checkout, provider verification, replay, and webhook contracts.

### New client files

- `client/src/features/plans/types.ts` — typed catalogue and billing-state contracts.
- `client/src/features/plans/api.ts` — public catalogue and authenticated billing API boundary.
- `client/src/features/plans/PlanCards.tsx` — reusable canonical plan cards.
- `client/src/features/plans/planViewModel.ts` — display-only mapping derived from server catalogue.
- `client/src/features/plans/planViewModel.test.ts` — exact price/copy/feature projections.

### Existing files with focused changes

- `server/prisma/schema.prisma` and `server/prisma/migrations/20260816140000_canonical_three_plan_billing/migration.sql` — canonical fields, payment/trial/webhook/notification records, indexes, and relations.
- `server/src/middleware/auth.ts` — replace `isQuizOnly`/`PAGE_ONLY` branching with entitlement decisions.
- `server/src/controllers/billingController.ts` — catalogue-backed checkout and transactional verification.
- `server/src/controllers/onboardingController.ts` and `server/src/controllers/adminOnboardingController.ts` — canonical provisioning and trial activation.
- `server/src/controllers/testController.ts` and `server/src/utils/quizCredits.ts` — route all credit behavior through the wallet compatibility facade.
- `server/src/services/superAdminInstituteService.ts` and `server/src/services/superAdminRevenueService.ts` — canonical onboarding, plan operations, and lifetime-credit adjustment.
- `server/src/controllers/superAdminInstituteController.ts` and `server/src/controllers/superAdminRevenueController.ts` — remove student-limit/config plan mutation inputs.
- `server/src/services/superAdminHomeService.ts` — canonical labels and effective-access attention items.
- `server/src/routes/api.ts` and `server/src/routes/superAdminRoutes.ts` — catalogue and lifecycle-history routes.
- `server/src/index.ts` — start the bounded lifecycle/notification worker loop.
- `server/src/utils/emailWorker.ts`, `server/src/utils/whatsappWorker.ts`, and `docs/guides/WHATSAPP_BOT_SETUP.md` — lifecycle template contracts and provider configuration.
- `client/src/pages/Home.tsx`, `client/src/pages/Onboarding.tsx`, `client/src/pages/JoinOnboarding.tsx`, `client/src/pages/SetupAccount.tsx`, and `client/src/pages/Billing.tsx` — canonical catalogue, checkout, trial, fallback, and credit wallet UI.
- `client/src/features/superadmin-institutes/InstituteDirectory.tsx`, `InstituteWorkspace.tsx`, `OnboardingWizard.tsx`, `StructuredConfigForm.tsx`, `types.ts`, and `api.ts` — canonical filters, onboarding, detail, and removal of capacity controls.
- `client/src/features/superadmin-revenue/BillingOperationDialog.tsx` and `BillingOperationDialog.test.tsx` — canonical plan/cycle operations and lifetime-credit terminology.

---

### Task 1: Canonical Server Plan Catalogue

**Files:**
- Create: `server/src/domain/plans/planCatalog.ts`
- Create: `server/tests/planCatalog.test.ts`

**Interfaces:**
- Produces: `CanonicalPlan`, `BillingCycle`, `PlanProduct`, `PLAN_CATALOG`, `normalizePlanId(value)`, `resolvePlanPrice(plan, cycle)`, and `publicPlanCatalogue()`.
- Consumers: billing, onboarding, lifecycle, Superadmin, and the public catalogue controller in later tasks.

- [ ] **Step 1: Write the failing catalogue test**

```ts
import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizePlanId, publicPlanCatalogue, resolvePlanPrice } from '../src/domain/plans/planCatalog';

test('publishes exactly the three approved plans and prices', () => {
  const plans = publicPlanCatalogue();
  assert.deepEqual(plans.map(plan => plan.id), ['MARKETPLACE', 'QUIZ', 'ENTERPRISE']);
  assert.deepEqual(plans.map(plan => [plan.monthlyPricePaise, plan.yearlyPricePaise, plan.oneTimePricePaise]), [
    [null, null, 9_900],
    [24_900, 249_900, null],
    [49_900, 499_900, null]
  ]);
  assert.equal(plans[0].promotionalPricePaise, 0);
  assert.equal(plans[1].trialDays, 14);
  assert.equal(plans[2].includedQuizCredits, 5);
  assert.ok(plans.every(plan => plan.unlimitedStudents));
});

test('normalizes known legacy aliases and rejects unknown plans', () => {
  assert.equal(normalizePlanId('listing'), 'MARKETPLACE');
  assert.equal(normalizePlanId('QUIZ_ONLY'), 'QUIZ');
  assert.equal(normalizePlanId('PRO'), 'ENTERPRISE');
  assert.equal(normalizePlanId('BASIC'), 'ENTERPRISE');
  assert.throws(() => normalizePlanId('gold'), /INVALID_PLAN/);
  assert.equal(resolvePlanPrice('QUIZ', 'YEARLY'), 249_900);
});
```

- [ ] **Step 2: Run the test and verify RED**

Run: `cd server && npx tsx --test tests/planCatalog.test.ts`
Expected: FAIL because `src/domain/plans/planCatalog.ts` does not exist.

- [ ] **Step 3: Implement the catalogue**

```ts
export type CanonicalPlan = 'MARKETPLACE' | 'QUIZ' | 'ENTERPRISE';
export type BillingCycle = 'MONTHLY' | 'YEARLY' | 'ONE_TIME';

export type PlanProduct = {
  id: CanonicalPlan;
  label: string;
  monthlyPricePaise: number | null;
  yearlyPricePaise: number | null;
  oneTimePricePaise: number | null;
  promotionalPricePaise: number | null;
  trialDays: number;
  includedQuizCredits: number;
  unlimitedStudents: true;
  features: readonly string[];
};

export const PLAN_CATALOG: readonly PlanProduct[] = [
  { id: 'MARKETPLACE', label: 'Marketplace', monthlyPricePaise: null, yearlyPricePaise: null, oneTimePricePaise: 9_900, promotionalPricePaise: 0, trialDays: 0, includedQuizCredits: 0, unlimitedStudents: true, features: ['Public Marketplace listing', 'Ownership and profile management', 'Student and parent leads'] },
  { id: 'QUIZ', label: 'Quiz', monthlyPricePaise: 24_900, yearlyPricePaise: 249_900, oneTimePricePaise: null, promotionalPricePaise: null, trialDays: 14, includedQuizCredits: 5, unlimitedStudents: true, features: ['Lifetime Marketplace access', 'Quiz creation and delivery', 'Five included quiz credits each month', 'Lifetime credit top-ups'] },
  { id: 'ENTERPRISE', label: 'Enterprise', monthlyPricePaise: 49_900, yearlyPricePaise: 499_900, oneTimePricePaise: null, promotionalPricePaise: null, trialDays: 14, includedQuizCredits: 5, unlimitedStudents: true, features: ['Lifetime Marketplace access', 'All quiz features', 'All coaching-management features', 'Five included quiz credits each month'] }
] as const;
```

Implement a closed alias map for the legacy identifiers named in the design. `resolvePlanPrice` must reject incompatible plan/cycle pairs instead of returning zero or falling through to Enterprise.

- [ ] **Step 4: Run catalogue tests and server build**

Run: `cd server && npx tsx --test tests/planCatalog.test.ts && npm run build`
Expected: all catalogue tests PASS; TypeScript build exits 0.

- [ ] **Step 5: Commit**

```bash
git add server/src/domain/plans/planCatalog.ts server/tests/planCatalog.test.ts
git commit -m "feat: define canonical plan catalogue"
```

---

### Task 2: Canonical Billing Schema and Safe Backfill Contract

**Files:**
- Modify: `server/prisma/schema.prisma`
- Create: `server/prisma/migrations/20260816140000_canonical_three_plan_billing/migration.sql`
- Create: `server/src/scripts/migrateCanonicalPlans.ts`
- Create: `server/tests/canonicalPlanMigration.test.ts`

**Interfaces:**
- Produces Institute fields `billingCycle`, `trialStartedAt`, `trialEndsAt`, `trialUsedAt`, `marketplaceAccessGrantedAt`, `includedQuizCredits`, `includedQuizCreditsExpireAt`, `lifetimeQuizCredits`, `quizCreditsRenewAt`, and `canonicalPlanMigratedAt`.
- Produces `BillingPayment`, `PlanTrialClaim`, `BillingWebhookEvent`, and `PlanNotification` durable records.
- Consumes: canonical types from Task 1.

- [ ] **Step 1: Write a failing isolated migration test**

Create legacy fixtures for `FREE`, `BASIC`, `PRO`, `ENTERPRISE`, `NO_PLAN`, `isQuizOnly`, `PAGE_ONLY`, active, expired, no-expiry, and nonzero `quizCredits`. Assert after schema SQL plus the backfill transaction:

```ts
assert.equal(after.instituteCount, before.instituteCount);
assert.equal(after.studentCount, before.studentCount);
assert.equal(after.paymentCount, before.paymentCount);
assert.equal(after.quizCount, before.quizCount);
assert.ok(after.institutes.every(row => row.plan === 'ENTERPRISE'));
assert.ok(after.institutes.every(row => row.marketplaceAccessGrantedAt !== null));
assert.deepEqual(after.institutes.map(row => row.lifetimeQuizCredits), before.institutes.map(row => row.quizCredits));
assert.equal(after.expired.includedQuizCredits, 0);
assert.equal(after.active.includedQuizCredits, 5);
assert.equal(after.active.planExpiryDate?.toISOString(), before.active.planExpiryDate?.toISOString());
```

Run the real migration in a temporary PostgreSQL schema as `marketplaceMigration.test.ts` does. Run the backfill module with an injected Prisma client so the test does not touch the shared schema.

- [ ] **Step 2: Run the migration test and verify RED**

Run: `cd server && npx tsx --test tests/canonicalPlanMigration.test.ts`
Expected: FAIL because canonical fields and the migration script are missing.

- [ ] **Step 3: Add schema fields and durable records**

Add `MARKETPLACE` and `QUIZ` to `Tier`; retain legacy enum values temporarily. Add `BillingCycle` with `MONTHLY`, `YEARLY`, and `ONE_TIME`. Add the Institute fields listed above with safe defaults (`0` balances and nullable dates).

Define `BillingPayment` with unique `providerOrderId` and `providerPaymentId`, canonical plan/credit-pack binding, authoritative `amountPaise`, cycle, status, and verification timestamps. Define `PlanTrialClaim` with unique `instituteId` and unique hashed normalized owner identity so one owner cannot create repeated trials through another plan. Define `BillingWebhookEvent` with unique provider event ID, type, received/processed timestamps, bounded sanitized payload, and processing status. Define `PlanNotification` with institute, event, event key, channel, scheduled time, status, transport-job IDs, attempts, and a unique compound key on `(instituteId, eventKey, channel)`.

- [ ] **Step 4: Implement preflight/apply modes without hidden mutation**

```ts
export type CanonicalMigrationMode = 'preflight' | 'apply';

export async function migrateCanonicalPlans(client: PrismaClient, mode: CanonicalMigrationMode, now = new Date()) {
  const before = await collectBusinessCounts(client);
  const candidates = await client.institute.findMany({ where: { canonicalPlanMigratedAt: null } });
  if (mode === 'preflight') return { mode, before, candidates: candidates.length };
  await client.$transaction(async tx => {
    for (const institute of candidates) {
      const active = !institute.planExpiryDate || institute.planExpiryDate.getTime() >= now.getTime();
      await tx.institute.update({
        where: { id: institute.id },
        data: {
          plan: 'ENTERPRISE',
          marketplaceAccessGrantedAt: institute.createdAt,
          lifetimeQuizCredits: institute.quizCredits,
          includedQuizCredits: active ? 5 : 0,
          canonicalPlanMigratedAt: now
        }
      });
    }
  });
  const after = await collectBusinessCounts(client);
  assertBusinessCountsUnchanged(before, after);
  return { mode, before, after, migrated: candidates.length };
}
```

Calculate included-credit expiry/renewal with Task 3's anniversary helper before the apply path is used on shared data. The apply mode must set values rather than increment them and skip rows with `canonicalPlanMigratedAt`, making retries idempotent.

- [ ] **Step 5: Validate Prisma and run migration tests**

Run: `cd server && npx prisma format && npx prisma validate && npx prisma generate && npx tsx --test tests/canonicalPlanMigration.test.ts`
Expected: all commands PASS.

- [ ] **Step 6: Commit**

```bash
git add server/prisma server/src/scripts/migrateCanonicalPlans.ts server/tests/canonicalPlanMigration.test.ts
git commit -m "feat: add canonical billing schema and backfill"
```

---

### Task 3: Effective Entitlements and Billing Anniversaries

**Files:**
- Create: `server/src/domain/plans/entitlements.ts`
- Create: `server/tests/planEntitlements.test.ts`
- Modify: `server/src/scripts/migrateCanonicalPlans.ts`
- Modify: `server/src/middleware/auth.ts`
- Modify: entitlement-sensitive controller tests in `server/tests/api.integration.test.ts`

**Interfaces:**
- Produces `EntitlementState`, `effectiveEntitlements(state, now)`, `nextBillingAnniversary(start, after)`, and `includedCreditPeriod(state, now)`.
- Consumes: canonical plan/cycle types from Task 1 and canonical Institute fields from Task 2.

- [ ] **Step 1: Write failing pure entitlement tests**

```ts
test('expired Enterprise falls back to Marketplace and preserves stored credits', () => {
  const access = effectiveEntitlements({ plan: 'ENTERPRISE', planExpiryDate: new Date('2026-08-01'), marketplaceAccessGrantedAt: new Date('2026-01-01'), lifetimeQuizCredits: 12 }, new Date('2026-08-15'));
  assert.deepEqual(access, { marketplace: true, quiz: false, enterprise: false, usableQuizCredits: 0 });
});

test('yearly plans refresh monthly and clamp a 31st anniversary', () => {
  assert.equal(nextBillingAnniversary(new Date('2026-01-31T00:00:00Z'), new Date('2026-02-01T00:00:00Z')).toISOString(), '2026-02-28T00:00:00.000Z');
});
```

Also cover active Quiz, active Enterprise, Marketplace, trial end equality, missing Marketplace entitlement during compatibility, and leap-year February.

- [ ] **Step 2: Run and verify RED**

Run: `cd server && npx tsx --test tests/planEntitlements.test.ts`
Expected: FAIL because the entitlement module does not exist.

- [ ] **Step 3: Implement pure entitlement decisions**

```ts
export type EffectiveEntitlements = {
  marketplace: boolean;
  quiz: boolean;
  enterprise: boolean;
  usableQuizCredits: number;
};

export function effectiveEntitlements(state: EntitlementState, now: Date): EffectiveEntitlements {
  const active = !state.planExpiryDate || state.planExpiryDate.getTime() >= now.getTime();
  const trialActive = Boolean(state.trialEndsAt && state.trialEndsAt.getTime() >= now.getTime());
  const paidOrTrial = active || trialActive;
  const quiz = paidOrTrial && (state.plan === 'QUIZ' || state.plan === 'ENTERPRISE');
  return {
    marketplace: Boolean(state.marketplaceAccessGrantedAt) || quiz,
    quiz,
    enterprise: paidOrTrial && state.plan === 'ENTERPRISE',
    usableQuizCredits: quiz ? state.includedQuizCredits + state.lifetimeQuizCredits : 0
  };
}
```

Implement anniversary calculation with UTC calendar parts and last-day clamping; do not add fixed 30-day milliseconds.

Update `migrateCanonicalPlans.ts` to use `includedCreditPeriod` so every active migrated Enterprise account receives an included-credit expiry and next refresh derived from its preserved start date. Expired rows receive zero included credits and null refresh dates.

- [ ] **Step 4: Replace auth middleware legacy gates**

Fetch canonical fields in the auth projection, calculate effective entitlements once, place them on `req.user.entitlements`, and retain only the approved Marketplace route allowlist for Marketplace-only access. Remove runtime decisions based on `isQuizOnly`, `config.planName`, and `maxStudents`.

- [ ] **Step 5: Run focused auth and entitlement tests**

Run: `cd server && npx tsx --test --test-force-exit tests/planEntitlements.test.ts tests/api.integration.test.ts tests/marketplace.test.ts`
Expected: all focused tests PASS.

- [ ] **Step 6: Commit**

```bash
git add server/src/domain/plans/entitlements.ts server/src/scripts/migrateCanonicalPlans.ts server/src/middleware/auth.ts server/tests/planEntitlements.test.ts server/tests/api.integration.test.ts
git commit -m "feat: centralize plan entitlements"
```

---

### Task 4: Transactional Quiz-Credit Wallet

**Files:**
- Create: `server/src/services/quizCreditWalletService.ts`
- Create: `server/tests/quizCreditWallet.test.ts`
- Modify: `server/src/utils/quizCredits.ts`
- Modify: `server/src/controllers/testController.ts`
- Modify: `server/src/controllers/authController.ts`
- Modify: `server/tests/quiz.test.ts`

**Interfaces:**
- Produces `getQuizCreditWallet(instituteId, now?)`, `consumeQuizCredits(instituteId, amount, now?)`, `grantLifetimeQuizCredits(input)`, and `refreshIncludedQuizCredits(instituteId, period, now?)`.
- Consumes: entitlement and anniversary helpers from Task 3.

- [ ] **Step 1: Write failing wallet tests**

Cover these concrete outcomes:

```ts
assert.deepEqual(await consumeQuizCredits(id, 3, now), { includedCredits: 2, lifetimeCredits: 10, totalUsableCredits: 12 });
assert.deepEqual(await consumeQuizCredits(id, 4, now), { includedCredits: 0, lifetimeCredits: 8, totalUsableCredits: 8 });
await assert.rejects(() => consumeQuizCredits(expiredId, 1, now), /QUIZ_PLAN_INACTIVE/);
await assert.rejects(() => consumeQuizCredits(lowBalanceId, 2, now), /INSUFFICIENT_QUIZ_CREDITS/);
```

Use `Promise.allSettled` for two simultaneous one-credit consumptions from a one-credit wallet and assert exactly one fulfills. Assert two simultaneous refresh calls leave exactly five included credits and one period grant.

- [ ] **Step 2: Run and verify RED**

Run: `cd server && npx tsx --test --test-force-exit tests/quizCreditWallet.test.ts`
Expected: FAIL because the wallet service is missing.

- [ ] **Step 3: Implement atomic wallet operations**

Use an institute-scoped PostgreSQL advisory transaction lock before reading balances. Refresh the included period inside the same transaction, validate active Quiz entitlement, calculate included-first deduction, then update both buckets and the legacy aggregate `quizCredits` compatibility projection.

```ts
const includedUsed = Math.min(institute.includedQuizCredits, amount);
const lifetimeUsed = amount - includedUsed;
if (institute.lifetimeQuizCredits < lifetimeUsed) throw new QuizCreditError('INSUFFICIENT_QUIZ_CREDITS');
const includedCredits = institute.includedQuizCredits - includedUsed;
const lifetimeCredits = institute.lifetimeQuizCredits - lifetimeUsed;
```

Lifetime grants must reject non-positive/non-integer amounts and create a Superadmin audit entry or verified `BillingPayment` linkage according to source.

- [ ] **Step 4: Convert existing callers to the wallet**

Keep `server/src/utils/quizCredits.ts` as a temporary compatibility facade with the old exported names delegating to the wallet. Remove JSON `monthlyQuizCredits`, `purchasedQuizCredits`, and `lastCreditResetMonth` mutation. Update quiz publishing to consume exactly one credit only when the quiz becomes non-draft. Auth responses expose total, included, lifetime, and included-expiry fields.

- [ ] **Step 5: Run wallet, quiz, auth tests and build**

Run: `cd server && npx tsx --test --test-force-exit tests/quizCreditWallet.test.ts tests/quiz.test.ts tests/api.integration.test.ts && npm run build`
Expected: all focused tests PASS and build exits 0.

- [ ] **Step 6: Commit**

```bash
git add server/src/services/quizCreditWalletService.ts server/src/utils/quizCredits.ts server/src/controllers/testController.ts server/src/controllers/authController.ts server/tests/quizCreditWallet.test.ts server/tests/quiz.test.ts server/tests/api.integration.test.ts
git commit -m "feat: add transactional quiz credit wallet"
```

---

### Task 5: Subscription and Trial Lifecycle

**Files:**
- Create: `server/src/services/subscriptionLifecycleService.ts`
- Create: `server/tests/subscriptionLifecycle.test.ts`
- Modify: `server/src/controllers/onboardingController.ts`
- Modify: `server/src/index.ts`

**Interfaces:**
- Produces `activateMarketplace`, `startPlanTrial`, `activatePaidPlan`, `cancelAtPeriodEnd`, `reconcileInstituteLifecycle`, and `runLifecycleSweep`.
- Consumes: catalogue, entitlement, anniversary, and wallet services.

- [ ] **Step 1: Write failing lifecycle tests**

Assert one-time trial eligibility, exact 14-day end, five trial credits, active paid activation, yearly monthly refresh, cancellation preserving access until expiry, and expired fallback:

```ts
const trial = await startPlanTrial({ instituteId, plan: 'QUIZ', now });
assert.equal(trial.trialEndsAt.toISOString(), '2026-08-29T00:00:00.000Z');
assert.equal(trial.includedQuizCredits, 5);
await assert.rejects(() => startPlanTrial({ instituteId, plan: 'ENTERPRISE', now }), /TRIAL_ALREADY_USED/);

const expired = await reconcileInstituteLifecycle(instituteId, new Date('2026-08-30T00:00:00Z'));
assert.equal(expired.effectivePlan, 'MARKETPLACE');
assert.equal(expired.marketplace, true);
assert.equal(expired.quiz, false);
```

- [ ] **Step 2: Run and verify RED**

Run: `cd server && npx tsx --test --test-force-exit tests/subscriptionLifecycle.test.ts`
Expected: FAIL because the lifecycle service does not exist.

- [ ] **Step 3: Implement transactional lifecycle transitions**

Each transition takes an institute advisory lock. Marketplace activation sets `plan=MARKETPLACE`, `billingCycle=ONE_TIME`, and permanent entitlement without a Razorpay order while promo price is zero. Trial activation accepts only Quiz/Enterprise, hashes the normalized owner login identity with the server secret, creates `PlanTrialClaim`, checks `trialUsedAt`, sets 14-day dates and included-credit expiry, and returns a lifecycle transition result for later notification scheduling. The unique institute and identity-hash constraints make cross-plan and cross-institute retries fail as `TRIAL_ALREADY_USED`. Paid activation binds verified payment, sets cycle/dates, clears trial state, and resets included credits to five.

- [ ] **Step 4: Add a bounded reconciliation sweep**

`runLifecycleSweep` selects due included-credit refreshes, trials, subscriptions, and reminders in pages ordered by due time. Claim work conditionally and use service idempotency. Start the interval from `server/src/index.ts`, use `.unref()`, skip automatic intervals in `NODE_ENV=test`, and make one sweep callable directly by tests and operations.

- [ ] **Step 5: Route public trial activation through the service**

`POST /api/onboarding/start-trial` accepts canonical plan or a recognized compatibility alias, ignores any client trial duration/credit amount, applies the one-trial rule, and returns setup/access state without exposing provider data.

- [ ] **Step 6: Run lifecycle/onboarding tests and commit**

Run: `cd server && npx tsx --test --test-force-exit tests/subscriptionLifecycle.test.ts tests/api.integration.test.ts tests/controller-success.test.ts && npm run build`
Expected: focused tests PASS and build exits 0.

```bash
git add server/src/services/subscriptionLifecycleService.ts server/src/controllers/onboardingController.ts server/src/index.ts server/tests/subscriptionLifecycle.test.ts server/tests/api.integration.test.ts server/tests/controller-success.test.ts
git commit -m "feat: add canonical subscription lifecycle"
```

---

### Task 6: Server-Authoritative Checkout and Payment Verification

**Files:**
- Modify: `server/src/controllers/billingController.ts`
- Create: `server/src/controllers/billingWebhookController.ts`
- Modify: `server/src/index.ts`
- Modify: `server/src/routes/api.ts`
- Create or modify: `server/tests/billingPlans.test.ts`
- Modify: `server/tests/api.integration.test.ts`

**Interfaces:**
- Produces `GET /api/plans`, `POST /api/billing/create`, `POST /api/billing/verify`, `POST /api/billing/webhooks/razorpay`, and `DELETE /api/billing/cancel` canonical contracts.
- Consumes: catalogue, `BillingPayment`, wallet, and lifecycle services.

- [ ] **Step 1: Write failing HTTP tests**

Verify `GET /api/plans` returns exact catalogue values; Marketplace promo returns immediate activation without calling Razorpay; Quiz monthly creates ₹24,900 paise; Enterprise yearly creates ₹499,900 paise; unknown plan/cycle returns 400; verified credit pack grants lifetime credits once; replayed provider payment returns the original result without double grant; mismatched provider amount/notes/signature makes no mutation. Send signed webhook fixtures for `payment.failed`, `subscription.charged`, and `subscription.cancelled`; assert invalid signatures make no write, duplicate event IDs apply once, failure schedules the payment-failed sequence, charged renewal extends the period once, and cancellation preserves access through expiry.

- [ ] **Step 2: Run and verify RED**

Run: `cd server && npx tsx --test --test-force-exit tests/billingPlans.test.ts`
Expected: FAIL on legacy prices, fallthrough behavior, and missing catalogue endpoint.

- [ ] **Step 3: Add the public catalogue controller and route**

Return `{ success: true, data: publicPlanCatalogue() }` from `GET /api/plans`. The endpoint is public, read-only, and rate-limited by the existing public policy.

- [ ] **Step 4: Replace checkout branching with catalogue resolution**

Create a pending `BillingPayment` before calling Razorpay. Store the canonical product/cycle/amount, then bind the returned provider order or subscription. Marketplace promo delegates directly to `activateMarketplace` and does not create a zero-value provider order.

- [ ] **Step 5: Make verification transactional and replay-safe**

Validate the signature and provider object against the stored pending payment. Within one transaction, conditionally mark the payment verified, activate the plan or grant the pack, update provider IDs, and write audit/lifecycle events. A unique provider payment ID plus conditional status update prevents double application.

- [ ] **Step 6: Add the signed Razorpay lifecycle webhook**

Mount `POST /api/billing/webhooks/razorpay` in `createApp()` before `express.json`, using `express.raw({ type: 'application/json', limit: '1mb' })`. Verify `X-Razorpay-Signature` over the untouched bytes with a dedicated required webhook secret and constant-time comparison. Persist the provider event ID before processing. Map only the supported failure, charged-renewal, and cancellation events to lifecycle operations; acknowledge unsupported valid events without mutation. Store only a bounded sanitized event projection, never the full customer/payment payload.

- [ ] **Step 7: Run billing tests and commit**

Run: `cd server && npx tsx --test --test-force-exit tests/billingPlans.test.ts tests/api.integration.test.ts tests/quizCreditWallet.test.ts && npm run build`
Expected: all focused tests PASS and build exits 0.

```bash
git add server/src/controllers/planCatalogController.ts server/src/controllers/billingController.ts server/src/controllers/billingWebhookController.ts server/src/index.ts server/src/routes/api.ts server/tests/billingPlans.test.ts server/tests/api.integration.test.ts
git commit -m "feat: secure canonical plan checkout"
```

---

### Task 7: Canonical Customer and Superadmin Onboarding

**Files:**
- Modify: `server/src/controllers/onboardingController.ts`
- Modify: `server/src/controllers/adminOnboardingController.ts`
- Modify: `server/src/services/superAdminInstituteService.ts`
- Modify: `server/src/controllers/superAdminInstituteController.ts`
- Modify: `server/tests/superAdminOnboarding.test.ts`
- Modify: `server/tests/api.integration.test.ts`

**Interfaces:**
- Produces canonical onboarding input `{ plan, billingCycle, startTrial, marketplace }` and canonical onboarding preview/commit output.
- Consumes: catalogue and lifecycle services.

- [ ] **Step 1: Change tests first**

Replace `FULL/PAGE_ONLY/QUIZ_ONLY`, `FREE/BASIC/PRO`, `maxStudents`, and arbitrary initial credits in onboarding fixtures. Assert Marketplace provisioning is lifetime, Quiz/Enterprise trial provisioning grants exactly five included credits for 14 days, every new plan is unlimited, and Superadmin cannot submit a legacy or custom plan.

- [ ] **Step 2: Run and verify RED**

Run: `cd server && npx tsx --test --test-force-exit tests/superAdminOnboarding.test.ts tests/api.integration.test.ts`
Expected: FAIL because existing validators require legacy access/billing/limits fields.

- [ ] **Step 3: Simplify onboarding validation and creation**

Define:

```ts
type InstituteOnboardingInput = {
  owner: { name: string; phone: string; email?: string };
  institute: { name: string; city?: string; area?: string; address?: string };
  subscription: { plan: CanonicalPlan; billingCycle: BillingCycle; startTrial: boolean };
  marketplace: { isPubliclyListed: boolean; isVerified: boolean };
};
```

Reject `startTrial` for Marketplace and `ONE_TIME` for Quiz/Enterprise. Provision identity/listing first, then call the lifecycle service. Preserve existing idempotency, invite/setup delivery, duplicate owner checks, and manual verification fields.

- [ ] **Step 4: Remove configuration mutation backdoors**

Delete `maxStudents`, `isQuizOnly`, and aggregate `quizCredits` from the structured configuration allowlist. Plan and lifetime-credit changes remain available only through audited billing operations.

- [ ] **Step 5: Run onboarding tests and commit**

Run: `cd server && npx tsx --test --test-force-exit tests/superAdminOnboarding.test.ts tests/superAdminInstitutes.test.ts tests/api.integration.test.ts && npm run build`
Expected: all focused tests PASS and build exits 0.

```bash
git add server/src/controllers/onboardingController.ts server/src/controllers/adminOnboardingController.ts server/src/services/superAdminInstituteService.ts server/src/controllers/superAdminInstituteController.ts server/tests/superAdminOnboarding.test.ts server/tests/superAdminInstitutes.test.ts server/tests/api.integration.test.ts
git commit -m "feat: unify institute onboarding plans"
```

---

### Task 8: Lifecycle Email and WhatsApp Communications

**Files:**
- Create: `server/src/services/planNotificationService.ts`
- Create: `server/tests/planNotifications.test.ts`
- Modify: `server/src/utils/emailWorker.ts`
- Modify: `server/src/utils/whatsappWorker.ts`
- Modify: `server/src/services/subscriptionLifecycleService.ts`
- Modify: `server/src/controllers/billingWebhookController.ts`
- Modify: `server/src/services/superAdminCommunicationService.ts`
- Modify: `server/src/services/superAdminInstituteService.ts`
- Modify: `server/src/services/superAdminSystemService.ts`
- Modify: `docs/guides/WHATSAPP_BOT_SETUP.md`

**Interfaces:**
- Produces `scheduleLifecycleNotifications`, `cancelSatisfiedNotifications`, `dispatchDuePlanNotifications`, `retryPlanNotification`, and seven paired template definitions.
- Consumes: plan state, communication preferences, EmailJob, and WhatsappJob.

- [ ] **Step 1: Write failing template and schedule tests**

Assert the exact event set:

```ts
assert.deepEqual(Object.keys(PLAN_NOTIFICATION_TEMPLATES), [
  'TRIAL_STARTED',
  'PLAN_ACTIVATED',
  'EXPIRY_APPROACHING',
  'PAYMENT_DUE',
  'PAYMENT_FAILED',
  'PAYMENT_SUCCEEDED',
  'MARKETPLACE_FALLBACK'
]);
```

For an expiry at 2026-09-30, assert reminder dates 2026-09-23, 27, 29, 30 and overdue dates 2026-10-01, 03, 07. Run two schedulers concurrently and assert one record per event key/channel. Mark payment successful and assert future unpaid reminders become `CANCELLED`. Disable WhatsApp preference and assert only email jobs are created.

- [ ] **Step 2: Run and verify RED**

Run: `cd server && npx tsx --test --test-force-exit tests/planNotifications.test.ts`
Expected: FAIL because lifecycle notification scheduling is missing.

- [ ] **Step 3: Implement paired template definitions**

Each template declares a subject, text/HTML email render function, WhatsApp environment key, and ordered variables: owner name, institute name, canonical plan label, cycle, formatted amount, due/expiry date, payment link, and support contact. Render from persisted server state only.

Integrate scheduling after successful lifecycle commits and signed payment webhook transitions. Activation/renewal/payment handlers persist state first, then call the idempotent scheduler; notification failure is captured independently and never rolls back billing.

- [ ] **Step 4: Implement durable scheduling and dispatch**

Upsert `PlanNotification` by institute/event key/channel. When due, conditionally claim `PENDING` to `PROCESSING`, create the transport job transactionally with entity linkage, and project job completion/failure back to the notification. Missing credentials/template config changes notification to `FAILED` with a bounded error code; it never changes plan state.

- [ ] **Step 5: Expose observability and retry to Superadmin**

Include lifecycle notification history in institute billing history and system jobs. Reuse existing job retry authorization and add a typed notification retry path that only accepts `FAILED`/retryable records.

- [ ] **Step 6: Document provider templates**

List each required environment variable, ordered WhatsApp body variables, sample rendered content, Meta approval step, SMTP requirements, test procedure, and failure-state inspection. Do not include credentials or real customer data.

- [ ] **Step 7: Run communication tests and commit**

Run: `cd server && npx tsx --test --test-force-exit tests/planNotifications.test.ts tests/superAdminCommunications.test.ts tests/superAdminSystem.test.ts && npm run build`
Expected: all focused tests PASS and build exits 0.

```bash
git add server/src/services/planNotificationService.ts server/src/services/subscriptionLifecycleService.ts server/src/controllers/billingWebhookController.ts server/src/utils/emailWorker.ts server/src/utils/whatsappWorker.ts server/src/services/superAdminCommunicationService.ts server/src/services/superAdminInstituteService.ts server/src/services/superAdminSystemService.ts server/tests/planNotifications.test.ts docs/guides/WHATSAPP_BOT_SETUP.md
git commit -m "feat: add plan lifecycle communications"
```

---

### Task 9: Canonical Superadmin Billing Operations and Reporting

**Files:**
- Modify: `server/src/services/superAdminRevenueService.ts`
- Modify: `server/src/controllers/superAdminRevenueController.ts`
- Modify: `server/src/services/superAdminHomeService.ts`
- Modify: `server/src/services/superAdminInstituteService.ts`
- Modify: `server/tests/superAdminRevenue.test.ts`
- Modify: `server/tests/superAdminHome.test.ts`
- Modify: `server/tests/superAdminInstitutes.test.ts`

**Interfaces:**
- Produces plan operations limited to `PLAN_CHANGE`, `TRIAL_EXTENSION`, `LIFETIME_CREDIT_ADJUSTMENT`, `PLAN_REVOKE`, and `MANUAL_PAYMENT_REFERENCE`.
- Consumes: lifecycle and wallet services.

- [ ] **Step 1: Write failing Superadmin tests**

Assert `STUDENT_LIMIT_ADJUSTMENT` is rejected, `QUIZ_CREDIT_ADJUSTMENT` is replaced by explicit lifetime adjustment, plan change accepts only three canonical plans and valid cycle/date combinations, revocation produces effective Marketplace fallback, history returns included/lifetime balances and notifications, and revenue groups contain no legacy plan labels.

- [ ] **Step 2: Run and verify RED**

Run: `cd server && npx tsx --test --test-force-exit tests/superAdminRevenue.test.ts tests/superAdminHome.test.ts tests/superAdminInstitutes.test.ts`
Expected: FAIL on legacy operations and projections.

- [ ] **Step 3: Route billing operations through domain services**

Retain reason, re-authentication, idempotency, conditional claiming, retries, and audit. `PLAN_CHANGE` calls lifecycle activation/scheduling; trial extension updates the included-credit expiry consistently; lifetime adjustment calls the wallet; revoke sets paid expiry to now while preserving Marketplace entitlement.

- [ ] **Step 4: Update projections and reports**

Return subscribed plan, effective plan/access, billing cycle, trial dates, plan dates, Marketplace entitlement date, included/lifetime/usable credits, included expiry/next refresh, payments, operations, and notification deliveries. Map legacy rows through the compatibility normalizer only until backfill completes.

- [ ] **Step 5: Run Superadmin tests and commit**

Run: `cd server && npx tsx --test --test-force-exit tests/superAdminRevenue.test.ts tests/superAdminHome.test.ts tests/superAdminInstitutes.test.ts tests/superAdminOnboarding.test.ts && npm run build`
Expected: all focused tests PASS and build exits 0.

```bash
git add server/src/services/superAdminRevenueService.ts server/src/controllers/superAdminRevenueController.ts server/src/services/superAdminHomeService.ts server/src/services/superAdminInstituteService.ts server/tests/superAdminRevenue.test.ts server/tests/superAdminHome.test.ts server/tests/superAdminInstitutes.test.ts
git commit -m "feat: canonicalize superadmin billing operations"
```

---

### Task 10: Shared Client Catalogue and Customer Plan Journeys

**Files:**
- Create: `client/src/features/plans/types.ts`
- Create: `client/src/features/plans/api.ts`
- Create: `client/src/features/plans/planViewModel.ts`
- Create: `client/src/features/plans/planViewModel.test.ts`
- Create: `client/src/features/plans/PlanCards.tsx`
- Modify: `client/src/pages/Home.tsx`
- Modify: `client/src/pages/Onboarding.tsx`
- Modify: `client/src/pages/JoinOnboarding.tsx`
- Modify: `client/src/pages/SetupAccount.tsx`
- Modify: `client/src/pages/Billing.tsx`
- Modify: relevant client routing/API tests.

**Interfaces:**
- Produces reusable catalogue cards and typed billing wallet state.
- Consumes: `GET /api/plans` and canonical billing/onboarding contracts from Tasks 6–7.

- [ ] **Step 1: Write failing view-model and integration tests**

Assert rendered cards show Marketplace ₹99 and “Free for now,” Quiz ₹249/₹2,499, Enterprise ₹499/₹4,999, 14-day trials on Quiz/Enterprise only, five monthly credits, lifetime top-ups, Marketplace fallback, and “Unlimited students” on all three. Assert none of `FREE`, `BASIC`, `PRO`, `PAGE_ONLY`, `QUIZ_ONLY`, “500 students,” or “100 students” appears.

- [ ] **Step 2: Run and verify RED**

Run: `cd client && npm run test:run -- src/features/plans/planViewModel.test.ts`
Expected: FAIL because shared plan components do not exist.

- [ ] **Step 3: Implement typed catalogue loading and view model**

Use the existing `api` wrapper. Validate the response is the three known canonical IDs before projecting cards. On catalogue load failure, show an actionable retry state; do not silently fall back to stale hard-coded prices.

- [ ] **Step 4: Replace duplicated customer plan arrays**

Use `PlanCards` in Home, Onboarding, JoinOnboarding, SetupAccount, and Billing. Keep each page's layout but remove local price/feature arrays and legacy plan unions. Marketplace promo invokes immediate activation; Quiz/Enterprise offer trial and paid monthly/yearly choices. Billing wallet labels included credits with expiry and lifetime credits as never expiring.

- [ ] **Step 5: Run client tests, lint, and build**

Run: `cd client && npm run test:run && npm run lint && npm run build`
Expected: all tests PASS, ESLint exits 0, and Vite build exits 0.

- [ ] **Step 6: Commit**

```bash
git add client/src/features/plans client/src/pages/Home.tsx client/src/pages/Onboarding.tsx client/src/pages/JoinOnboarding.tsx client/src/pages/SetupAccount.tsx client/src/pages/Billing.tsx
git commit -m "feat: unify customer plan journeys"
```

---

### Task 11: Superadmin Canonical Plan UI

**Files:**
- Modify: `client/src/features/superadmin-institutes/InstituteDirectory.tsx`
- Modify: `client/src/features/superadmin-institutes/InstituteWorkspace.tsx`
- Modify: `client/src/features/superadmin-institutes/OnboardingWizard.tsx`
- Modify: `client/src/features/superadmin-institutes/StructuredConfigForm.tsx`
- Modify: `client/src/features/superadmin-institutes/types.ts`
- Modify: `client/src/features/superadmin-institutes/api.ts`
- Modify: `client/src/features/superadmin-revenue/BillingOperationDialog.tsx`
- Modify: `client/src/features/superadmin-revenue/BillingOperationDialog.test.tsx`
- Create or modify: `client/src/features/superadmin-institutes/OnboardingWizard.test.tsx`

**Interfaces:**
- Produces canonical directory filters, onboarding payload, billing operation payload, and institute billing display.
- Consumes: canonical Superadmin APIs from Tasks 7 and 9.

- [ ] **Step 1: Write failing component tests**

Assert directory filters contain only Marketplace/Quiz/Enterprise; onboarding is five steps without Access/Limits duplication; plan selection includes cycle/trial rules; workspace shows subscribed/effective plan, Marketplace lifetime status, both credit buckets and next refresh; billing dialog has no custom/legacy/student-limit choices and sends `LIFETIME_CREDIT_ADJUSTMENT`.

- [ ] **Step 2: Run and verify RED**

Run: `cd client && npm run test:run -- src/features/superadmin-revenue/BillingOperationDialog.test.tsx src/features/superadmin-institutes/OnboardingWizard.test.tsx`
Expected: FAIL on legacy options and missing canonical fields.

- [ ] **Step 3: Update typed API contracts and UI**

Use `CanonicalPlan` and `BillingCycle` from `features/plans/types.ts`. Remove `access.kind`, `limits.maxStudents`, `isQuizOnly`, and arbitrary included-credit input. Keep listing visibility/manual verification. Lifetime adjustments show before/after balance and require the existing protected billing flow.

- [ ] **Step 4: Run client verification and commit**

Run: `cd client && npm run test:run && npm run lint && npm run build`
Expected: all tests PASS, ESLint exits 0, and Vite build exits 0.

```bash
git add client/src/features/superadmin-institutes client/src/features/superadmin-revenue client/src/features/plans/types.ts
git commit -m "feat: canonicalize superadmin plan management"
```

---

### Task 12: Migration Preflight, Cutover, and Release Verification

**Files:**
- Modify: `README.md`
- Modify: `docs/guides/WHATSAPP_BOT_SETUP.md`
- Create: `docs/guides/CANONICAL_PLAN_CUTOVER.md`
- Modify: any stale plan copy found by the scans below.

**Interfaces:**
- Consumes all previous task outputs.
- Produces a clean committed release and an auditable preflight/apply report.

- [ ] **Step 1: Add a repository-wide stale-plan regression scan**

Run:

```bash
rg -n "FREE|BASIC|PRO|NO_PLAN|PAGE_ONLY|QUIZ_ONLY|FULL|All Inclusive|Quiz Starter|₹250|₹500|₹2,500|₹5,000|maxStudents|Student capacity" client/src server/src README.md docs/guides
```

Classify each hit. Only the legacy alias map, migration compatibility, historical documentation clearly labelled historical, and unrelated monetary/student text may remain. Remove or update every active product/UI/operation hit.

- [ ] **Step 2: Run fresh schema and migration verification**

Run: `cd server && npx prisma format && npx prisma validate && npx prisma generate && npx tsx --test --test-force-exit tests/canonicalPlanMigration.test.ts tests/planCatalog.test.ts tests/planEntitlements.test.ts tests/quizCreditWallet.test.ts tests/subscriptionLifecycle.test.ts tests/planNotifications.test.ts tests/billingPlans.test.ts`
Expected: Prisma commands PASS and every focused plan test passes.

- [ ] **Step 3: Run complete server verification**

Run: `cd server && WHATSAPP_ACCESS_TOKEN= WHATSAPP_PHONE_NUMBER_ID= WHATSAPP_VERIFY_TOKEN= EMAIL_USER= EMAIL_PASS= npm test`
Expected: all server tests PASS with zero failures.

- [ ] **Step 4: Run complete client verification**

Run: `cd client && npm run test:run && npm run lint && npm run build`
Expected: all client tests PASS, ESLint exits 0, and the production build exits 0.

- [ ] **Step 5: Run server build and diff checks**

Run: `cd server && npm run build`
Expected: TypeScript build exits 0.

Run: `git diff --check && git status --short`
Expected: no whitespace errors; only intended release files are modified before the final commit.

- [ ] **Step 6: Run read-only migration preflight against the configured database**

Run: `cd server && npx tsx src/scripts/migrateCanonicalPlans.ts --preflight`
Expected: prints the database host/schema fingerprint, candidate count, current plan distribution, aggregate credits, and protected business-table counts; performs zero writes.

Compare the output with the intended configured database. Stop if the target, counts, or plan distribution are unexpected.

- [ ] **Step 7: Apply schema migration and canonical account backfill**

Apply migrations using the repository's safe deployment path. If migration history is divergent, use `prisma migrate diff` to prove the intended SQL is additive and apply only the reviewed migration SQL; do not reset any database.

Run: `cd server && npx tsx src/scripts/migrateCanonicalPlans.ts --apply`
Expected: every candidate is marked migrated, every stored plan is Enterprise, dates and protected business counts are unchanged, current aggregate credits equal preserved lifetime plus included credits, and the script prints the before/after report.

- [ ] **Step 8: Re-run preflight and authenticated smoke tests**

Run preflight again and expect zero candidates. Exercise `GET /api/plans`, authenticated billing state, Superadmin Home/institute/revenue, Marketplace listing/leads, trial eligibility on a controlled fixture, and quiz wallet projection. Do not create a real Razorpay charge or send a real customer communication during smoke testing.

- [ ] **Step 9: Commit documentation and final cleanup**

```bash
git add README.md docs/guides client server
git commit -m "feat: release canonical three-plan billing"
```

- [ ] **Step 10: Final evidence report**

Record commit IDs, migration name, configured database fingerprint, candidate/migrated counts, before/after protected counts, test totals, build results, remaining legacy-alias-only scan hits, and external Meta template approval steps. Do not report completion until every fresh command above has been read and confirmed successful.
