import { useCallback, useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { ExternalLink, RefreshCw, Search } from 'lucide-react';
import { marketplaceApi } from '../features/superadmin-marketplace/api';
import { ClaimsPanel } from '../features/superadmin-marketplace/ClaimsPanel';
import { LeadDeliveryPanel } from '../features/superadmin-marketplace/LeadDeliveryPanel';
import { ListingsPanel } from '../features/superadmin-marketplace/ListingsPanel';
import { OverviewPanel } from '../features/superadmin-marketplace/OverviewPanel';
import { ReviewsPanel } from '../features/superadmin-marketplace/ReviewsPanel';
import { attentionCounts, parseMarketplaceSection, sectionTitle } from '../features/superadmin-marketplace/state';
import { canDiscardListingChanges, canSwitchMarketplaceSection } from '../features/superadmin-marketplace/listingEditorState';
import type { MarketplaceOverview, MarketplaceSection } from '../features/superadmin-marketplace/types';

export default function SuperAdminMarketplace() {
  const location = useLocation();
  const navigate = useNavigate();
  const [overview, setOverview] = useState<MarketplaceOverview | null>(null);
  const [refreshing, setRefreshing] = useState(true);
  const [refreshKey, setRefreshKey] = useState(0);
  const [section, setSection] = useState<MarketplaceSection>(() => parseMarketplaceSection(location.search));
  const [filters, setFilters] = useState<Partial<Record<MarketplaceSection, string>>>({});
  const [listingDirty, setListingDirty] = useState(false);
  const [acceptedSearch, setAcceptedSearch] = useState(location.search);
  const [searchQuery, setSearchQuery] = useState(new URLSearchParams(location.search).get('query') || '');

  const loadOverview = useCallback(async (quiet = false) => {
    setRefreshing(true);
    try {
      setOverview(await marketplaceApi.getOverview());
    } catch (reason) {
      if (!quiet) toast.error(reason instanceof Error ? reason.message : 'Unable to load marketplace overview');
    } finally {
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { void loadOverview(); }, [loadOverview]);
  useEffect(() => {
    if (location.search === acceptedSearch) {
      setSection(parseMarketplaceSection(location.search));
      return;
    }
    if (!canSwitchMarketplaceSection(listingDirty, acceptedSearch, location.search)) {
      navigate(`/super-admin/marketplace${acceptedSearch}`, { replace: true });
      return;
    }
    setAcceptedSearch(location.search);
    setSection(parseMarketplaceSection(location.search));
  }, [acceptedSearch, listingDirty, location.search, navigate]);

  const selectSection = (next: MarketplaceSection, filter?: string, query?: string) => {
    if (next !== section && !canDiscardListingChanges(listingDirty)) return false;
    if (filter) setFilters(current => ({ ...current, [next]: filter }));
    setSection(next);
    const nextSearch = `?section=${next}${query ? `&query=${encodeURIComponent(query)}` : ''}`;
    setAcceptedSearch(nextSearch);
    navigate(`/super-admin/marketplace${nextSearch}`);
    return true;
  };
  const refreshAll = () => { void loadOverview(); setRefreshKey(value => value + 1); };
  const changed = () => { void loadOverview(true); setRefreshKey(value => value + 1); };
  const counts = useMemo(() => overview ? attentionCounts(overview.metrics) : {}, [overview]);
  const content = section === 'overview'
    ? <OverviewPanel overview={overview} onSelect={selectSection} />
    : section === 'listings'
      ? <ListingsPanel initialFilter={filters.listings} initialQuery={new URLSearchParams(location.search).get('query') || ''} refreshKey={refreshKey} onChanged={changed} onDirtyChange={setListingDirty} />
      : section === 'claims'
        ? <ClaimsPanel initialFilter={filters.claims} refreshKey={refreshKey} onChanged={changed} />
        : section === 'reviews'
          ? <ReviewsPanel initialFilter={filters.reviews} refreshKey={refreshKey} onChanged={changed} />
          : <LeadDeliveryPanel initialFilter={filters.leads} refreshKey={refreshKey} onChanged={changed} />;

  const navigation: Array<{ id: MarketplaceSection; label: string; count?: number }> = [
    { id: 'overview', label: 'Overview' },
    { id: 'listings', label: 'Listings' },
    { id: 'claims', label: 'Ownership claims', count: counts.claims },
    { id: 'reviews', label: 'Reviews', count: counts.reviews },
    { id: 'leads', label: 'Lead delivery', count: counts.leads }
  ];
  return <div className="mx-auto max-w-[1500px] space-y-5">
    <section className="rounded-[28px] border border-stone-200 bg-[#fffdf9] p-5 shadow-sm sm:p-6">
      <div className="flex flex-col gap-5 xl:flex-row xl:items-end xl:justify-between">
        <div><p className="text-xs font-black uppercase tracking-[0.2em] text-amber-700">Marketplace operations</p><h2 className="mt-2 text-3xl font-black tracking-tight">{sectionTitle(section)}</h2><p className="mt-2 text-sm text-stone-600">Manage public listings, ownership verification, review quality, and student lead delivery.</p></div>
        <div className="flex flex-wrap items-center gap-2">
          <form onSubmit={event => { event.preventDefault(); void selectSection('listings', searchQuery ? 'all' : undefined, searchQuery); }} className="flex min-w-[240px] flex-1 items-center gap-2 rounded-2xl border border-stone-200 bg-white px-3 py-2.5 xl:flex-none"><Search className="h-4 w-4 text-stone-400" /><input value={searchQuery} onChange={event => setSearchQuery(event.target.value)} placeholder="Search listings" className="min-w-0 flex-1 bg-transparent text-sm outline-none" /></form>
          <button onClick={refreshAll} disabled={refreshing} className="rounded-2xl border border-stone-200 bg-white p-3 text-stone-600 disabled:opacity-50" aria-label="Refresh marketplace data"><RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} /></button>
          <a href="/coaching" target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 rounded-2xl bg-stone-950 px-4 py-3 text-sm font-black text-white">View public site<ExternalLink className="h-4 w-4" /></a>
        </div>
      </div>
      <nav className="mt-6 flex gap-2 overflow-x-auto pb-1" aria-label="Marketplace sections">{navigation.map(item => <button key={item.id} onClick={() => selectSection(item.id)} className={`whitespace-nowrap rounded-full px-4 py-2.5 text-sm font-bold transition ${section === item.id ? 'bg-stone-950 text-white' : 'bg-stone-100 text-stone-600 hover:bg-stone-200'}`}>{item.label}{item.count ? <span className={`ml-2 rounded-full px-2 py-0.5 text-[10px] font-black ${section === item.id ? 'bg-amber-300 text-stone-950' : 'bg-amber-100 text-amber-800'}`}>{item.count}</span> : null}</button>)}</nav>
    </section>
    {content}
  </div>;
}
