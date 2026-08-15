import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { Bell, ChevronRight, Menu, Search, Sparkles, X } from 'lucide-react';
import { superAdminNavigation } from './navigation';
import { superAdminShellApi } from './api';
import type { InstituteSearchResult } from './types';
import { SuperAdminReauthProvider } from './ReauthDialog';

export function SuperAdminShell({ counts = {}, children }: { counts?: Partial<Record<string, number>>; children?: React.ReactNode }) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<InstituteSearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();
  const searchRef = useRef<HTMLDivElement>(null);
  const title = useMemo(() => superAdminNavigation.find(item => item.href === location.pathname || (item.href !== '/super-admin' && location.pathname.startsWith(item.href)))?.label || 'Operations', [location.pathname]);

  useEffect(() => {
    if (query.trim().length < 2) { setResults([]); return; }
    const timer = window.setTimeout(async () => {
      setSearching(true);
      try { setResults(await superAdminShellApi.search(query)); }
      catch { setResults([]); }
      finally { setSearching(false); }
    }, 250);
    return () => window.clearTimeout(timer);
  }, [query]);

  useEffect(() => {
    const close = (event: MouseEvent) => { if (!searchRef.current?.contains(event.target as Node)) setResults([]); };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, []);

  const navigation = <>
    <Link to="/super-admin" className="mb-8 flex items-center gap-3 px-2">
      <div className="grid h-11 w-11 place-items-center rounded-2xl bg-stone-950 text-white shadow-lg shadow-stone-950/15"><Sparkles className="h-5 w-5" /></div>
      <div><p className="text-[10px] font-black uppercase tracking-[0.2em] text-stone-400">MathLogs</p><p className="text-sm font-black text-stone-950">Operations</p></div>
    </Link>
    {['Operate', 'Grow', 'Serve', 'Platform'].map(group => <div key={group} className="mb-6">
      <p className="mb-2 px-3 text-[10px] font-black uppercase tracking-[0.18em] text-stone-400">{group}</p>
      <nav className="space-y-1" aria-label={`${group} Superadmin navigation`}>
        {superAdminNavigation.filter(item => item.group === group).map(item => {
          const Icon = item.icon;
          const count = counts[item.id] || 0;
          return <NavLink key={item.id} to={item.href} end={item.href === '/super-admin'} onClick={() => setMobileOpen(false)} className={({ isActive }) => `flex items-center gap-3 rounded-2xl px-3 py-2.5 text-sm font-bold transition ${isActive ? 'bg-stone-950 text-white shadow-md' : 'text-stone-600 hover:bg-stone-100 hover:text-stone-950'}`}>
            <Icon className="h-4 w-4" /><span className="flex-1">{item.label}</span>{count ? <span className="rounded-full bg-amber-300 px-2 py-0.5 text-[10px] font-black text-stone-950">{count}</span> : null}
          </NavLink>;
        })}
      </nav>
    </div>)}
  </>;

  return <SuperAdminReauthProvider><div className="min-h-screen bg-[#f4f1eb] text-stone-950">
    <aside className="fixed inset-y-0 left-0 z-50 hidden w-64 overflow-y-auto border-r border-stone-200 bg-[#fffdf9] p-4 lg:block">{navigation}</aside>
    {mobileOpen ? <div className="fixed inset-0 z-50 lg:hidden"><button className="absolute inset-0 bg-stone-950/35 backdrop-blur-sm" onClick={() => setMobileOpen(false)} aria-label="Close navigation" /><aside className="relative h-full w-[min(86vw,320px)] overflow-y-auto bg-[#fffdf9] p-4 shadow-2xl"><button onClick={() => setMobileOpen(false)} className="absolute right-4 top-4 rounded-xl p-2 text-stone-500 hover:bg-stone-100" aria-label="Close menu"><X className="h-5 w-5" /></button>{navigation}</aside></div> : null}
    <div className="lg:pl-64">
      <header className="sticky top-0 z-40 flex h-[72px] items-center gap-3 border-b border-stone-200/80 bg-[#fffdf9]/90 px-4 backdrop-blur-xl sm:px-6">
        <button onClick={() => setMobileOpen(true)} className="rounded-xl border border-stone-200 bg-white p-2.5 lg:hidden" aria-label="Open navigation"><Menu className="h-4 w-4" /></button>
        <div className="hidden min-w-[150px] sm:block"><p className="text-[10px] font-black uppercase tracking-[0.18em] text-stone-400">Superadmin</p><h1 className="text-base font-black">{title}</h1></div>
        <div ref={searchRef} className="relative mx-auto w-full max-w-xl">
          <label className="flex items-center gap-3 rounded-2xl border border-stone-200 bg-white px-4 py-2.5 shadow-sm focus-within:border-amber-500 focus-within:ring-4 focus-within:ring-amber-100"><Search className="h-4 w-4 text-stone-400" /><input value={query} onChange={event => setQuery(event.target.value)} placeholder="Search institutes, owners, phone…" className="min-w-0 flex-1 bg-transparent text-sm outline-none" /><span className="hidden rounded-md border border-stone-200 px-1.5 py-0.5 text-[10px] font-bold text-stone-400 sm:inline">⌘ K</span></label>
          {(results.length > 0 || searching) && query.trim().length >= 2 ? <div className="absolute left-0 right-0 top-[calc(100%+8px)] overflow-hidden rounded-2xl border border-stone-200 bg-white shadow-2xl">
            {searching ? <p className="p-4 text-sm text-stone-500">Searching…</p> : results.map(result => <button key={result.instituteId} onClick={() => { navigate(result.href); setQuery(''); setResults([]); }} className="flex w-full items-center gap-3 border-b border-stone-100 px-4 py-3 text-left last:border-0 hover:bg-amber-50"><div className="grid h-9 w-9 place-items-center rounded-xl bg-stone-100 text-xs font-black">{result.name.slice(0, 2).toUpperCase()}</div><div className="min-w-0 flex-1"><p className="truncate text-sm font-bold">{result.name}</p><p className="truncate text-xs text-stone-500">{result.teacherName || result.phoneNumber || result.city || 'Institute'}</p></div><ChevronRight className="h-4 w-4 text-stone-300" /></button>)}
          </div> : null}
        </div>
        <button className="relative rounded-xl border border-stone-200 bg-white p-2.5 text-stone-600" aria-label="Attention queue"><Bell className="h-4 w-4" /><span className="absolute right-1.5 top-1.5 h-1.5 w-1.5 rounded-full bg-amber-500" /></button>
      </header>
      <main className="min-h-[calc(100vh-72px)] p-4 sm:p-6 xl:p-8">{children ?? <Outlet />}</main>
    </div>
  </div></SuperAdminReauthProvider>;
}
