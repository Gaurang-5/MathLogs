import { type ReactNode, useState } from 'react';
import { Activity, Building2, CheckSquare, ClipboardCheck, ExternalLink, LayoutDashboard, Menu, RefreshCw, Search, X } from 'lucide-react';
import type { MarketplaceSection } from './types';
import { sectionTitle } from './state';

const navigation: Array<{ id: MarketplaceSection; label: string; icon: typeof LayoutDashboard; badge?: 'claims' | 'reviews' | 'leads' }> = [
  { id: 'overview', label: 'Overview', icon: LayoutDashboard }, { id: 'listings', label: 'Listings', icon: Building2 },
  { id: 'claims', label: 'Ownership claims', icon: ClipboardCheck, badge: 'claims' }, { id: 'reviews', label: 'Reviews', icon: CheckSquare, badge: 'reviews' },
  { id: 'leads', label: 'Lead delivery', icon: Activity, badge: 'leads' },
];

export function MarketplaceShell({ section, counts, refreshing, onSelect, onRefresh, onSearch, children }: {
  section: MarketplaceSection; counts: Partial<Record<'claims' | 'reviews' | 'leads', number>>; refreshing: boolean;
  onSelect: (section: MarketplaceSection) => void; onRefresh: () => void; onSearch: (query: string) => void; children: ReactNode;
}) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [query, setQuery] = useState('');
  const select = (next: MarketplaceSection) => { onSelect(next); setMobileOpen(false); };
  const submitSearch = (event: React.FormEvent) => { event.preventDefault(); onSearch(query); };
  return <div className="min-h-screen bg-[#f6f7f9] text-neutral-950">
    <div className="mx-auto flex min-h-screen max-w-[1540px]">
      <aside className="hidden w-60 shrink-0 border-r border-neutral-200 bg-white p-4 md:block">
        <div className="mb-8 flex items-center gap-3 px-2"><div className="grid h-10 w-10 place-items-center rounded-2xl bg-neutral-950 text-white"><Building2 className="h-5 w-5" /></div><div><p className="text-[10px] font-black uppercase tracking-[0.18em] text-neutral-400">Superadmin</p><p className="text-sm font-black">Marketplace</p></div></div>
        <nav className="space-y-1" aria-label="Marketplace operations">{navigation.map(item => { const Icon = item.icon; const count = item.badge ? counts[item.badge] : 0; return <button key={item.id} onClick={() => select(item.id)} className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-xs font-bold transition ${section === item.id ? 'bg-neutral-950 text-white shadow-sm' : 'text-neutral-600 hover:bg-neutral-100'}`}><Icon className="h-4 w-4" /><span className="flex-1">{item.label}</span>{count ? <span className={`rounded-full px-1.5 py-0.5 text-[10px] ${section === item.id ? 'bg-amber-400 text-neutral-900' : 'bg-amber-100 text-amber-800'}`}>{count}</span> : null}</button>; })}</nav>
      </aside>
      <div className="min-w-0 flex-1"><header className="sticky top-0 z-30 flex h-16 items-center gap-3 border-b border-neutral-200 bg-white/90 px-4 backdrop-blur-xl sm:px-7">
        <button onClick={() => setMobileOpen(value => !value)} className="rounded-xl border border-neutral-200 p-2 md:hidden" aria-label="Toggle navigation">{mobileOpen ? <X className="h-4 w-4" /> : <Menu className="h-4 w-4" />}</button>
        <div className="min-w-0 flex-1"><p className="text-[10px] font-black uppercase tracking-[0.16em] text-neutral-400">Marketplace operations</p><h1 className="truncate text-base font-black tracking-tight">{sectionTitle(section)}</h1></div>
        <form onSubmit={submitSearch} className="hidden max-w-xs flex-1 sm:block"><label className="flex items-center gap-2 rounded-xl bg-neutral-100 px-3 py-2"><Search className="h-3.5 w-3.5 text-neutral-400" /><input value={query} onChange={event => setQuery(event.target.value)} placeholder="Search listings" className="min-w-0 flex-1 bg-transparent text-xs outline-none" /></label></form>
        <button onClick={onRefresh} disabled={refreshing} className="rounded-xl border border-neutral-200 p-2.5 text-neutral-600 hover:bg-neutral-50 disabled:opacity-50" aria-label="Refresh marketplace data"><RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} /></button>
        <a href="/coaching" target="_blank" rel="noreferrer" className="hidden items-center gap-1.5 rounded-xl bg-neutral-950 px-3 py-2.5 text-xs font-bold text-white sm:inline-flex">View marketplace<ExternalLink className="h-3.5 w-3.5" /></a>
      </header>
      {mobileOpen && <nav className="border-b border-neutral-200 bg-white p-3 md:hidden">{navigation.map(item => <button key={item.id} onClick={() => select(item.id)} className={`mr-2 mb-2 rounded-full px-3 py-2 text-xs font-bold ${section === item.id ? 'bg-neutral-950 text-white' : 'bg-neutral-100 text-neutral-600'}`}>{item.label}{item.badge && counts[item.badge] ? ` (${counts[item.badge]})` : ''}</button>)}</nav>}
      <main className="p-4 sm:p-7">{children}</main></div>
    </div>
  </div>;
}
