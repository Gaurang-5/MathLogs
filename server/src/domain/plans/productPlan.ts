export type ProductPlan = 'BASIC' | 'PRO';

export type ProductCapabilities = {
  coreWorkspace: true;
  offlineReads: true;
  offlineWrites: true;
  aiQuizGeneration: boolean;
  onlineQuizDelivery: boolean;
  quizCreditTopUps: boolean;
};

export type ProductPlanState = {
  plan?: string | null;
  planExpiryDate?: Date | null;
  trialEndsAt?: Date | null;
};

export type ProductPlanAccess = {
  plan: ProductPlan;
  capabilities: ProductCapabilities;
};

const PRO_COMPATIBLE_STORED_PLANS = new Set(['PRO', 'QUIZ', 'ENTERPRISE']);

const BASIC_CAPABILITIES: ProductCapabilities = Object.freeze({
  coreWorkspace: true,
  offlineReads: true,
  offlineWrites: true,
  aiQuizGeneration: false,
  onlineQuizDelivery: false,
  quizCreditTopUps: false,
});

const PRO_CAPABILITIES: ProductCapabilities = Object.freeze({
  coreWorkspace: true,
  offlineReads: true,
  offlineWrites: true,
  aiQuizGeneration: true,
  onlineQuizDelivery: true,
  quizCreditTopUps: true,
});

function hasActiveProPeriod(state: ProductPlanState, now: Date): boolean {
  if (state.trialEndsAt && state.trialEndsAt.getTime() >= now.getTime()) return true;
  return !state.planExpiryDate || state.planExpiryDate.getTime() >= now.getTime();
}

/**
 * Presents the future two-plan product model without rewriting historical
 * billing records. Legacy Quiz and Enterprise subscriptions become Pro while
 * all core-workspace accounts resolve to Basic when Pro access is inactive.
 */
export function resolveProductPlan(state: ProductPlanState, now = new Date()): ProductPlan {
  const storedPlan = typeof state.plan === 'string' ? state.plan.trim().toUpperCase() : '';
  return PRO_COMPATIBLE_STORED_PLANS.has(storedPlan) && hasActiveProPeriod(state, now)
    ? 'PRO'
    : 'BASIC';
}

export function productPlanAccess(state: ProductPlanState, now = new Date()): ProductPlanAccess {
  const plan = resolveProductPlan(state, now);
  return {
    plan,
    capabilities: plan === 'PRO' ? PRO_CAPABILITIES : BASIC_CAPABILITIES,
  };
}
