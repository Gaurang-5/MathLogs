import type { CanonicalPlan, PlanCardViewModel, PlanProduct } from './types';

const IDS: CanonicalPlan[] = ['MARKETPLACE', 'QUIZ', 'ENTERPRISE'];
const rupees = (paise: number) => `₹${(paise / 100).toLocaleString('en-IN')}`;

export function validatePlanCatalogue(value: unknown): PlanProduct[] {
  if (!Array.isArray(value) || value.length !== IDS.length) throw new Error('INVALID_PLAN_CATALOGUE');
  const records = value as Array<Record<string, unknown>>;
  if (new Set(records.map(record => record.id)).size !== IDS.length || !IDS.every(id => records.some(record => record.id === id))) {
    throw new Error('INVALID_PLAN_CATALOGUE');
  }
  for (const record of records) {
    if (!IDS.includes(record.id as CanonicalPlan) || record.unlimitedStudents !== true || !Array.isArray(record.features)) throw new Error('INVALID_PLAN_CATALOGUE');
  }
  return records as unknown as PlanProduct[];
}

export function buildPlanCards(products: PlanProduct[]): PlanCardViewModel[] {
  return IDS.map(id => products.find(product => product.id === id)!).map(product => ({
    ...product,
    primaryPrice: product.id === 'MARKETPLACE' && product.promotionalPricePaise === 0
      ? 'Free for now'
      : `${rupees(product.monthlyPricePaise!)}/month`,
    yearlyPrice: product.id === 'MARKETPLACE'
      ? `${rupees(product.oneTimePricePaise!)} one-time normally`
      : `${rupees(product.yearlyPricePaise!)}/year`,
    trialLabel: product.trialDays ? `${product.trialDays}-day free trial` : null,
    creditLabel: product.includedQuizCredits ? `${product.includedQuizCredits} included quiz credits each month` : null,
    features: [...product.features, 'Unlimited students']
  }));
}
