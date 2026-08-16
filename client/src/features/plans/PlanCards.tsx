import { useCallback, useEffect, useState } from 'react';
import { Check, Loader2, RotateCcw } from 'lucide-react';
import { loadPlanCatalogue } from './api';
import { buildPlanCards } from './planViewModel';
import type { BillingCycle, CanonicalPlan, PlanCardViewModel } from './types';

type Props = {
  selectedPlan?: CanonicalPlan | null;
  onSelect?: (plan: CanonicalPlan, cycle: BillingCycle) => void;
  compact?: boolean;
};

export function PlanCards({ selectedPlan, onSelect, compact = false }: Props) {
  const [cards, setCards] = useState<PlanCardViewModel[]>([]);
  const [error, setError] = useState(false);
  const [loading, setLoading] = useState(true);
  const load = useCallback(async () => {
    setLoading(true); setError(false);
    try { setCards(buildPlanCards(await loadPlanCatalogue())); }
    catch { setError(true); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { void load(); }, [load]);

  if (loading) return <div className="flex items-center justify-center gap-2 py-10 text-neutral-500"><Loader2 className="h-5 w-5 animate-spin" /> Loading plans…</div>;
  if (error) return <div role="alert" className="rounded-2xl border border-red-200 bg-red-50 p-6 text-center"><p className="font-semibold text-red-800">Plans could not be loaded.</p><button type="button" onClick={() => void load()} className="mt-3 inline-flex items-center gap-2 rounded-xl bg-neutral-900 px-4 py-2 text-sm font-bold text-white"><RotateCcw className="h-4 w-4" />Try again</button></div>;
  return <div className={`grid gap-5 ${compact ? 'md:grid-cols-3' : 'lg:grid-cols-3'}`}>
    {cards.map(card => <article key={card.id} className={`rounded-3xl border bg-white p-6 ${selectedPlan === card.id ? 'border-neutral-900 ring-2 ring-neutral-900/10' : 'border-neutral-200'}`}>
      <p className="text-xs font-bold uppercase tracking-widest text-neutral-500">{card.label}</p>
      <h3 className="mt-3 text-3xl font-black text-neutral-950">{card.primaryPrice}</h3>
      {card.yearlyPrice && <p className="mt-1 text-sm font-semibold text-neutral-500">{card.yearlyPrice}</p>}
      {card.trialLabel && <p className="mt-3 inline-flex rounded-full bg-emerald-50 px-3 py-1 text-xs font-bold text-emerald-700">{card.trialLabel} · 5 credits</p>}
      {card.creditLabel && <p className="mt-3 text-sm font-semibold text-neutral-700">{card.creditLabel}; monthly credits expire each month.</p>}
      <ul className="mt-5 space-y-2">{card.features.map(feature => <li key={feature} className="flex gap-2 text-sm text-neutral-700"><Check className="mt-0.5 h-4 w-4 shrink-0" />{feature}</li>)}</ul>
      {onSelect && <div className="mt-6 grid gap-2">
        {card.id === 'MARKETPLACE' ? <button type="button" onClick={() => onSelect(card.id, 'ONE_TIME')} className="rounded-xl bg-neutral-900 px-4 py-3 font-bold text-white">Choose Marketplace</button> : <>
          <button type="button" onClick={() => onSelect(card.id, 'MONTHLY')} className="rounded-xl bg-neutral-900 px-4 py-3 font-bold text-white">Choose monthly</button>
          <button type="button" onClick={() => onSelect(card.id, 'YEARLY')} className="rounded-xl border border-neutral-300 px-4 py-3 font-bold text-neutral-900">Choose yearly</button>
        </>}
      </div>}
    </article>)}
  </div>;
}
