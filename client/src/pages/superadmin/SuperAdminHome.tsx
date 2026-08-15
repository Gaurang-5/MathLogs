import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { AlertTriangle, ArrowRight, Building2, CheckCircle2, Clock3, Headphones, RefreshCw, ShieldAlert, Star, UsersRound } from 'lucide-react';
import { superAdminShellApi } from '../../features/superadmin-shell/api';
import type { AttentionItem, SuperAdminHomeData } from '../../features/superadmin-shell/types';

const severityStyle = {
  CRITICAL: 'border-rose-200 bg-rose-50 text-rose-800',
  TODAY: 'border-amber-200 bg-amber-50 text-amber-900',
  UPCOMING: 'border-stone-200 bg-white text-stone-700'
};

const iconFor = (item: AttentionItem) => item.kind === 'CLAIM' ? UsersRound : item.kind === 'REVIEW' ? Star : item.kind === 'PLAN_EXPIRY' ? Clock3 : item.kind === 'SUPPORT' ? Headphones : AlertTriangle;

export default function SuperAdminHome() {
  const [data, setData] = useState<SuperAdminHomeData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const load = useCallback(async () => {
    setLoading(true); setError('');
    try { setData(await superAdminShellApi.home()); }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'Unable to load operations home'); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { void load(); }, [load]);
  const grouped = useMemo(() => ({
    critical: data?.attention.filter(item => item.severity === 'CRITICAL') || [],
    today: data?.attention.filter(item => item.severity === 'TODAY') || [],
    upcoming: data?.attention.filter(item => item.severity === 'UPCOMING') || []
  }), [data]);

  if (loading && !data) return <div className="grid min-h-[55vh] place-items-center"><RefreshCw className="h-6 w-6 animate-spin text-stone-400" /></div>;
  if (error && !data) return <div className="mx-auto max-w-xl rounded-[28px] border border-rose-200 bg-rose-50 p-8 text-center"><ShieldAlert className="mx-auto h-8 w-8 text-rose-600" /><h2 className="mt-4 text-xl font-black">Operations home is unavailable</h2><p className="mt-2 text-sm text-rose-700">{error}</p><button onClick={() => void load()} className="mt-5 rounded-xl bg-stone-950 px-4 py-2.5 text-sm font-bold text-white">Try again</button></div>;
  if (!data) return null;
  const metrics = [
    { label: 'Institutes', value: data.metrics.totalInstitutes, href: '/super-admin/institutes', icon: Building2 },
    { label: 'Active', value: data.metrics.activeInstitutes, href: '/super-admin/institutes?status=ACTIVE', icon: CheckCircle2 },
    { label: 'Open claims', value: data.metrics.openClaims, href: '/super-admin/marketplace?section=claims', icon: UsersRound },
    { label: 'Failed leads', value: data.metrics.failedLeadDeliveries, href: '/super-admin/marketplace?section=leads', icon: AlertTriangle },
    { label: 'Open support', value: data.metrics.openSupportTickets, href: '/super-admin/support', icon: Headphones }
  ];
  return <div className="mx-auto max-w-[1500px] space-y-7">
    <section className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between"><div><p className="text-xs font-black uppercase tracking-[0.2em] text-amber-700">Attention first</p><h2 className="mt-2 text-3xl font-black tracking-tight sm:text-4xl">Good morning. Here’s what needs you.</h2><p className="mt-2 max-w-2xl text-sm leading-6 text-stone-600">One operational queue across institutes, Marketplace, delivery jobs, and billing.</p></div><button onClick={() => void load()} disabled={loading} className="inline-flex items-center gap-2 self-start rounded-2xl border border-stone-200 bg-white px-4 py-2.5 text-sm font-bold shadow-sm disabled:opacity-50"><RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />Refresh</button></section>
    {error ? <p className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-900">Showing the last loaded data. Refresh failed: {error}</p> : null}
    <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{metrics.map(metric => { const Icon = metric.icon; return <Link key={metric.label} to={metric.href} className="group rounded-[24px] border border-stone-200 bg-[#fffdf9] p-5 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"><div className="flex items-center justify-between"><div className="grid h-10 w-10 place-items-center rounded-2xl bg-stone-100"><Icon className="h-4 w-4" /></div><ArrowRight className="h-4 w-4 text-stone-300 transition group-hover:translate-x-1 group-hover:text-stone-700" /></div><p className="mt-6 text-3xl font-black">{metric.value}</p><p className="mt-1 text-sm font-semibold text-stone-500">{metric.label}</p></Link>; })}</section>
    <section className="grid gap-6 xl:grid-cols-[minmax(0,1.45fr)_minmax(320px,.55fr)]">
      <div className="space-y-5">{([['Critical', grouped.critical], ['Today', grouped.today], ['Upcoming', grouped.upcoming]] as const).map(([label, items]) => items.length ? <div key={label} className="rounded-[28px] border border-stone-200 bg-[#fffdf9] p-5 shadow-sm"><div className="mb-4 flex items-center justify-between"><h3 className="text-lg font-black">{label}</h3><span className="rounded-full bg-stone-100 px-2.5 py-1 text-xs font-black text-stone-600">{items.length}</span></div><div className="space-y-3">{items.map(item => { const Icon = iconFor(item); return <Link key={item.id} to={item.action.href} className={`flex items-start gap-4 rounded-2xl border p-4 transition hover:shadow-sm ${severityStyle[item.severity]}`}><div className="mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-white/70"><Icon className="h-4 w-4" /></div><div className="min-w-0 flex-1"><p className="font-black">{item.title}</p><p className="mt-1 text-sm opacity-80">{item.detail}</p></div><span className="hidden text-xs font-black sm:block">{item.action.label}</span></Link>; })}</div></div> : null)}{data.attention.length === 0 ? <div className="rounded-[28px] border border-emerald-200 bg-emerald-50 p-10 text-center"><CheckCircle2 className="mx-auto h-9 w-9 text-emerald-600" /><h3 className="mt-4 text-xl font-black">Nothing needs intervention</h3><p className="mt-2 text-sm text-emerald-800">All current queues are clear.</p></div> : null}</div>
      <div className="space-y-5"><div className="rounded-[28px] border border-stone-200 bg-stone-950 p-5 text-white shadow-xl"><p className="text-xs font-black uppercase tracking-[0.18em] text-stone-400">System pulse</p><div className="mt-5 flex items-center gap-3"><span className={`h-3 w-3 rounded-full ${data.system.status === 'HEALTHY' ? 'bg-emerald-400' : 'bg-amber-400'}`} /><p className="text-xl font-black">{data.system.status === 'HEALTHY' ? 'All systems healthy' : 'Delivery attention needed'}</p></div><div className="mt-5 grid grid-cols-2 gap-3"><div className="rounded-2xl bg-white/10 p-3"><p className="text-2xl font-black">{data.system.failedWhatsappJobs}</p><p className="text-xs text-stone-400">WhatsApp failures</p></div><div className="rounded-2xl bg-white/10 p-3"><p className="text-2xl font-black">{data.system.failedEmailJobs}</p><p className="text-xs text-stone-400">Email failures</p></div></div></div><div className="rounded-[28px] border border-stone-200 bg-[#fffdf9] p-5 shadow-sm"><h3 className="text-lg font-black">Recent activity</h3><div className="mt-4 space-y-4">{data.recentActivity.slice(0, 10).map(item => <div key={`${item.source}-${item.id}`} className="flex gap-3"><span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-amber-500" /><div><p className="text-sm font-bold">{item.action.replaceAll('_', ' ')}</p><p className="text-xs text-stone-500">{item.actor?.username || 'System'} · {new Date(item.createdAt).toLocaleString()}</p></div></div>)}</div></div></div>
    </section>
  </div>;
}
