import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { Client } from 'pg';
import { PrismaClient } from '@prisma/client';
import {
  createPlanSubscriptionCheckoutService,
  type PlanSubscriptionCheckoutService
} from '../src/services/planSubscriptionCheckoutService';
import type { PlanSubscriptionProvider, ProviderSubscription, ProviderPayment } from '../src/services/planSubscriptionProvider';

class MockSubscriptionProvider implements PlanSubscriptionProvider {
  public createCalls: any[] = [];
  public cancelCalls: any[] = [];
  public shouldTimeoutCreate = false;

  async create(input: any): Promise<ProviderSubscription> {
    this.createCalls.push(input);
    if (this.shouldTimeoutCreate) {
      const error: any = new Error('Gateway Timeout');
      error.code = 'ETIMEDOUT';
      throw error;
    }
    return {
      id: `sub_${crypto.randomUUID().slice(0, 8)}`,
      planId: input.planId,
      status: 'created',
      totalCount: input.totalCount,
      startAt: input.startAt ?? null,
      createdAt: new Date(),
      notes: input.notes
    };
  }

  async fetchSubscription(id: string): Promise<ProviderSubscription> {
    return {
      id,
      planId: 'plan_quiz_123',
      status: 'authenticated',
      totalCount: 120,
      startAt: null,
      createdAt: new Date()
    };
  }

  async fetchPayment(id: string): Promise<ProviderPayment> {
    return {
      id,
      subscriptionId: 'sub_test',
      amountPaise: 24900,
      currency: 'INR',
      status: 'captured',
      createdAt: new Date()
    };
  }

  async findByAttemptId(attemptId: string): Promise<ProviderSubscription[]> {
    return [];
  }

  async cancel(id: string, cancelAtCycleEnd: boolean): Promise<ProviderSubscription> {
    this.cancelCalls.push({ id, cancelAtCycleEnd });
    return {
      id,
      planId: 'plan_quiz_123',
      status: 'cancelled',
      totalCount: 120,
      startAt: null,
      createdAt: new Date()
    };
  }
}

const env = {
  RAZORPAY_SUBSCRIPTIONS_ENABLED: 'true',
  RAZORPAY_PLAN_QUIZ_MONTHLY: 'plan_quiz_123',
  RAZORPAY_PLAN_ENTERPRISE_MONTHLY: 'plan_enterprise_123',
  RAZORPAY_KEY_ID: 'rzp_test_key',
  RAZORPAY_KEY_SECRET: 'test_secret'
};

const schema = `checkout_test_${Date.now()}_${Math.random().toString(16).slice(2)}`;
const sourceSchema = (new URL(process.env.DATABASE_URL!).searchParams.get('schema') || 'public').replaceAll('"', '""');
let pgClient: Client;
let prisma: PrismaClient;

before(async () => {
  pgClient = new Client({ connectionString: process.env.DATABASE_URL });
  await pgClient.connect();
  await pgClient.query(`CREATE SCHEMA "${schema}"`);
  await pgClient.query(`SET search_path TO "${schema}"`);

  // Baseline schema
  await pgClient.query(`
    CREATE TYPE "${schema}"."Tier" AS ENUM ('FREE', 'PRO', 'ENTERPRISE', 'NO_PLAN', 'BASIC', 'MARKETPLACE', 'QUIZ');
    CREATE TYPE "${schema}"."BillingCycle" AS ENUM ('MONTHLY', 'YEARLY', 'ONE_TIME');
    CREATE TYPE "${schema}"."CoachingFeeMode" AS ENUM ('CURRENT_DUE_BASED', 'MONTH_COVERAGE');

    CREATE TABLE "${schema}"."Institute" (LIKE "${sourceSchema}"."Institute" INCLUDING ALL);
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

test('eligible checkout schedules 14 days and 120 cycles', async () => {
  const provider = new MockSubscriptionProvider();
  const service = createPlanSubscriptionCheckoutService({ prisma, provider, env });

  const phone = `9${Math.floor(100000000 + Math.random() * 900000000)}`;
  const now = new Date('2026-08-17T00:00:00.000Z');

  const session = await service.createMonthlySubscriptionCheckout({
    context: { kind: 'PUBLIC_ONBOARDING', ownerIdentity: phone, provisioning: { kind: 'PUBLIC', instituteName: 'Test Inst', ownerName: 'Owner', phone, email: 't@example.com' } },
    plan: 'QUIZ',
    now
  });

  assert.equal(session.mode, 'SUBSCRIPTION');
  assert.equal(session.trialEligible, true);
  assert.equal(session.plan, 'QUIZ');
  assert.equal(session.billingCycle, 'MONTHLY');
  assert.equal(session.totalCount, 120);
  assert.equal(session.amount, 24900);
  assert.equal(session.firstChargeAt.toISOString(), '2026-08-31T00:00:00.000Z');
  assert.equal(provider.createCalls.length, 1);
  assert.equal(provider.createCalls[0].planId, 'plan_quiz_123');
  assert.equal(provider.createCalls[0].totalCount, 120);
  assert.equal(provider.createCalls[0].startAt?.toISOString(), '2026-08-31T00:00:00.000Z');
});

test('used trial starts immediately but grants nothing before charge', async () => {
  const provider = new MockSubscriptionProvider();
  const service = createPlanSubscriptionCheckoutService({ prisma, provider, env });

  const phone = `9${Math.floor(100000000 + Math.random() * 900000000)}`;

  const inst = await prisma.institute.create({
    data: {
      id: `inst_${crypto.randomUUID().slice(0, 8)}`,
      name: 'Used Trial Institute',
      phoneNumber: phone,
      plan: 'MARKETPLACE',
      trialUsedAt: new Date('2026-01-01T00:00:00.000Z')
    }
  });

  const session = await service.createMonthlySubscriptionCheckout({
    context: { kind: 'INSTITUTE', instituteId: inst.id, ownerIdentity: phone },
    plan: 'QUIZ',
    now: new Date('2026-08-17T00:00:00.000Z')
  });

  assert.equal(session.trialEligible, false);
  assert.equal(session.firstChargeAt.toISOString(), '2026-08-17T00:00:00.000Z');
  assert.equal(provider.createCalls[0].startAt, undefined);

  // Institute remains MARKETPLACE until charged
  const currentInst = await prisma.institute.findUniqueOrThrow({ where: { id: inst.id } });
  assert.equal(currentInst.plan, 'MARKETPLACE');
});

test('an existing paid one-time month schedules AutoPay at its current expiry', async () => {
  const provider = new MockSubscriptionProvider();
  const service = createPlanSubscriptionCheckoutService({ prisma, provider, env });

  const phone = `9${Math.floor(100000000 + Math.random() * 900000000)}`;
  const expiry = new Date('2026-09-15T00:00:00.000Z');

  const inst = await prisma.institute.create({
    data: {
      id: `inst_${crypto.randomUUID().slice(0, 8)}`,
      name: 'Paid One-Time Institute',
      phoneNumber: phone,
      plan: 'QUIZ',
      billingCycle: 'ONE_TIME',
      planExpiryDate: expiry
    }
  });

  const session = await service.createMonthlySubscriptionCheckout({
    context: { kind: 'INSTITUTE', instituteId: inst.id, ownerIdentity: phone },
    plan: 'QUIZ',
    now: new Date('2026-08-17T00:00:00.000Z')
  });

  assert.equal(session.trialEligible, false);
  assert.equal(session.firstChargeAt.toISOString(), expiry.toISOString());
  assert.equal(provider.createCalls[0].startAt?.toISOString(), expiry.toISOString());
});

test('a different plan is rejected while another mandate is open', async () => {
  const provider = new MockSubscriptionProvider();
  const service = createPlanSubscriptionCheckoutService({ prisma, provider, env });

  const phone = `9${Math.floor(100000000 + Math.random() * 900000000)}`;
  const inst = await prisma.institute.create({
    data: {
      id: `inst_${crypto.randomUUID().slice(0, 8)}`,
      name: 'Dual Attempt Institute',
      phoneNumber: phone,
      plan: 'MARKETPLACE'
    }
  });

  const first = await service.createMonthlySubscriptionCheckout({
    context: { kind: 'INSTITUTE', instituteId: inst.id, ownerIdentity: phone },
    plan: 'QUIZ',
    now: new Date('2026-08-17T00:00:00.000Z')
  });

  await assert.rejects(
    () => service.createMonthlySubscriptionCheckout({
      context: { kind: 'INSTITUTE', instituteId: inst.id, ownerIdentity: phone },
      plan: 'ENTERPRISE',
      now: new Date('2026-08-17T00:00:00.000Z')
    }),
    /ACTIVE_SUBSCRIPTION_EXISTS/
  );
});

test('provider timeout becomes PROVIDER_UNKNOWN and retry requires reconciliation', async () => {
  const provider = new MockSubscriptionProvider();
  provider.shouldTimeoutCreate = true;
  const service = createPlanSubscriptionCheckoutService({ prisma, provider, env });

  const phone = `9${Math.floor(100000000 + Math.random() * 900000000)}`;
  const input = {
    context: { kind: 'PUBLIC_ONBOARDING' as const, ownerIdentity: phone, provisioning: { kind: 'PUBLIC' as const, instituteName: 'Timeout Inst', ownerName: 'Owner', phone, email: 't@example.com' } },
    plan: 'QUIZ' as const,
    now: new Date('2026-08-17T00:00:00.000Z')
  };

  await assert.rejects(() => service.createMonthlySubscriptionCheckout(input), /SUBSCRIPTION_PROVIDER_UNCERTAIN/);
  await assert.rejects(() => service.createMonthlySubscriptionCheckout(input), /SUBSCRIPTION_RECONCILIATION_REQUIRED/);
  assert.equal(provider.createCalls.length, 1);
});

test('authenticated Billing cannot claim an unbound onboarding subscription', async () => {
  const provider = new MockSubscriptionProvider();
  const service = createPlanSubscriptionCheckoutService({ prisma, provider, env });
  await prisma.planSubscription.create({ data: {
    ownerIdentityHash: crypto.randomBytes(32).toString('hex'), providerSubscriptionId: 'sub_test',
    providerPlanId: 'plan_quiz_123', plan: 'QUIZ', billingCycle: 'MONTHLY', amountPaise: 24900,
    currency: 'INR', totalCount: 120, trialEligible: true,
    intendedStartAt: new Date('2026-08-31T00:00:00.000Z'), status: 'CREATED',
    provisioningData: { kind: 'PUBLIC', instituteName: 'Other', ownerName: 'Other', phone: '9557940807', email: 'other@example.com' }
  } });
  const signature = crypto.createHmac('sha256', env.RAZORPAY_KEY_SECRET).update('pay_auth|sub_test').digest('hex');

  await assert.rejects(service.verifyMonthlySubscriptionCheckout({
    razorpay_payment_id: 'pay_auth', razorpay_subscription_id: 'sub_test',
    razorpay_signature: signature, instituteId: 'logged-in-institute'
  }), /SUBSCRIPTION_BINDING_MISMATCH/);
});
