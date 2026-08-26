export type RevenueOverviewData = {
  metrics: { totalInstitutes: number; activeSubscriptions: number; expiringSoon: number; pendingOperations: number; failedOperations: number };
  byPlan: Array<{ plan: string; institutes: number }>;
  revenueDefinition: string;
};

export type SubscriptionItem = {
  instituteId: string; name: string; teacherName: string | null; status: string; plan: CanonicalPlan; effectivePlan: CanonicalPlan;
  billingCycle: BillingCycle | null; planStartDate: string | null; planExpiryDate: string | null;
  includedQuizCredits: number; lifetimeQuizCredits: number; totalUsableQuizCredits: number; unlimitedStudents: true; updatedAt: string;
};

export type SubscriptionResponse = { items: SubscriptionItem[]; page: number; pageSize: number; total: number };

export type BillingOperationDraft = {
  type: 'PLAN_CHANGE' | 'TRIAL_EXTENSION' | 'LIFETIME_CREDIT_ADJUSTMENT' | 'PLAN_REVOKE' | 'MANUAL_PAYMENT_REFERENCE';
  reason: string;
  effectiveAt?: string;
  payload: Record<string, unknown>;
};

export type BillingPreview = {
  request: BillingOperationDraft & { effectiveAt: string | null };
  before: Record<string, unknown>;
  after: Record<string, unknown>;
  effectiveAt: string;
  scheduled: boolean;
  protected: boolean;
  actionClass: 'PLAN_REVOKE' | 'BILLING_ADJUSTMENT' | null;
};

export type BillingOperation = {
  id: string; instituteId: string; type: string; reason: string; status: string; effectiveAt: string | null;
  appliedAt: string | null; error: string | null; attempts: number; maxAttempts: number; retryable: boolean;
  createdAt: string; updatedAt: string;
};

export type AutoPayBillingHistory = {
  providerState: 'UNCONFIGURED' | 'NO_SUBSCRIPTION' | 'AVAILABLE' | 'UNAVAILABLE';
  subscription: null | {
    status: string; plan: CanonicalPlan; amountPaise: number; nextChargeAt: string | null;
    currentPeriodEnd: string | null; graceEndsAt: string | null; cancelAtPeriodEnd: boolean;
    cancelEffectiveAt: string | null;
  };
  charges: Array<{ id: string; amountPaise: number; currency: string; providerPaymentId: string; periodEnd: string; createdAt: string }>;
  subscriptionPayments: Array<{ id: string; method: string | null; status: string; amountPaise: number; createdAt: string }>;
  operations: BillingOperation[];
};
import type { BillingCycle, CanonicalPlan } from '../plans/types';
