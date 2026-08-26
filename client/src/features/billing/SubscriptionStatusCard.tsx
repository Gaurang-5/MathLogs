import { AlertCircle, CalendarClock } from 'lucide-react';
import type { CanonicalPlan } from '../plans/types';

export type SubscriptionStatus = {
  status: 'CREATED' | 'AUTHENTICATED' | 'ACTIVE' | 'PENDING' | 'HALTED' | 'CANCELLED' | 'COMPLETED' | 'EXPIRED';
  plan: Exclude<CanonicalPlan, 'MARKETPLACE'>;
  amountPaise: number;
  nextChargeAt: string | null;
  currentPeriodEnd: string | null;
  graceEndsAt: string | null;
  cancelAtPeriodEnd: boolean;
  cancelEffectiveAt: string | null;
};

const formatDate = (value: string | null) => value
  ? new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(value))
  : '—';

export function SubscriptionStatusCard({ subscription, onCancel }: { subscription: SubscriptionStatus; onCancel: () => void }) {
  const pending = subscription.status === 'PENDING' || subscription.status === 'HALTED';
  const title = pending
    ? 'Retrying payment'
    : subscription.cancelAtPeriodEnd || subscription.status === 'CANCELLED'
      ? 'AutoPay cancellation scheduled'
      : subscription.status === 'AUTHENTICATED'
        ? 'AutoPay authorized'
        : 'AutoPay active';
  const detail = pending
    ? `Access remains available through ${formatDate(subscription.graceEndsAt)} while Razorpay retries the payment.`
    : subscription.cancelAtPeriodEnd || subscription.status === 'CANCELLED'
      ? `Access continues through ${formatDate(subscription.cancelEffectiveAt || subscription.currentPeriodEnd)}.`
      : `Next automatic charge: ${formatDate(subscription.nextChargeAt)}.`;

  return (
    <section className={`rounded-[24px] border p-5 ${pending ? 'border-amber-200 bg-amber-50' : 'border-neutral-200 bg-white'}`}>
      <div className="flex items-start gap-3">
        <span className={`grid h-10 w-10 shrink-0 place-items-center rounded-2xl ${pending ? 'bg-amber-100 text-amber-800' : 'bg-neutral-100 text-neutral-800'}`}>
          {pending ? <AlertCircle className="h-5 w-5" /> : <CalendarClock className="h-5 w-5" />}
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-xs font-black uppercase tracking-wider text-neutral-500">{subscription.plan} · ₹{subscription.amountPaise / 100}/month</p>
          <h2 className="mt-1 text-lg font-black text-neutral-950">{title}</h2>
          <p className="mt-1 text-sm text-neutral-600">{detail}</p>
        </div>
        {!subscription.cancelAtPeriodEnd && !['CANCELLED', 'COMPLETED', 'EXPIRED'].includes(subscription.status) ? (
          <button type="button" onClick={onCancel} className="rounded-xl border border-neutral-200 px-3 py-2 text-xs font-black text-neutral-700 hover:border-neutral-400">
            Cancel AutoPay
          </button>
        ) : null}
      </div>
    </section>
  );
}
