import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { ArrowRight, Building2, ChevronLeft, ChevronRight, Plus, Search, UsersRound } from 'lucide-react';
import { superAdminInstituteApi } from './api';
import type { InstituteDirectoryResponse } from './types';

const badge = (value: string) => value === 'ACTIVE' || value === 'CLAIMED' ? 'bg-emerald-100 text-emerald-800' : value === 'NO_PLAN' ? 'bg-rose-100 text-rose-800' : 'bg-stone-100 text-stone-700';

export function InstituteDirectory() {
  const [params, setParams] = useSearchParams();
  const [data, setData] = useState<InstituteDirectoryResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [draftQuery, setDraftQuery] = useState(params.get('q') || '');
  const page = Number(params.get('page') || 1);
  useEffect(() => {
    const timer = window.setTimeout(() => {
      const next = new URLSearchParams(params);
      if (draftQuery.trim()) next.set('q', draftQuery.trim()); else next.delete('q');
      next.set('page', '1');
      if (next.toString() !== params.toString()) setParams(next, { replace: true });
    }, 250);
    return () => clearTimeout(timer);
  }, [draftQuery]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    setLoading(true); setError('');
    void superAdminInstituteApi.list({
      q: params.get('q') || undefined,
      status: params.get('status') || undefined,
      plan: params.get('plan') || undefined,
      page,
      pageSize: 25
    }).then(setData).catch(reason => setError(reason instanceof Error ? reason.message : 'Unable to load institutes')).finally(() => setLoading(false));
  }, [params, page]);
  const setFilter = (key: string, value: string) => { const next = new URLSearchParams(params); if (value) next.set(key, value); else next.delete(key); next.set('page', '1'); setParams(next); };
  return <div className="mx-auto max-w-[1500px] space-y-5">
    <section className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between"><div><p className="text-xs font-black uppercase tracking-[0.2em] text-amber-700">Institute operations</p><h2 className="mt-2 text-3xl font-black">Every coaching center, one operational view.</h2><p className="mt-2 text-sm text-stone-600">Search accounts, inspect attention signals, and open a dedicated 360° workspace.</p></div><Link to="/super-admin/institutes/new" className="inline-flex items-center justify-center gap-2 rounded-2xl bg-stone-950 px-4 py-3 text-sm font-black text-white"><Plus className="h-4 w-4" />Onboard institute</Link></section>
    <section className="rounded-[28px] border border-stone-200 bg-[#fffdf9] shadow-sm">
      <div className="grid gap-3 border-b border-stone-200 p-4 sm:grid-cols-[minmax(240px,1fr)_180px_180px] sm:p-5"><label className="flex items-center gap-2 rounded-2xl border border-stone-200 bg-white px-3 py-2.5"><Search className="h-4 w-4 text-stone-400" /><input value={draftQuery} onChange={event => setDraftQuery(event.target.value)} placeholder="Institute, owner, phone, city…" className="min-w-0 flex-1 bg-transparent text-sm outline-none" /></label><select value={params.get('status') || ''} onChange={event => setFilter('status', event.target.value)} className="rounded-2xl border border-stone-200 bg-white px-3 py-2.5 text-sm font-bold"><option value="">All statuses</option><option>ACTIVE</option><option>SUSPENDED</option></select><select value={params.get('plan') || ''} onChange={event => setFilter('plan', event.target.value)} className="rounded-2xl border border-stone-200 bg-white px-3 py-2.5 text-sm font-bold"><option value="">All plans</option><option>FREE</option><option>BASIC</option><option>PRO</option><option>ENTERPRISE</option><option>NO_PLAN</option></select></div>
      {loading ? <div className="space-y-3 p-5">{Array.from({ length: 6 }, (_, index) => <div key={index} className="h-16 animate-pulse rounded-2xl bg-stone-100" />)}</div> : error ? <div className="p-10 text-center text-sm font-semibold text-rose-700">{error}</div> : !data?.items.length ? <div className="p-12 text-center"><Building2 className="mx-auto h-8 w-8 text-stone-300" /><p className="mt-3 font-black">No institutes match these filters.</p></div> : <div className="overflow-x-auto"><table className="w-full min-w-[960px] text-left"><thead><tr className="border-b border-stone-200 text-[10px] font-black uppercase tracking-wider text-stone-400"><th className="px-5 py-3">Institute</th><th className="px-4 py-3">Account</th><th className="px-4 py-3">Plan</th><th className="px-4 py-3">Usage</th><th className="px-4 py-3">Marketplace</th><th className="px-4 py-3">Attention</th><th className="px-5 py-3" /></tr></thead><tbody>{data.items.map(item => <tr key={item.id} className="border-b border-stone-100 last:border-0 hover:bg-amber-50/50"><td className="px-5 py-4"><p className="font-black">{item.name}</p><p className="mt-1 text-xs text-stone-500">{item.teacherName || 'Owner not set'} · {item.phoneNumber || 'No phone'}</p></td><td className="px-4 py-4"><span className={`rounded-full px-2.5 py-1 text-xs font-black ${badge(item.status)}`}>{item.status}</span><p className="mt-2 text-xs text-stone-500">{item.accessKind.replace('_', ' ')}</p></td><td className="px-4 py-4"><p className="font-bold">{item.plan}</p><p className="mt-1 text-xs text-stone-500">{item.planExpiryDate ? `Until ${new Date(item.planExpiryDate).toLocaleDateString()}` : 'No expiry'}</p></td><td className="px-4 py-4"><div className="flex items-center gap-2 text-sm font-bold"><UsersRound className="h-4 w-4 text-stone-400" />{item.students} students</div><p className="mt-1 text-xs text-stone-500">{item.batches} batches</p></td><td className="px-4 py-4"><p className="text-sm font-bold">{item.isPubliclyListed ? 'Public' : 'Hidden'}</p><p className="mt-1 text-xs text-stone-500">{item.ownershipStatus}</p></td><td className="px-4 py-4"><div className="flex flex-wrap gap-1">{item.attention.length ? item.attention.map(signal => <span key={signal} className="rounded-full bg-amber-100 px-2 py-1 text-[10px] font-black text-amber-800">{signal.replaceAll('_', ' ')}</span>) : <span className="text-xs text-stone-400">Clear</span>}</div></td><td className="px-5 py-4"><Link to={`/super-admin/institutes/${item.id}`} state={{ from: `?${params}` }} className="inline-flex items-center gap-1 text-sm font-black">Open<ArrowRight className="h-4 w-4" /></Link></td></tr>)}</tbody></table></div>}
      {data ? <div className="flex items-center justify-between border-t border-stone-200 p-4"><p className="text-xs font-semibold text-stone-500">{data.total} institutes · page {data.page}</p><div className="flex gap-2"><button disabled={page <= 1} onClick={() => setFilter('page', String(page - 1))} className="rounded-xl border border-stone-200 bg-white p-2 disabled:opacity-40" aria-label="Previous page"><ChevronLeft className="h-4 w-4" /></button><button disabled={page * data.pageSize >= data.total} onClick={() => setFilter('page', String(page + 1))} className="rounded-xl border border-stone-200 bg-white p-2 disabled:opacity-40" aria-label="Next page"><ChevronRight className="h-4 w-4" /></button></div></div> : null}
    </section>
  </div>;
}
