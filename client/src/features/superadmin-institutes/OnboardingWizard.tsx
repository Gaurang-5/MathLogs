import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, ArrowRight, CheckCircle2, Loader2 } from 'lucide-react';
import { superAdminInstituteApi } from './api';
import type { OnboardingInput } from './types';
import type { BillingCycle, CanonicalPlan } from '../plans/types';
import { MARKETPLACE_CITY, MARKETPLACE_CITY_OPTIONS } from '../marketplace/location';

export const ONBOARDING_STEPS = ['Owner', 'Institute', 'Subscription', 'Marketplace', 'Review'] as const;
export const buildInitialOnboarding = (): OnboardingInput => ({
  owner: { name: '', phone: '', email: '' },
  institute: { name: '', city: MARKETPLACE_CITY, area: '', address: '' },
  subscription: { plan: 'ENTERPRISE', billingCycle: 'MONTHLY', startTrial: true },
  marketplace: { isPubliclyListed: true, isVerified: false }
});

export function OnboardingWizard() {
  const [value, setValue] = useState(buildInitialOnboarding);
  const [step, setStep] = useState(0);
  const [preview, setPreview] = useState<unknown>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [idempotencyKey] = useState(() => crypto.randomUUID());
  const navigate = useNavigate();
  const valid = useMemo(() => step === 0 ? value.owner.name.trim().length > 1 && /\d{10,}/.test(value.owner.phone.replace(/\D/g, '')) : step === 1 ? value.institute.name.trim().length > 1 : true, [step, value]);
  const updateSubscription = (plan: CanonicalPlan, cycle?: BillingCycle) => setValue(current => ({ ...current, subscription: {
    plan, billingCycle: cycle ?? (plan === 'MARKETPLACE' ? 'ONE_TIME' : current.subscription.billingCycle === 'ONE_TIME' ? 'MONTHLY' : current.subscription.billingCycle),
    startTrial: plan === 'MARKETPLACE' ? false : current.subscription.startTrial
  } }));
  const next = async () => {
    setError('');
    if (!valid) { setError('Complete the required fields before continuing.'); return; }
    if (step < ONBOARDING_STEPS.length - 1) { setStep(current => current + 1); return; }
    setBusy(true);
    try {
      if (!preview) { setPreview((await superAdminInstituteApi.previewOnboarding(value)).summary); return; }
      const result = await superAdminInstituteApi.commitOnboarding(value, idempotencyKey);
      navigate(`/super-admin/institutes/${result.instituteId}`);
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Unable to onboard institute'); }
    finally { setBusy(false); }
  };
  const input = 'w-full rounded-2xl border border-stone-200 bg-white px-4 py-3 text-sm outline-none focus:border-amber-500 focus:ring-4 focus:ring-amber-100';
  return <div className="mx-auto max-w-4xl"><button onClick={() => navigate('/super-admin/institutes')} className="mb-5 inline-flex items-center gap-2 text-sm font-bold text-stone-600"><ArrowLeft className="h-4 w-4" />Back to institutes</button><section className="overflow-hidden rounded-[32px] border border-stone-200 bg-[#fffdf9] shadow-sm"><div className="border-b border-stone-200 p-6 sm:p-8"><p className="text-xs font-black uppercase tracking-[0.2em] text-amber-700">Guided onboarding</p><h2 className="mt-2 text-3xl font-black">Set up the owner, plan, and Marketplace presence.</h2><div className="mt-6 grid grid-cols-5 gap-2">{ONBOARDING_STEPS.map((label, index) => <button key={label} onClick={() => index <= step && setStep(index)} className={`rounded-xl px-2 py-2 text-[10px] font-black sm:text-xs ${index === step ? 'bg-stone-950 text-white' : index < step ? 'bg-amber-100 text-amber-900' : 'bg-stone-100 text-stone-400'}`}>{index + 1}. {label}</button>)}</div></div><div className="min-h-[330px] p-6 sm:p-8">
    {step === 0 && <div className="grid gap-4 sm:grid-cols-2"><label className="sm:col-span-2"><span className="mb-2 block text-sm font-bold">Owner name</span><input className={input} value={value.owner.name} onChange={e => setValue(c => ({ ...c, owner: { ...c.owner, name: e.target.value } }))} /></label><label><span className="mb-2 block text-sm font-bold">Phone (login)</span><input className={input} value={value.owner.phone} onChange={e => setValue(c => ({ ...c, owner: { ...c.owner, phone: e.target.value } }))} /></label><label><span className="mb-2 block text-sm font-bold">Email</span><input className={input} type="email" value={value.owner.email} onChange={e => setValue(c => ({ ...c, owner: { ...c.owner, email: e.target.value } }))} /></label></div>}
    {step === 1 && <div className="grid gap-4 sm:grid-cols-2"><label className="sm:col-span-2"><span className="mb-2 block text-sm font-bold">Institute name</span><input className={input} value={value.institute.name} onChange={e => setValue(c => ({ ...c, institute: { ...c.institute, name: e.target.value } }))} /></label><label><span className="mb-2 block text-sm font-bold">City</span><select name="marketplace-city" className={input} value={value.institute.city} onChange={() => setValue(c => ({ ...c, institute: { ...c.institute, city: MARKETPLACE_CITY } }))}>{MARKETPLACE_CITY_OPTIONS.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>{(['area', 'address'] as const).map(field => <label key={field} className={field === 'address' ? 'sm:col-span-2' : ''}><span className="mb-2 block text-sm font-bold capitalize">{field}</span><input className={input} value={value.institute[field]} onChange={e => setValue(c => ({ ...c, institute: { ...c.institute, [field]: e.target.value } }))} /></label>)}</div>}
    {step === 2 && <div><div className="grid gap-3 sm:grid-cols-3">{(['MARKETPLACE', 'QUIZ', 'ENTERPRISE'] as const).map(plan => <button key={plan} onClick={() => updateSubscription(plan)} className={`rounded-2xl border p-5 text-left ${value.subscription.plan === plan ? 'border-stone-950 bg-stone-950 text-white' : 'border-stone-200 bg-white'}`}><p className="font-black">{plan}</p><p className="mt-2 text-xs opacity-70">{plan === 'MARKETPLACE' ? '₹99 one-time; free for now.' : plan === 'QUIZ' ? '₹249/month or ₹2,499/year.' : '₹499/month or ₹4,999/year.'}</p><p className="mt-2 text-xs font-bold">Unlimited students</p></button>)}</div><div className="mt-5 flex flex-wrap gap-3">{value.subscription.plan !== 'MARKETPLACE' && <><select className={input} value={value.subscription.billingCycle} onChange={e => updateSubscription(value.subscription.plan, e.target.value as BillingCycle)}><option value="MONTHLY">Monthly</option><option value="YEARLY">Yearly</option></select><label className="flex items-center gap-2 rounded-2xl bg-white px-4 py-3 font-bold"><input type="checkbox" checked={value.subscription.startTrial} onChange={e => setValue(c => ({ ...c, subscription: { ...c.subscription, startTrial: e.target.checked } }))} />Start one 14-day trial with 5 credits</label></>}</div></div>}
    {step === 3 && <div className="grid gap-4 sm:grid-cols-2"><label className="flex items-center gap-3 rounded-2xl border bg-white p-5"><input type="checkbox" checked={value.marketplace.isPubliclyListed} onChange={e => setValue(c => ({ ...c, marketplace: { ...c.marketplace, isPubliclyListed: e.target.checked } }))} /><span className="font-bold">Publish Marketplace listing</span></label><label className="flex items-center gap-3 rounded-2xl border bg-white p-5"><input type="checkbox" checked={value.marketplace.isVerified} onChange={e => setValue(c => ({ ...c, marketplace: { ...c.marketplace, isVerified: e.target.checked } }))} /><span className="font-bold">Mark as manually verified</span></label></div>}
    {step === 4 && <div>{preview ? <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-5"><div className="flex items-center gap-2 font-black text-emerald-800"><CheckCircle2 className="h-5 w-5" />Server validation passed</div><pre className="mt-4 max-h-52 overflow-auto whitespace-pre-wrap text-xs">{JSON.stringify(preview, null, 2)}</pre></div> : <div className="grid gap-3 sm:grid-cols-2"><div className="rounded-2xl bg-stone-100 p-4"><p className="text-xs font-black text-stone-400">OWNER</p><p className="mt-2 font-black">{value.owner.name}</p><p className="text-sm">{value.owner.phone}</p></div><div className="rounded-2xl bg-stone-100 p-4"><p className="text-xs font-black text-stone-400">INSTITUTE</p><p className="mt-2 font-black">{value.institute.name}</p></div><div className="rounded-2xl bg-stone-100 p-4"><p className="text-xs font-black text-stone-400">SUBSCRIPTION</p><p className="mt-2 font-black">{value.subscription.plan} · {value.subscription.billingCycle}</p><p className="text-sm">{value.subscription.startTrial ? '14-day trial' : 'Paid activation'}</p></div><div className="rounded-2xl bg-stone-100 p-4"><p className="text-xs font-black text-stone-400">STUDENTS</p><p className="mt-2 font-black">Unlimited</p></div></div>}</div>}
    {error && <p className="mt-5 rounded-xl bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-700">{error}</p>}
  </div><div className="flex items-center justify-between border-t p-5 sm:px-8"><button disabled={step === 0} onClick={() => { setPreview(null); setStep(c => c - 1); }} className="inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-bold disabled:opacity-30"><ArrowLeft className="h-4 w-4" />Back</button><button onClick={() => void next()} disabled={busy} className="inline-flex items-center gap-2 rounded-2xl bg-stone-950 px-5 py-3 text-sm font-black text-white disabled:opacity-50">{busy && <Loader2 className="h-4 w-4 animate-spin" />}{step < 4 ? 'Continue' : preview ? 'Create institute' : 'Validate with server'}<ArrowRight className="h-4 w-4" /></button></div></section></div>;
}
