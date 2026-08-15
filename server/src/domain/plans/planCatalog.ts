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

const PLAN_CATALOG_VALUES: readonly PlanProduct[] = [
  { id: 'MARKETPLACE', label: 'Marketplace', monthlyPricePaise: null, yearlyPricePaise: null, oneTimePricePaise: 9_900, promotionalPricePaise: 0, trialDays: 0, includedQuizCredits: 0, unlimitedStudents: true, features: ['Public Marketplace listing', 'Ownership and profile management', 'Student and parent leads'] },
  { id: 'QUIZ', label: 'Quiz', monthlyPricePaise: 24_900, yearlyPricePaise: 249_900, oneTimePricePaise: null, promotionalPricePaise: null, trialDays: 14, includedQuizCredits: 5, unlimitedStudents: true, features: ['Lifetime Marketplace access', 'Quiz creation and delivery', 'Five included quiz credits each month', 'Lifetime credit top-ups'] },
  { id: 'ENTERPRISE', label: 'Enterprise', monthlyPricePaise: 49_900, yearlyPricePaise: 499_900, oneTimePricePaise: null, promotionalPricePaise: null, trialDays: 14, includedQuizCredits: 5, unlimitedStudents: true, features: ['Lifetime Marketplace access', 'All quiz features', 'All coaching-management features', 'Five included quiz credits each month'] }
] as const;

export const PLAN_CATALOG: readonly PlanProduct[] = Object.freeze(
  PLAN_CATALOG_VALUES.map(plan => Object.freeze({
    ...plan,
    features: Object.freeze([...plan.features])
  }))
);

const PLAN_ALIASES: Readonly<Record<string, CanonicalPlan>> = {
  MARKETPLACE: 'MARKETPLACE',
  LISTING: 'MARKETPLACE',
  QUIZ: 'QUIZ',
  QUIZ_ONLY: 'QUIZ',
  ENTERPRISE: 'ENTERPRISE',
  PRO: 'ENTERPRISE',
  BASIC: 'ENTERPRISE'
};

export function normalizePlanId(value: unknown): CanonicalPlan {
  const key = typeof value === 'string' ? value.trim().toUpperCase() : '';
  const plan = PLAN_ALIASES[key];
  if (!plan) throw new Error('INVALID_PLAN');
  return plan;
}

function normalizeBillingCycle(value: unknown): BillingCycle {
  if (value === 'MONTHLY' || value === 'YEARLY' || value === 'ONE_TIME') return value;
  throw new Error('INVALID_BILLING_CYCLE');
}

export function resolvePlanPrice(plan: unknown, cycle: unknown): number {
  const product = PLAN_CATALOG.find(candidate => candidate.id === normalizePlanId(plan));
  if (!product) throw new Error('INVALID_PLAN');

  const normalizedCycle = normalizeBillingCycle(cycle);
  const price = normalizedCycle === 'MONTHLY'
    ? product.monthlyPricePaise
    : normalizedCycle === 'YEARLY'
      ? product.yearlyPricePaise
      : normalizedCycle === 'ONE_TIME'
        ? product.oneTimePricePaise
        : null;
  if (price === null) throw new Error('INVALID_PLAN_CYCLE');
  return price;
}

export function publicPlanCatalogue(): readonly PlanProduct[] {
  return PLAN_CATALOG.map(plan => ({ ...plan, features: [...plan.features] }));
}
