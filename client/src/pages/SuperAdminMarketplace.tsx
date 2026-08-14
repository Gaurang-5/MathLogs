import { useCallback, useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { marketplaceApi } from '../features/superadmin-marketplace/api';
import { ClaimsPanel } from '../features/superadmin-marketplace/ClaimsPanel';
import { LeadDeliveryPanel } from '../features/superadmin-marketplace/LeadDeliveryPanel';
import { ListingsPanel } from '../features/superadmin-marketplace/ListingsPanel';
import { MarketplaceShell } from '../features/superadmin-marketplace/MarketplaceShell';
import { OverviewPanel } from '../features/superadmin-marketplace/OverviewPanel';
import { ReviewsPanel } from '../features/superadmin-marketplace/ReviewsPanel';
import { attentionCounts, parseMarketplaceSection } from '../features/superadmin-marketplace/state';
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

  return <MarketplaceShell section={section} counts={counts} refreshing={refreshing} onSelect={selectSection} onRefresh={refreshAll} onSearch={query => { void selectSection('listings', query ? 'all' : undefined, query); }}>{content}</MarketplaceShell>;
}
