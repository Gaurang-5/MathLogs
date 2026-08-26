import { useCallback, useEffect, useState } from 'react';
import { Check, CheckCircle2, Crown, Loader2, RotateCcw, Sparkles } from 'lucide-react';
import { loadPlanCatalogue } from './api';
import { buildPlanCards } from './planViewModel';
import type { BillingCycle, CanonicalPlan, PlanCardViewModel } from './types';

type Props = {
  selectedPlan?: CanonicalPlan | null;
  currentBillingCycle?: BillingCycle | null;
  onSelect?: (plan: CanonicalPlan, cycle: BillingCycle) => void;
  compact?: boolean;
};

const PLAN_TIER_RANK: Record<CanonicalPlan, number> = {
  MARKETPLACE: 1,
  QUIZ: 2,
  ENTERPRISE: 3,
};

export function PlanCards({ selectedPlan, currentBillingCycle, onSelect, compact = false }: Props) {
  const [cards, setCards] = useState<PlanCardViewModel[]>([]);
  const [error, setError] = useState(false);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    setError(false);
    try {
      setCards(buildPlanCards(await loadPlanCatalogue()));
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  if (loading) {
    return (
      <div className="flex items-center justify-center gap-2 py-10 text-neutral-500 font-medium">
        <Loader2 className="h-5 w-5 animate-spin" /> Loading plans…
      </div>
    );
  }

  if (error) {
    return (
      <div role="alert" className="rounded-2xl border border-red-200 bg-red-50 p-6 text-center">
        <p className="font-semibold text-red-800">Plans could not be loaded.</p>
        <button
          type="button"
          onClick={() => void load()}
          className="mt-3 inline-flex items-center gap-2 rounded-xl bg-neutral-900 px-4 py-2 text-sm font-bold text-white cursor-pointer"
        >
          <RotateCcw className="h-4 w-4" /> Try again
        </button>
      </div>
    );
  }

  const currentRank = selectedPlan ? (PLAN_TIER_RANK[selectedPlan] || 0) : 0;

  return (
    <div className={`grid gap-6 ${compact ? 'md:grid-cols-3' : 'lg:grid-cols-3'}`}>
      {cards.map(card => {
        const isCurrent = Boolean(selectedPlan && selectedPlan === card.id);
        const cardRank = PLAN_TIER_RANK[card.id] || 0;
        const isHigher = selectedPlan ? cardRank > currentRank : true;
        const isLower = selectedPlan ? cardRank < currentRank : false;
        const isHighestTier = card.id === 'ENTERPRISE';

        return (
          <article
            key={card.id}
            className={`relative flex flex-col justify-between rounded-3xl border bg-white p-7 transition-all ${
              isCurrent
                ? 'border-neutral-900 ring-2 ring-neutral-900/10 shadow-lg'
                : isHighestTier && !selectedPlan
                ? 'border-neutral-900 shadow-md'
                : 'border-neutral-200 hover:border-neutral-300'
            }`}
          >
            {/* Top Badge */}
            {isCurrent ? (
              <div className="absolute -top-3 right-6 inline-flex items-center gap-1.5 rounded-full bg-emerald-600 px-3.5 py-1 text-[11px] font-black uppercase tracking-wider text-white shadow-sm">
                <CheckCircle2 className="h-3.5 w-3.5" />
                {isHighestTier ? 'Current · Highest Tier' : 'Current Plan'}
              </div>
            ) : isHighestTier && !selectedPlan ? (
              <div className="absolute -top-3 right-6 inline-flex items-center gap-1 rounded-full bg-neutral-900 px-3 py-1 text-[10px] font-black uppercase tracking-wider text-white shadow-sm">
                <Crown className="h-3 w-3 text-amber-400" />
                Most Popular
              </div>
            ) : isLower ? (
              <div className="absolute -top-3 right-6 inline-flex items-center gap-1 rounded-full bg-neutral-100 border border-neutral-200 px-3 py-1 text-[10px] font-black uppercase tracking-wider text-neutral-500">
                Included in Plan
              </div>
            ) : null}

            <div>
              <div className="flex items-center justify-between">
                <p className="text-xs font-bold uppercase tracking-widest text-neutral-500">
                  {card.label}
                </p>
                {isHighestTier && (
                  <span className="inline-flex items-center gap-1 text-[11px] font-black text-amber-600 bg-amber-50 px-2 py-0.5 rounded-md">
                    <Sparkles className="w-3 h-3" /> Complete ERP
                  </span>
                )}
              </div>

              <h3 className="mt-3 text-3xl font-black text-neutral-950">
                {card.primaryPrice}
              </h3>

              {card.yearlyPrice && (
                <p className="mt-1 text-sm font-semibold text-neutral-500">
                  {card.yearlyPrice}
                </p>
              )}

              {card.trialLabel && (
                <p className="mt-3 inline-flex rounded-full bg-emerald-50 px-3 py-1 text-xs font-bold text-emerald-700">
                  {card.trialLabel} · 5 quiz credits
                </p>
              )}

              {card.creditLabel && (
                <p className="mt-3 text-xs font-semibold text-neutral-700">
                  {card.creditLabel}; monthly credits renew each month.
                </p>
              )}

              <ul className="mt-6 space-y-2.5">
                {card.features.map(feature => (
                  <li key={feature} className="flex items-start gap-2.5 text-xs sm:text-sm font-medium text-neutral-700">
                    <Check className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
                    <span>{feature}</span>
                  </li>
                ))}
              </ul>
            </div>

            {/* Action State / Buttons */}
            {onSelect && (
              <div className="mt-8 pt-4 border-t border-neutral-100">
                {isCurrent ? (
                  <div className="rounded-2xl border-2 border-emerald-500 bg-emerald-50/60 p-4 text-center">
                    <div className="flex items-center justify-center gap-2 text-emerald-800 font-black text-sm">
                      <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                      <span>Current Active Plan</span>
                    </div>
                    <p className="text-[11px] text-emerald-700/90 mt-1 font-medium">
                      {isHighestTier
                        ? '★ You are on the highest tier with all features unlocked.'
                        : 'Your institute is currently active on this plan.'}
                    </p>
                  </div>
                ) : isLower ? (
                  <div className="rounded-2xl border border-neutral-200 bg-neutral-50 p-4 text-center">
                    <p className="text-xs font-bold text-neutral-500">
                      Included with your {selectedPlan} plan
                    </p>
                    <p className="text-[11px] text-neutral-400 mt-0.5 font-medium">
                      All features already available
                    </p>
                  </div>
                ) : card.id === 'MARKETPLACE' ? (
                  <button
                    type="button"
                    onClick={() => onSelect(card.id, 'ONE_TIME')}
                    className="w-full rounded-2xl bg-neutral-900 px-4 py-3.5 font-bold text-white text-xs uppercase tracking-wider hover:bg-black transition-colors cursor-pointer shadow-xs"
                  >
                    Activate Free Marketplace Listing
                  </button>
                ) : (
                  <div className="grid gap-2">
                    <button
                      type="button"
                      onClick={() => onSelect(card.id, 'MONTHLY')}
                      className="w-full rounded-2xl bg-neutral-900 px-4 py-3 font-bold text-white text-xs uppercase tracking-wider hover:bg-black transition-colors flex items-center justify-center gap-2 cursor-pointer shadow-xs"
                    >
                      <Sparkles className="w-3.5 h-3.5 text-amber-400" />
                      <span>Upgrade Monthly (14-Day Trial)</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => onSelect(card.id, 'YEARLY')}
                      className="w-full rounded-2xl border-2 border-neutral-200 px-4 py-2.5 font-bold text-neutral-800 text-xs uppercase tracking-wider hover:border-neutral-900 hover:text-black transition-colors cursor-pointer"
                    >
                      <span>Upgrade Yearly</span>
                    </button>
                  </div>
                )}
              </div>
            )}
          </article>
        );
      })}
    </div>
  );
}
