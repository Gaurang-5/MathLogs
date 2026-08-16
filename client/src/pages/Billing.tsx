import { useCallback, useEffect, useState } from 'react';
import { CreditCard, Loader2, Sparkles } from 'lucide-react';
import toast from 'react-hot-toast';
import Layout from '../components/Layout';
import { api } from '../utils/api';
import { PlanCards } from '../features/plans/PlanCards';
import type { BillingCycle, CanonicalPlan } from '../features/plans/types';

type InstituteBilling = { plan?: CanonicalPlan; billingCycle?: BillingCycle | null; teacherName?: string; email?: string; phoneNumber?: string; includedQuizCredits?: number; lifetimeQuizCredits?: number; includedQuizCreditsExpireAt?: string | null; quizCreditsRenewAt?: string | null; planExpiryDate?: string | null; marketplaceAccessGrantedAt?: string | null };
type CheckoutResponse = { success: boolean; activated?: boolean; keyId?: string; orderId?: string; amount?: number; currency?: string; error?: string };
type RazorpayResult = { razorpay_order_id?: string; razorpay_payment_id?: string; razorpay_signature?: string };
declare global { interface Window { Razorpay?: new (options: Record<string, unknown>) => { on: (name: string, handler: (value: { error?: { description?: string } }) => void) => void; open: () => void } } }
const loadRazorpay = () => new Promise<boolean>(resolve => { if (window.Razorpay) return resolve(true); const script = document.createElement('script'); script.src = 'https://checkout.razorpay.com/v1/checkout.js'; script.onload = () => resolve(true); script.onerror = () => resolve(false); document.body.appendChild(script); });
const date = (value?: string | null) => value ? new Date(value).toLocaleDateString('en-IN') : '—';

export default function Billing() {
  const [institute, setInstitute] = useState<InstituteBilling | null>(null); const [loading, setLoading] = useState(true); const [checkout, setCheckout] = useState(false);
  const load = useCallback(async () => { try { setInstitute(await api.get<InstituteBilling>('/institute/me')); } catch { toast.error('Failed to load billing details.'); } finally { setLoading(false); } }, []);
  useEffect(() => { void load(); }, [load]);
  const choose = async (plan: CanonicalPlan, billingCycle: BillingCycle) => {
    setCheckout(true);
    try {
      const session = await api.post<CheckoutResponse>('/billing/create', { planId: plan, billingCycle });
      if (session.activated) { toast.success('Marketplace access activated.'); await load(); return; }
      if (!session.success || !session.orderId || !(await loadRazorpay()) || !window.Razorpay) throw new Error(session.error || 'Payment gateway could not be opened.');
      const payment = new window.Razorpay({ key: session.keyId, order_id: session.orderId, amount: session.amount, currency: session.currency, name: 'MathLogs', description: `${plan} · ${billingCycle}`, prefill: { name: institute?.teacherName || '', email: institute?.email || '', contact: institute?.phoneNumber || '' }, theme: { color: '#111111' }, handler: async (result: RazorpayResult) => { try { await api.post('/billing/verify', result); toast.success('Plan activated.'); await load(); } catch { toast.error('Payment verification failed. Contact support with your payment ID.'); } finally { setCheckout(false); } }, modal: { ondismiss: () => setCheckout(false) } });
      payment.on('payment.failed', result => { toast.error(result.error?.description || 'Payment failed.'); setCheckout(false); }); payment.open();
    } catch (reason) { toast.error(reason instanceof Error ? reason.message : 'Checkout failed.'); setCheckout(false); }
  };
  const buyCredits = async (creditPackId: string) => {
    setCheckout(true);
    try {
      const session = await api.post<CheckoutResponse>('/billing/create', { planId: creditPackId });
      if (!session.success || !session.orderId || !(await loadRazorpay()) || !window.Razorpay) throw new Error(session.error || 'Payment gateway could not be opened.');
      const payment = new window.Razorpay({ key: session.keyId, order_id: session.orderId, amount: session.amount, currency: session.currency, name: 'MathLogs', description: 'Lifetime quiz credits', handler: async (result: RazorpayResult) => { await api.post('/billing/verify', result); toast.success('Lifetime credits added.'); await load(); setCheckout(false); }, modal: { ondismiss: () => setCheckout(false) } }); payment.open();
    } catch (reason) { toast.error(reason instanceof Error ? reason.message : 'Credit purchase failed.'); setCheckout(false); }
  };
  if (loading) return <Layout title="Billing & Subscription"><div className="grid min-h-[50vh] place-items-center"><Loader2 className="h-7 w-7 animate-spin" /></div></Layout>;
  return <Layout title="Billing & Subscription"><div className="mx-auto max-w-7xl space-y-8 pb-20"><section className="rounded-[32px] bg-neutral-950 p-7 text-white"><p className="text-xs font-black uppercase tracking-widest text-neutral-400">Current subscription</p><h1 className="mt-2 text-3xl font-black">{institute?.plan || 'MARKETPLACE'}</h1><div className="mt-6 grid gap-3 sm:grid-cols-4"><div><p className="text-xs text-neutral-400">Included monthly</p><p className="text-2xl font-black">{institute?.includedQuizCredits ?? 0}</p><p className="text-xs text-neutral-400">Expires {date(institute?.includedQuizCreditsExpireAt)}</p></div><div><p className="text-xs text-neutral-400">Lifetime credits</p><p className="text-2xl font-black">{institute?.lifetimeQuizCredits ?? 0}</p><p className="text-xs text-neutral-400">Never expire</p></div><div><p className="text-xs text-neutral-400">Next refresh</p><p className="font-black">{date(institute?.quizCreditsRenewAt)}</p></div><div><p className="text-xs text-neutral-400">Students</p><p className="font-black">Unlimited</p></div></div></section>
    <section><div className="mb-5"><h2 className="text-2xl font-black">Choose a plan</h2><p className="text-sm text-neutral-500">Prices and features load from the server catalogue.</p></div><PlanCards selectedPlan={institute?.plan} onSelect={(plan, cycle) => void choose(plan, cycle)} /></section>
    <section className="rounded-[28px] border bg-white p-6"><div className="flex items-center gap-3"><Sparkles className="h-5 w-5" /><div><h2 className="text-xl font-black">Lifetime quiz-credit packs</h2><p className="text-sm text-neutral-500">These top-ups never expire. Monthly included credits are always used first.</p></div></div><div className="mt-5 grid gap-3 sm:grid-cols-4">{[{ id: 'quiz_credits_5', credits: 5, price: '₹250' }, { id: 'quiz_credits_10', credits: 10, price: '₹500' }, { id: 'quiz_credits_25', credits: 25, price: '₹1,000' }, { id: 'quiz_credits_40', credits: 40, price: '₹1,500' }].map(pack => <button key={pack.id} disabled={checkout} onClick={() => void buyCredits(pack.id)} className="rounded-2xl border p-4 text-left hover:border-neutral-950 disabled:opacity-50"><p className="text-2xl font-black">{pack.credits}</p><p className="text-sm text-neutral-500">lifetime credits</p><p className="mt-3 flex items-center gap-2 font-black"><CreditCard className="h-4 w-4" />{pack.price}</p></button>)}</div></section>
    {checkout && <div className="fixed inset-0 z-50 grid place-items-center bg-black/30"><div className="flex items-center gap-3 rounded-2xl bg-white px-6 py-4 font-bold"><Loader2 className="h-5 w-5 animate-spin" />Opening secure checkout…</div></div>}
  </div></Layout>;
}
