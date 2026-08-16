export type CanonicalPlan = 'MARKETPLACE' | 'QUIZ' | 'ENTERPRISE';
export type BillingCycle = 'ONE_TIME' | 'MONTHLY' | 'YEARLY';

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
  features: string[];
};

export type PlanCardViewModel = PlanProduct & {
  primaryPrice: string;
  yearlyPrice: string | null;
  trialLabel: string | null;
  creditLabel: string | null;
  features: string[];
};

export type QuizCreditWallet = {
  includedCredits: number;
  lifetimeCredits: number;
  totalUsableCredits: number;
  includedCreditsExpireAt: string | null;
  quizCreditsRenewAt: string | null;
};
