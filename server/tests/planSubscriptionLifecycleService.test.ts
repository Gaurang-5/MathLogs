import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { Client } from 'pg';
import { PrismaClient } from '@prisma/client';
import {
  createPlanSubscriptionLifecycleService,
  type PlanSubscriptionLifecycleService
} from '../src/services/planSubscriptionLifecycleService';
import {
  createPlanSubscriptionReconciliationService,
  type PlanSubscriptionReconciliationService
} from '../src/services/planSubscriptionReconciliationService';
import type { PlanSubscriptionProvider, ProviderSubscription, ProviderPayment } from '../src/services/planSubscriptionProvider';

class MockLifecycleProvider implements PlanSubscriptionProvider {
  public subscriptions: Map<string, ProviderSubscription> = new Map();
  public payments: Map<string, ProviderPayment> = new Map();
  public cancelCalls: any[] = [];

  async create(input: any): Promise<ProviderSubscription> {
    const sub: ProviderSubscription = {
      id: `sub_${crypto.randomUUID().slice(0, 8)}`,
      planId: input.planId,
      status: 'created',
      totalCount: input.totalCount,
      startAt: input.startAt ?? null,
      createdAt: new Date(),
      notes: input.notes
    };
    this.subscriptions.set(sub.id, sub);
    return sub;
  }

  async fetchSubscription(id: string): Promise<ProviderSubscription> {
    const sub = this.subscriptions.get(id);
    if (!sub) throw new Error(`Subscription ${id} not found`);
    return sub;
  }

  async fetchPayment(id: string): Promise<ProviderPayment> {
    const p = this.payments.get(id);
    if (!p) throw new Error(`Payment ${id} not found`);
    return p;
  }

  async findByAttemptId(attemptId: string): Promise<ProviderSubscription[]> {
    return Array.from(this.subscriptions.values()).filter(s => s.notes?.attemptId === attemptId);
  }

  async cancel(id: string, cancelAtCycleEnd: boolean): Promise<ProviderSubscription> {
    this.cancelCalls.push({ id, cancelAtCycleEnd });
    const sub = this.subscriptions.get(id);
    if (sub) {
      sub.status = 'cancelled';
    }
    return sub || {
      id,
      planId: 'plan_quiz',
      status: 'cancelled',
      totalCount: 120,
      startAt: null,
      createdAt: new Date()
    };
  }
}

const schema = `lifecycle_test_${Date.now()}_${Math.random().toString(16).slice(2)}`;
const sourceSchema = (new URL(process.env.DATABASE_URL!).searchParams.get('schema') || 'public').replaceAll('"', '""');
let pgClient: Client;
let prisma: PrismaClient;

before(async () => {
  pgClient = new Client({ connectionString: process.env.DATABASE_URL });
  await pgClient.connect();
  await pgClient.query(`CREATE SCHEMA "${schema}"`);
  await pgClient.query(`SET search_path TO "${schema}"`);

  await pgClient.query(`
    CREATE TYPE "${schema}"."Tier" AS ENUM ('FREE', 'PRO', 'ENTERPRISE', 'NO_PLAN', 'BASIC', 'MARKETPLACE', 'QUIZ');
    CREATE TYPE "${schema}"."BillingCycle" AS ENUM ('MONTHLY', 'YEARLY', 'ONE_TIME');
    CREATE TYPE "${schema}"."CoachingFeeMode" AS ENUM ('CURRENT_DUE_BASED', 'MONTH_COVERAGE');

    CREATE TABLE "${schema}"."Institute" (LIKE "${sourceSchema}"."Institute" INCLUDING ALL);
    CREATE TABLE "${schema}"."InviteToken" (LIKE "${sourceSchema}"."InviteToken" INCLUDING ALL);
    ALTER TABLE "${schema}"."Institute" ALTER COLUMN "plan" DROP DEFAULT;
    ALTER TABLE "${schema}"."Institute" ALTER COLUMN "plan" TYPE "${schema}"."Tier" USING "plan"::text::"${schema}"."Tier";
    ALTER TABLE "${schema}"."Institute" ALTER COLUMN "plan" SET DEFAULT 'MARKETPLACE'::"${schema}"."Tier";
    ALTER TABLE "${schema}"."Institute" ALTER COLUMN "billingCycle" TYPE "${schema}"."BillingCycle" USING "billingCycle"::text::"${schema}"."BillingCycle";
    ALTER TABLE "${schema}"."Institute" ALTER COLUMN "coachingFeeMode" DROP DEFAULT;
    ALTER TABLE "${schema}"."Institute" ALTER COLUMN "coachingFeeMode" TYPE "${schema}"."CoachingFeeMode" USING "coachingFeeMode"::text::"${schema}"."CoachingFeeMode";
    ALTER TABLE "${schema}"."Institute" ALTER COLUMN "coachingFeeMode" SET DEFAULT 'CURRENT_DUE_BASED'::"${schema}"."CoachingFeeMode";

    CREATE TABLE "${schema}"."PlanTrialClaim" (
      id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
      "instituteId" TEXT UNIQUE NOT NULL,
      "ownerIdentityHash" VARCHAR(128) UNIQUE NOT NULL,
      plan "${schema}"."Tier" NOT NULL,
      "claimedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "endsAt" TIMESTAMP(3),
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE "${schema}"."BillingWebhookEvent" (
      id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
      "providerEventId" TEXT UNIQUE NOT NULL,
      "eventType" TEXT NOT NULL,
      payload JSONB NOT NULL,
      status TEXT NOT NULL DEFAULT 'RECEIVED',
      "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
  `);

  const migrationSql = await readFile(
    path.join(process.cwd(), 'prisma/migrations/20260817150000_razorpay_recurring_autopay/migration.sql'),
    'utf8'
  );
  await pgClient.query(migrationSql);

  const url = new URL(process.env.DATABASE_URL!);
  url.searchParams.set('schema', schema);
  prisma = new PrismaClient({ datasources: { db: { url: url.toString() } } });
});

after(async () => {
  if (prisma) await prisma.$disconnect();
  if (pgClient) {
    await pgClient.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
    await pgClient.end();
  }
});

test('AUTHENTICATED for eligible trial grants trial access and credits immediately', async () => {
  const provider = new MockLifecycleProvider();
  const service = createPlanSubscriptionLifecycleService({ prisma, provider });

  const phone = `9${Math.floor(100000000 + Math.random() * 900000000)}`;
  const ownerHash = crypto.createHmac('sha256', 'secret').update(phone).digest('hex');

  const inst = await prisma.institute.create({
    data: {
      id: `inst_${crypto.randomUUID().slice(0, 8)}`,
      name: 'Trial Lifecycle Inst',
      phoneNumber: phone,
      plan: 'MARKETPLACE'
    }
  });

  const subId = `sub_${crypto.randomUUID().slice(0, 8)}`;
  const planSub = await prisma.planSubscription.create({
    data: {
      instituteId: inst.id,
      ownerIdentityHash: ownerHash,
      providerSubscriptionId: subId,
      providerPlanId: 'plan_quiz',
      plan: 'QUIZ',
      billingCycle: 'MONTHLY',
      amountPaise: 24900,
      currency: 'INR',
      totalCount: 120,
      trialEligible: true,
      intendedStartAt: new Date(Date.now() + 14 * 86_400_000),
      trialEndsAt: new Date(Date.now() + 14 * 86_400_000),
      status: 'CREATED'
    }
  });

  const now = new Date('2026-08-17T00:00:00.000Z');
  await service.applySubscriptionEvent({
    kind: 'AUTHENTICATED',
    providerSubscriptionId: subId,
    startsAt: new Date('2026-08-31T00:00:00.000Z'),
    now
  });

  const updatedSub = await prisma.planSubscription.findUniqueOrThrow({ where: { id: planSub.id } });
  assert.equal(updatedSub.status, 'AUTHENTICATED');

  const updatedInst = await prisma.institute.findUniqueOrThrow({ where: { id: inst.id } });
  assert.equal(updatedInst.plan, 'QUIZ');
  assert.equal(updatedInst.includedQuizCredits, 5);
  assert.equal(updatedInst.quizCredits, 5);
  assert.equal(updatedInst.trialEndsAt?.toISOString(), '2026-08-31T00:00:00.000Z');

  const claim = await prisma.planTrialClaim.findUnique({ where: { instituteId: inst.id } });
  assert.ok(claim);
  assert.equal(claim.plan, 'QUIZ');
});

test('CHARGED activates paid period, inserts charge row, and renews included credits', async () => {
  const provider = new MockLifecycleProvider();
  const service = createPlanSubscriptionLifecycleService({ prisma, provider });

  const phone = `9${Math.floor(100000000 + Math.random() * 900000000)}`;
  const ownerHash = crypto.createHmac('sha256', 'secret').update(phone).digest('hex');

  const inst = await prisma.institute.create({
    data: {
      id: `inst_${crypto.randomUUID().slice(0, 8)}`,
      name: 'Charge Lifecycle Inst',
      phoneNumber: phone,
      plan: 'QUIZ',
      includedQuizCredits: 5,
      quizCredits: 2,
      lifetimeQuizCredits: 10
    }
  });

  const subId = `sub_${crypto.randomUUID().slice(0, 8)}`;
  const planSub = await prisma.planSubscription.create({
    data: {
      instituteId: inst.id,
      ownerIdentityHash: ownerHash,
      providerSubscriptionId: subId,
      providerPlanId: 'plan_quiz',
      plan: 'QUIZ',
      billingCycle: 'MONTHLY',
      amountPaise: 24900,
      currency: 'INR',
      totalCount: 120,
      trialEligible: true,
      intendedStartAt: new Date('2026-08-31T00:00:00.000Z'),
      status: 'AUTHENTICATED'
    }
  });

  const now = new Date('2026-08-31T00:00:00.000Z');
  const periodEnd = new Date('2026-09-30T00:00:00.000Z');

  await service.applySubscriptionEvent({
    kind: 'CHARGED',
    providerSubscriptionId: subId,
    paymentId: 'pay_123456',
    amountPaise: 24900,
    providerPlanId: 'plan_quiz',
    currency: 'INR',
    currentStart: now,
    currentEnd: periodEnd,
    now
  });

  const updatedSub = await prisma.planSubscription.findUniqueOrThrow({ where: { id: planSub.id } });
  assert.equal(updatedSub.status, 'ACTIVE');
  assert.equal(updatedSub.currentPeriodEnd?.toISOString(), periodEnd.toISOString());

  const charges = await prisma.planSubscriptionCharge.findMany({ where: { planSubscriptionId: planSub.id } });
  assert.equal(charges.length, 1);
  assert.equal(charges[0].providerPaymentId, 'pay_123456');
  assert.equal(charges[0].amountPaise, 24900);

  const updatedInst = await prisma.institute.findUniqueOrThrow({ where: { id: inst.id } });
  assert.equal(updatedInst.plan, 'QUIZ');
  assert.equal(updatedInst.planExpiryDate?.toISOString(), periodEnd.toISOString());
  assert.equal(updatedInst.includedQuizCredits, 5);
  // 5 included renewed + 10 lifetime credits = 15
  assert.equal(updatedInst.quizCredits, 15);

  await prisma.institute.update({ where: { id: inst.id }, data: { quizCredits: 11 } });
  await service.applySubscriptionEvent({
    kind: 'CHARGED', providerSubscriptionId: subId, paymentId: 'pay_123456', amountPaise: 24900,
    providerPlanId: 'plan_quiz', currency: 'INR', currentStart: now, currentEnd: periodEnd,
    now: new Date('2026-08-31T00:05:00.000Z')
  });
  assert.equal((await prisma.institute.findUniqueOrThrow({ where: { id: inst.id } })).quizCredits, 11);

  await service.applySubscriptionEvent({
    kind: 'PENDING', providerSubscriptionId: subId,
    now: new Date('2026-08-30T23:59:00.000Z')
  });
  const afterDelayedFailure = await prisma.planSubscription.findUniqueOrThrow({ where: { id: planSub.id } });
  assert.equal(afterDelayedFailure.status, 'ACTIVE');
  assert.equal(afterDelayedFailure.graceEndsAt, null);
});

test('ACTIVATED provider state alone does not grant a paid period or refresh credits', async () => {
  const service = createPlanSubscriptionLifecycleService({ prisma, provider: new MockLifecycleProvider() });
  const inst = await prisma.institute.create({ data: {
    id: `inst_${crypto.randomUUID().slice(0, 8)}`, name: 'Activation Only Inst',
    phoneNumber: `9${Math.floor(100000000 + Math.random() * 900000000)}`,
    plan: 'MARKETPLACE', includedQuizCredits: 0, quizCredits: 0
  } });
  const subId = `sub_${crypto.randomUUID().slice(0, 8)}`;
  const planSub = await prisma.planSubscription.create({ data: {
    instituteId: inst.id, ownerIdentityHash: crypto.randomBytes(32).toString('hex'),
    providerSubscriptionId: subId, providerPlanId: 'plan_quiz', plan: 'QUIZ', billingCycle: 'MONTHLY',
    amountPaise: 24900, currency: 'INR', totalCount: 120, trialEligible: false,
    intendedStartAt: new Date('2026-08-31T00:00:00.000Z'), status: 'AUTHENTICATED'
  } });

  await service.applySubscriptionEvent({
    kind: 'ACTIVATED', providerSubscriptionId: subId,
    currentStart: new Date('2026-08-31T00:00:00.000Z'), currentEnd: new Date('2026-09-30T00:00:00.000Z')
  });

  const updatedInst = await prisma.institute.findUniqueOrThrow({ where: { id: inst.id } });
  const updatedSub = await prisma.planSubscription.findUniqueOrThrow({ where: { id: planSub.id } });
  assert.equal(updatedSub.status, 'ACTIVE');
  assert.equal(updatedSub.firstChargedAt, null);
  assert.equal(updatedInst.plan, 'MARKETPLACE');
  assert.equal(updatedInst.quizCredits, 0);
  assert.equal(updatedInst.planExpiryDate, null);
});

test('first CHARGED event provisions an unbound immediate-start onboarding before granting access', async () => {
  const service = createPlanSubscriptionLifecycleService({ prisma, provider: new MockLifecycleProvider() });
  const phone = `9${Math.floor(100000000 + Math.random() * 900000000)}`;
  const subId = `sub_${crypto.randomUUID().slice(0, 8)}`;
  const planSub = await prisma.planSubscription.create({ data: {
    ownerIdentityHash: crypto.randomBytes(32).toString('hex'), providerSubscriptionId: subId,
    providerPlanId: 'plan_enterprise', plan: 'ENTERPRISE', billingCycle: 'MONTHLY', amountPaise: 49900,
    currency: 'INR', totalCount: 120, trialEligible: false,
    intendedStartAt: new Date('2026-08-31T00:00:00.000Z'), status: 'CREATED',
    provisioningData: { kind: 'PUBLIC', instituteName: 'Charge First Inst', ownerName: 'Owner', phone, email: 'charge-first@example.com' }
  } });

  await service.applySubscriptionEvent({
    kind: 'CHARGED', providerSubscriptionId: subId, paymentId: 'pay_charge_first', amountPaise: 49900,
    providerPlanId: 'plan_enterprise', currency: 'INR', currentStart: new Date('2026-08-31T00:00:00.000Z'),
    currentEnd: new Date('2026-09-30T00:00:00.000Z'), now: new Date('2026-08-31T00:00:00.000Z')
  });

  const updatedSub = await prisma.planSubscription.findUniqueOrThrow({ where: { id: planSub.id } });
  assert.ok(updatedSub.instituteId);
  const institute = await prisma.institute.findUniqueOrThrow({ where: { id: updatedSub.instituteId! } });
  assert.equal(institute.plan, 'ENTERPRISE');
  assert.equal(institute.planExpiryDate?.toISOString(), '2026-09-30T00:00:00.000Z');
  assert.equal(institute.quizCredits, 5);
});

test('concurrent duplicate CHARGED delivery credits one payment and one period exactly once', async () => {
  const service = createPlanSubscriptionLifecycleService({ prisma, provider: new MockLifecycleProvider() });
  const phone = `9${Math.floor(100000000 + Math.random() * 900000000)}`;
  const inst = await prisma.institute.create({ data: {
    id: `inst_${crypto.randomUUID().slice(0, 8)}`, name: 'Concurrent Charge Inst', phoneNumber: phone,
    plan: 'QUIZ', lifetimeQuizCredits: 7, includedQuizCredits: 0, quizCredits: 7
  } });
  const subId = `sub_${crypto.randomUUID().slice(0, 8)}`;
  const planSub = await prisma.planSubscription.create({ data: {
    instituteId: inst.id, ownerIdentityHash: crypto.randomBytes(32).toString('hex'),
    providerSubscriptionId: subId, providerPlanId: 'plan_quiz', plan: 'QUIZ', billingCycle: 'MONTHLY',
    amountPaise: 24900, currency: 'INR', totalCount: 120, trialEligible: false,
    intendedStartAt: new Date('2026-08-31T00:00:00.000Z'), status: 'AUTHENTICATED'
  } });
  const charged = () => service.applySubscriptionEvent({
    kind: 'CHARGED' as const, providerSubscriptionId: subId, paymentId: 'pay_concurrent_1',
    amountPaise: 24900, providerPlanId: 'plan_quiz', currency: 'INR',
    currentStart: new Date('2026-08-31T00:00:00.000Z'), currentEnd: new Date('2026-09-30T00:00:00.000Z')
  });

  await Promise.all([charged(), charged()]);

  assert.equal(await prisma.planSubscriptionCharge.count({ where: { planSubscriptionId: planSub.id } }), 1);
  const updated = await prisma.institute.findUniqueOrThrow({ where: { id: inst.id } });
  assert.equal(updated.quizCredits, 12);
  assert.equal(updated.planExpiryDate?.toISOString(), '2026-09-30T00:00:00.000Z');
});

test('uncertain provider creation remains operator-reviewable when no provider match exists', async () => {
  const provider = new MockLifecycleProvider();
  const recon = createPlanSubscriptionReconciliationService({ prisma, provider });
  const planSub = await prisma.planSubscription.create({ data: {
    ownerIdentityHash: crypto.randomBytes(32).toString('hex'), providerPlanId: 'plan_quiz', plan: 'QUIZ',
    billingCycle: 'MONTHLY', amountPaise: 24900, currency: 'INR', totalCount: 120, trialEligible: false,
    intendedStartAt: new Date('2026-08-01T00:00:00.000Z'), status: 'PROVIDER_UNKNOWN',
    createdAt: new Date('2026-08-01T00:00:00.000Z')
  } });

  await recon.reconcileDueSubscriptions({ now: new Date('2026-08-02T00:00:00.000Z') });

  assert.equal((await prisma.planSubscription.findUniqueOrThrow({ where: { id: planSub.id } })).status, 'PROVIDER_UNKNOWN');
});

test('CHARGED rejects a payment whose amount, currency, or provider plan is not bound to the subscription', async () => {
  const service = createPlanSubscriptionLifecycleService({ prisma, provider: new MockLifecycleProvider() });
  const subId = `sub_${crypto.randomUUID().slice(0, 8)}`;
  const planSub = await prisma.planSubscription.create({ data: {
    ownerIdentityHash: crypto.randomBytes(32).toString('hex'), providerSubscriptionId: subId,
    providerPlanId: 'plan_quiz', plan: 'QUIZ', billingCycle: 'MONTHLY', amountPaise: 24900,
    currency: 'INR', totalCount: 120, trialEligible: false,
    intendedStartAt: new Date('2026-08-31T00:00:00.000Z'), status: 'AUTHENTICATED'
  } });

  await assert.rejects(service.applySubscriptionEvent({
    kind: 'CHARGED', providerSubscriptionId: subId, paymentId: 'pay_wrong_binding',
    amountPaise: 49900, providerPlanId: 'plan_enterprise', currency: 'USD',
    currentStart: new Date('2026-08-31T00:00:00.000Z'),
    currentEnd: new Date('2026-09-30T00:00:00.000Z')
  }), /SUBSCRIPTION_CHARGE_BINDING_MISMATCH/);

  assert.equal(await prisma.planSubscriptionCharge.count({ where: { planSubscriptionId: planSub.id } }), 0);
  assert.equal((await prisma.planSubscription.findUniqueOrThrow({ where: { id: planSub.id } })).status, 'AUTHENTICATED');
});

test('CHARGE_FAILED enters 3-day grace period and reconciliation downgrades after grace expiry', async () => {
  const provider = new MockLifecycleProvider();
  const service = createPlanSubscriptionLifecycleService({ prisma, provider });
  const recon = createPlanSubscriptionReconciliationService({ prisma, provider });

  const phone = `9${Math.floor(100000000 + Math.random() * 900000000)}`;
  const ownerHash = crypto.createHmac('sha256', 'secret').update(phone).digest('hex');

  const inst = await prisma.institute.create({
    data: {
      id: `inst_${crypto.randomUUID().slice(0, 8)}`,
      name: 'Grace Inst',
      phoneNumber: phone,
      plan: 'QUIZ',
      planExpiryDate: new Date('2026-08-31T00:00:00.000Z')
    }
  });

  const subId = `sub_${crypto.randomUUID().slice(0, 8)}`;
  const planSub = await prisma.planSubscription.create({
    data: {
      instituteId: inst.id,
      ownerIdentityHash: ownerHash,
      providerSubscriptionId: subId,
      providerPlanId: 'plan_quiz',
      plan: 'QUIZ',
      billingCycle: 'MONTHLY',
      amountPaise: 24900,
      currency: 'INR',
      totalCount: 120,
      trialEligible: false,
      intendedStartAt: new Date('2026-08-31T00:00:00.000Z'),
      currentPeriodEnd: new Date('2026-09-02T00:00:00.000Z'),
      status: 'ACTIVE'
    }
  });

  const failDate = new Date('2026-08-31T00:00:00.000Z');
  await service.applySubscriptionEvent({
    kind: 'CHARGE_FAILED',
    providerSubscriptionId: subId,
    paymentId: 'pay_failed_1',
    amountPaise: 24900,
    now: failDate
  });

  const pendingSub = await prisma.planSubscription.findUniqueOrThrow({ where: { id: planSub.id } });
  assert.equal(pendingSub.status, 'PENDING');
  // Grace is the later of current period end and three days after failure.
  assert.equal(pendingSub.graceEndsAt?.toISOString(), '2026-09-03T00:00:00.000Z');

  // Sweep before grace expiry does not downgrade
  await recon.reconcileStaleSubscriptions({ now: new Date('2026-09-01T00:00:00.000Z') });
  const stillPending = await prisma.planSubscription.findUniqueOrThrow({ where: { id: planSub.id } });
  assert.equal(stillPending.status, 'PENDING');

  // Sweep after grace expiry downgrades to MARKETPLACE and halts subscription
  await recon.reconcileStaleSubscriptions({ now: new Date('2026-09-04T00:00:00.000Z') });
  const haltedSub = await prisma.planSubscription.findUniqueOrThrow({ where: { id: planSub.id } });
  assert.equal(haltedSub.status, 'HALTED');

  const downgradedInst = await prisma.institute.findUniqueOrThrow({ where: { id: inst.id } });
  assert.equal(downgradedInst.plan, 'MARKETPLACE');
  assert.equal(downgradedInst.planExpiryDate, null);
});

test('cancelling trial cancels provider immediately and preserves trial until original end', async () => {
  const provider = new MockLifecycleProvider();
  const service = createPlanSubscriptionLifecycleService({ prisma, provider });

  const phone = `9${Math.floor(100000000 + Math.random() * 900000000)}`;
  const ownerHash = crypto.createHmac('sha256', 'secret').update(phone).digest('hex');

  const trialEnd = new Date('2026-08-31T00:00:00.000Z');
  const inst = await prisma.institute.create({
    data: {
      id: `inst_${crypto.randomUUID().slice(0, 8)}`,
      name: 'Trial Cancel Inst',
      phoneNumber: phone,
      plan: 'QUIZ',
      trialEndsAt: trialEnd,
      planExpiryDate: trialEnd
    }
  });

  const subId = `sub_${crypto.randomUUID().slice(0, 8)}`;
  provider.subscriptions.set(subId, {
    id: subId,
    planId: 'plan_quiz',
    status: 'authenticated',
    totalCount: 120,
    startAt: trialEnd,
    createdAt: new Date()
  });

  const planSub = await prisma.planSubscription.create({
    data: {
      instituteId: inst.id,
      ownerIdentityHash: ownerHash,
      providerSubscriptionId: subId,
      providerPlanId: 'plan_quiz',
      plan: 'QUIZ',
      billingCycle: 'MONTHLY',
      amountPaise: 24900,
      currency: 'INR',
      totalCount: 120,
      trialEligible: true,
      intendedStartAt: trialEnd,
      trialEndsAt: trialEnd,
      status: 'AUTHENTICATED'
    }
  });

  const cancelDate = new Date('2026-08-20T00:00:00.000Z');
  const firstCancel = await service.cancelSubscriptionForInstitute({
    instituteId: inst.id,
    now: cancelDate
  });
  const replayCancel = await service.cancelSubscriptionForInstitute({
    instituteId: inst.id,
    now: new Date('2026-08-21T00:00:00.000Z')
  });

  assert.equal(provider.cancelCalls.length, 1);
  assert.equal(provider.cancelCalls[0].cancelAtCycleEnd, false);
  assert.deepEqual(replayCancel, firstCancel);

  const cancelledSub = await prisma.planSubscription.findUniqueOrThrow({ where: { id: planSub.id } });
  assert.equal(cancelledSub.status, 'CANCELLED');
  assert.equal(cancelledSub.cancelAtPeriodEnd, false);

  // Institute trial access remains untouched until original trial end date
  const preservedInst = await prisma.institute.findUniqueOrThrow({ where: { id: inst.id } });
  assert.equal(preservedInst.plan, 'QUIZ');
  assert.equal(preservedInst.planExpiryDate?.toISOString(), trialEnd.toISOString());
});
