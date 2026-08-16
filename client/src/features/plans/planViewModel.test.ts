import { describe, expect, it } from 'vitest';
import { buildPlanCards, validatePlanCatalogue } from './planViewModel';

const catalogue = [
  { id: 'MARKETPLACE', label: 'Marketplace', monthlyPricePaise: null, yearlyPricePaise: null, oneTimePricePaise: 9900, promotionalPricePaise: 0, trialDays: 0, includedQuizCredits: 0, unlimitedStudents: true, features: ['Public Marketplace listing'] },
  { id: 'QUIZ', label: 'Quiz', monthlyPricePaise: 24900, yearlyPricePaise: 249900, oneTimePricePaise: null, promotionalPricePaise: null, trialDays: 14, includedQuizCredits: 5, unlimitedStudents: true, features: ['Quiz creation'] },
  { id: 'ENTERPRISE', label: 'Enterprise', monthlyPricePaise: 49900, yearlyPricePaise: 499900, oneTimePricePaise: null, promotionalPricePaise: null, trialDays: 14, includedQuizCredits: 5, unlimitedStudents: true, features: ['All coaching-management features'] }
] as const;

describe('canonical plan view model', () => {
  it('projects the approved prices, trials, credits and unlimited students', () => {
    const cards = buildPlanCards(validatePlanCatalogue(catalogue));
    expect(cards.map(card => [card.id, card.primaryPrice, card.yearlyPrice, card.trialLabel])).toEqual([
      ['MARKETPLACE', 'Free for now', '₹99 one-time normally', null],
      ['QUIZ', '₹249/month', '₹2,499/year', '14-day free trial'],
      ['ENTERPRISE', '₹499/month', '₹4,999/year', '14-day free trial']
    ]);
    expect(cards.every(card => card.features.includes('Unlimited students'))).toBe(true);
    expect(cards.filter(card => card.id !== 'MARKETPLACE').every(card => card.creditLabel === '5 included quiz credits each month')).toBe(true);
  });

  it('rejects incomplete, duplicate, or unknown catalogues', () => {
    expect(() => validatePlanCatalogue(catalogue.slice(0, 2))).toThrow('INVALID_PLAN_CATALOGUE');
    expect(() => validatePlanCatalogue([...catalogue.slice(0, 2), { ...catalogue[2], id: 'PRO' }])).toThrow('INVALID_PLAN_CATALOGUE');
  });
});
