import type { CanonicalPlan } from './planCatalog';

export type EntitlementState = {
  plan?: CanonicalPlan | string | null;
  planExpiryDate?: Date | null;
  planStartDate?: Date | null;
  createdAt?: Date | null;
  trialEndsAt?: Date | null;
  marketplaceAccessGrantedAt?: Date | null;
  includedQuizCredits?: number | null;
  lifetimeQuizCredits?: number | null;
};

export type EffectiveEntitlements = {
  marketplace: boolean;
  quiz: boolean;
  enterprise: boolean;
  usableQuizCredits: number;
};

export type IncludedCreditPeriod = {
  includedQuizCreditsExpireAt: Date;
  quizCreditsRenewAt: Date;
};

function isActiveAt(date: Date | null | undefined, now: Date): boolean {
  return !date || date.getTime() >= now.getTime();
}

function nonNegativeBalance(value: number | null | undefined): number {
  return typeof value === 'number' && Number.isFinite(value) ? Math.max(0, value) : 0;
}

/**
 * Calculates the access a user may exercise now. Stored balances are never
 * changed here: an expired Quiz/Enterprise subscription simply makes them
 * unusable until access resumes.
 */
export function effectiveEntitlements(state: EntitlementState, now = new Date()): EffectiveEntitlements {
  const paidActive = isActiveAt(state.planExpiryDate, now);
  const trialActive = Boolean(state.trialEndsAt && state.trialEndsAt.getTime() >= now.getTime());
  const paidOrTrial = paidActive || trialActive;
  const quiz = paidOrTrial && (state.plan === 'QUIZ' || state.plan === 'ENTERPRISE');
  const enterprise = paidOrTrial && state.plan === 'ENTERPRISE';

  return {
    marketplace: Boolean(state.marketplaceAccessGrantedAt) || quiz,
    quiz,
    enterprise,
    usableQuizCredits: quiz ? nonNegativeBalance(state.includedQuizCredits) + nonNegativeBalance(state.lifetimeQuizCredits) : 0
  };
}

function daysInUtcMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
}

function anniversaryInUtcMonth(start: Date, year: number, month: number): Date {
  return new Date(Date.UTC(
    year,
    month,
    Math.min(start.getUTCDate(), daysInUtcMonth(year, month)),
    start.getUTCHours(),
    start.getUTCMinutes(),
    start.getUTCSeconds(),
    start.getUTCMilliseconds()
  ));
}

/** Returns the first monthly UTC anniversary strictly after `after`. */
export function nextBillingAnniversary(start: Date, after: Date): Date {
  if (Number.isNaN(start.getTime()) || Number.isNaN(after.getTime())) throw new Error('INVALID_BILLING_ANNIVERSARY_DATE');

  let year = after.getUTCFullYear();
  let month = after.getUTCMonth();
  let candidate = anniversaryInUtcMonth(start, year, month);
  if (candidate.getTime() > after.getTime()) return candidate;

  month += 1;
  if (month === 12) {
    month = 0;
    year += 1;
  }
  candidate = anniversaryInUtcMonth(start, year, month);
  return candidate;
}

/**
 * Included credits refresh monthly for both monthly and yearly subscriptions.
 * The subscription's original start date anchors the monthly UTC anniversary.
 */
export function includedCreditPeriod(state: Pick<EntitlementState, 'planStartDate' | 'createdAt'>, now = new Date()): IncludedCreditPeriod {
  const start = state.planStartDate ?? state.createdAt;
  if (!start || Number.isNaN(start.getTime())) throw new Error('MISSING_BILLING_START_DATE');
  const renewal = nextBillingAnniversary(start, now);
  return { includedQuizCreditsExpireAt: renewal, quizCreditsRenewAt: renewal };
}
