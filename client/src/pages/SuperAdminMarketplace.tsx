import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import toast from 'react-hot-toast';
import {
  ArrowLeft, BadgeCheck, Building2, Check, ChevronRight, CircleAlert,
  ExternalLink, Eye, EyeOff, Filter, Globe2, Inbox, Loader2, MapPin,
  MoreHorizontal, RefreshCw, Search, ShieldCheck, Sparkles, Star, X
} from 'lucide-react';
import { GooglePlaceConnectModal } from '../components/GooglePlaceConnectModal';

type MarketplaceTab = 'listings' | 'reviews';
type ListingFilter = 'all' | 'public' | 'hidden' | 'unverified' | 'google';

interface MarketplaceMetrics {
  totalListings: number;
  publishedListings: number;
  verifiedListings: number;
  googleConnected: number;
  pendingReviews: number;
  newLeads: number;
  claimRequests: number;
}

interface MarketplaceListing {
  id: string;
  name: string;
  slug?: string | null;
  teacherName?: string | null;
  city?: string | null;
  area?: string | null;
  logoUrl?: string | null;
  status: string;
  plan: string;
  isPubliclyListed: boolean;
  isVerified: boolean;
  googlePlaceId?: string | null;
  googleMapsUrl?: string | null;
  googleRating?: number | null;
  googleReviewCount?: number | null;
  googleLastSyncedAt?: string | null;
  profileCompleteness: number;
  _count: { reviews: number; leadInquiries: number };
}

interface MarketplaceReview {
  id: string;
  reviewerName: string;
  reviewerRole: string;
  rating: number;
  comment: string;
  source: string;
  status: 'APPROVED' | 'PENDING' | 'REJECTED';
  createdAt: string;
  institute: { id: string; name: string; slug?: string | null };
}

const authHeaders = () => ({ Authorization: `Bearer ${localStorage.getItem('token') || ''}` });

export default function SuperAdminMarketplace() {
  const [tab, setTab] = useState<MarketplaceTab>('listings');
  const [filter, setFilter] = useState<ListingFilter>('all');
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [metrics, setMetrics] = useState<MarketplaceMetrics | null>(null);
  const [listings, setListings] = useState<MarketplaceListing[]>([]);
  const [reviews, setReviews] = useState<MarketplaceReview[]>([]);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [googleListing, setGoogleListing] = useState<MarketplaceListing | null>(null);

  const loadOverview = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch('/api/marketplace/super-admin/overview', { headers: authHeaders() });
      const result = await response.json();
      if (!response.ok || !result.success) throw new Error(result.message || 'Unable to load marketplace');
      setMetrics(result.data.metrics);
      setListings(result.data.listings || []);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Unable to load marketplace');
    } finally {
      setLoading(false);
    }
  }, []);

  const loadReviews = useCallback(async () => {
    try {
      const response = await fetch('/api/marketplace/super-admin/reviews', { headers: authHeaders() });
      const result = await response.json();
      if (!response.ok || !result.success) throw new Error(result.message || 'Unable to load reviews');
      setReviews(result.data || []);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Unable to load reviews');
    }
  }, []);

  useEffect(() => { loadOverview(); }, [loadOverview]);
  useEffect(() => { if (tab === 'reviews' && reviews.length === 0) loadReviews(); }, [tab, reviews.length, loadReviews]);

  const filteredListings = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return listings.filter((listing) => {
      const matchesQuery = !needle || [listing.name, listing.teacherName, listing.city, listing.area]
        .some((value) => value?.toLowerCase().includes(needle));
      const matchesFilter = filter === 'all'
        || (filter === 'public' && listing.isPubliclyListed)
        || (filter === 'hidden' && !listing.isPubliclyListed)
        || (filter === 'unverified' && !listing.isVerified)
        || (filter === 'google' && Boolean(listing.googlePlaceId));
      return matchesQuery && matchesFilter;
    });
  }, [filter, listings, query]);

  const updateListing = async (listing: MarketplaceListing, values: Partial<Pick<MarketplaceListing, 'isPubliclyListed' | 'isVerified'>>) => {
    setBusyId(listing.id);
    try {
      const response = await fetch(`/api/institutes/${listing.id}/toggle-listing`, {
        method: 'PATCH',
        headers: { ...authHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify(values)
      });
      if (!response.ok) throw new Error('Unable to update listing');
      toast.success(values.isVerified !== undefined ? 'Verification updated' : 'Visibility updated');
      await loadOverview();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Unable to update listing');
    } finally {
      setBusyId(null);
    }
  };

  const updateReview = async (reviewId: string, status: MarketplaceReview['status']) => {
    setBusyId(reviewId);
    try {
      const response = await fetch(`/api/marketplace/super-admin/reviews/${reviewId}`, {
        method: 'PATCH',
        headers: { ...authHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ status })
      });
      const result = await response.json();
      if (!response.ok || !result.success) throw new Error(result.message || 'Unable to update review');
      setReviews((current) => current.map((review) => review.id === reviewId ? { ...review, status } : review));
      setMetrics((current) => current ? {
        ...current,
        pendingReviews: reviews.filter((review) => review.id !== reviewId && review.status === 'PENDING').length
      } : current);
      toast.success(`Review ${status.toLowerCase()}`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Unable to update review');
    } finally {
      setBusyId(null);
    }
  };

  if (loading && !metrics) {
    return <div className="min-h-screen bg-[#f6f7f9] grid place-items-center"><Loader2 className="w-8 h-8 animate-spin text-neutral-900" /></div>;
  }

  const metricCards = [
    { label: 'Published listings', value: metrics?.publishedListings ?? 0, meta: `${metrics?.totalListings ?? 0} total`, icon: Globe2, tone: 'bg-emerald-50 text-emerald-700' },
    { label: 'Verified profiles', value: metrics?.verifiedListings ?? 0, meta: 'Trust badge live', icon: BadgeCheck, tone: 'bg-blue-50 text-blue-700' },
    { label: 'Google connected', value: metrics?.googleConnected ?? 0, meta: 'Admin managed', icon: RefreshCw, tone: 'bg-violet-50 text-violet-700' },
    { label: 'Needs attention', value: (metrics?.pendingReviews ?? 0) + (metrics?.claimRequests ?? 0), meta: `${metrics?.pendingReviews ?? 0} reviews · ${metrics?.claimRequests ?? 0} claims`, icon: CircleAlert, tone: 'bg-amber-50 text-amber-700' }
  ];

  return (
    <div className="min-h-screen bg-[#f6f7f9] text-neutral-950">
      <header className="sticky top-0 z-30 border-b border-neutral-200/80 bg-white/90 backdrop-blur-xl">
        <div className="max-w-[1440px] mx-auto px-4 sm:px-8 h-18 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <Link to="/super-admin" className="w-9 h-9 rounded-xl border border-neutral-200 grid place-items-center hover:bg-neutral-50" aria-label="Back to superadmin dashboard">
              <ArrowLeft className="w-4 h-4" />
            </Link>
            <div className="w-10 h-10 rounded-2xl bg-neutral-950 text-white grid place-items-center shadow-sm"><ShieldCheck className="w-5 h-5" /></div>
            <div className="min-w-0">
              <p className="text-[11px] uppercase tracking-[0.18em] font-bold text-neutral-400">Superadmin</p>
              <h1 className="text-lg font-black tracking-tight truncate">Marketplace control center</h1>
            </div>
          </div>
          <Link to="/coaching" target="_blank" className="inline-flex items-center gap-2 px-4 py-2 rounded-full border border-neutral-200 bg-white text-xs font-bold hover:bg-neutral-50">
            <Eye className="w-4 h-4" /><span className="hidden sm:inline">View marketplace</span><ExternalLink className="w-3 h-3" />
          </Link>
        </div>
      </header>

      <main className="max-w-[1440px] mx-auto px-4 sm:px-8 py-8 space-y-7">
        <section className="rounded-[28px] bg-neutral-950 text-white p-6 sm:p-8 overflow-hidden relative">
          <div className="absolute -right-20 -top-24 w-72 h-72 bg-violet-500/20 blur-3xl rounded-full" />
          <div className="relative flex flex-col lg:flex-row lg:items-end justify-between gap-6">
            <div className="max-w-2xl">
              <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/10 text-[11px] font-bold text-neutral-200 mb-4"><Sparkles className="w-3.5 h-3.5" /> Marketplace operations</div>
              <h2 className="text-2xl sm:text-4xl font-black tracking-[-0.035em]">Curate a marketplace families can trust.</h2>
              <p className="text-sm text-neutral-400 mt-3 max-w-xl">Publish quality profiles, verify coaching identities, moderate reviews and manage Google data from one private workspace.</p>
            </div>
            <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 flex items-center gap-3 shrink-0">
              <div className="w-9 h-9 rounded-xl bg-emerald-400/15 text-emerald-300 grid place-items-center"><Check className="w-5 h-5" /></div>
              <div><p className="text-xs font-bold">Google sync is private</p><p className="text-[11px] text-neutral-400">Superadmin authorization enforced</p></div>
            </div>
          </div>
        </section>

        <section className="grid grid-cols-2 xl:grid-cols-4 gap-3 sm:gap-4">
          {metricCards.map(({ label, value, meta, icon: Icon, tone }) => (
            <div key={label} className="bg-white rounded-2xl border border-neutral-200/70 p-4 sm:p-5 shadow-[0_1px_2px_rgba(0,0,0,0.02)]">
              <div className={`w-9 h-9 rounded-xl grid place-items-center ${tone}`}><Icon className="w-4.5 h-4.5" /></div>
              <p className="text-2xl sm:text-3xl font-black mt-4 tracking-tight">{value}</p>
              <p className="text-xs font-bold mt-1">{label}</p><p className="text-[11px] text-neutral-400 mt-0.5">{meta}</p>
            </div>
          ))}
        </section>

        <section className="bg-white rounded-[28px] border border-neutral-200/70 shadow-[0_8px_30px_rgba(0,0,0,0.035)] overflow-hidden">
          <div className="px-4 sm:px-6 pt-5 border-b border-neutral-200/70">
            <div className="flex items-center gap-1 overflow-x-auto">
              <button onClick={() => setTab('listings')} className={`px-4 py-3 text-xs font-bold border-b-2 whitespace-nowrap ${tab === 'listings' ? 'border-neutral-950 text-neutral-950' : 'border-transparent text-neutral-400'}`}>Listings <span className="ml-1.5 px-2 py-0.5 bg-neutral-100 rounded-full">{metrics?.totalListings ?? 0}</span></button>
              <button onClick={() => setTab('reviews')} className={`px-4 py-3 text-xs font-bold border-b-2 whitespace-nowrap ${tab === 'reviews' ? 'border-neutral-950 text-neutral-950' : 'border-transparent text-neutral-400'}`}>Review moderation {Boolean(metrics?.pendingReviews) && <span className="ml-1.5 px-2 py-0.5 bg-amber-100 text-amber-800 rounded-full">{metrics?.pendingReviews}</span>}</button>
            </div>
          </div>

          {tab === 'listings' ? (
            <>
              <div className="p-4 sm:p-6 flex flex-col lg:flex-row lg:items-center justify-between gap-3">
                <div className="relative flex-1 max-w-lg"><Search className="absolute left-3.5 top-3 w-4 h-4 text-neutral-400" /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search coaching, teacher or city" className="w-full rounded-xl bg-neutral-50 border border-neutral-200 pl-10 pr-9 py-2.5 text-sm outline-none focus:ring-2 focus:ring-neutral-900" />{query && <button onClick={() => setQuery('')} className="absolute right-3 top-3"><X className="w-4 h-4 text-neutral-400" /></button>}</div>
                <div className="flex items-center gap-2 overflow-x-auto"><Filter className="w-4 h-4 text-neutral-400 shrink-0" />{(['all', 'public', 'hidden', 'unverified', 'google'] as ListingFilter[]).map((item) => <button key={item} onClick={() => setFilter(item)} className={`px-3 py-2 rounded-full text-[11px] font-bold capitalize whitespace-nowrap border ${filter === item ? 'bg-neutral-950 text-white border-neutral-950' : 'bg-white text-neutral-500 border-neutral-200 hover:bg-neutral-50'}`}>{item}</button>)}</div>
              </div>

              <div className="divide-y divide-neutral-100">
                {filteredListings.length === 0 ? <EmptyState label="No listings match these filters" /> : filteredListings.map((listing) => (
                  <article key={listing.id} className="p-4 sm:p-6 hover:bg-neutral-50/60 transition-colors">
                    <div className="flex flex-col xl:flex-row xl:items-center gap-5">
                      <div className="flex items-start gap-3 sm:gap-4 flex-1 min-w-0">
                        {listing.logoUrl ? <img src={listing.logoUrl} alt="" className="w-12 h-12 rounded-2xl object-cover border border-neutral-200" /> : <div className="w-12 h-12 rounded-2xl bg-neutral-100 grid place-items-center shrink-0"><Building2 className="w-5 h-5 text-neutral-500" /></div>}
                        <div className="min-w-0"><div className="flex items-center gap-2 flex-wrap"><h3 className="font-extrabold text-sm sm:text-base truncate">{listing.name}</h3>{listing.isVerified && <BadgeCheck className="w-4 h-4 text-blue-600 fill-blue-50" />}{listing.status !== 'ACTIVE' && <span className="text-[10px] font-bold bg-red-50 text-red-700 px-2 py-0.5 rounded-full">{listing.status}</span>}</div><p className="text-xs text-neutral-500 mt-1 flex items-center gap-1.5 flex-wrap"><span>{listing.teacherName || 'Teacher not added'}</span><span>·</span><MapPin className="w-3 h-3" /><span>{[listing.area, listing.city].filter(Boolean).join(', ') || 'Location missing'}</span></p><div className="flex items-center gap-3 mt-2 text-[11px] text-neutral-400"><span>{listing._count.reviews} reviews</span><span>{listing._count.leadInquiries} leads</span><span className="font-semibold text-neutral-600">{listing.plan}</span></div></div>
                      </div>

                      <div className="w-full xl:w-40"><div className="flex justify-between text-[10px] font-bold text-neutral-500 mb-1.5"><span>Profile quality</span><span>{listing.profileCompleteness}%</span></div><div className="h-1.5 rounded-full bg-neutral-100 overflow-hidden"><div className={`h-full rounded-full ${listing.profileCompleteness >= 80 ? 'bg-emerald-500' : listing.profileCompleteness >= 50 ? 'bg-amber-500' : 'bg-red-500'}`} style={{ width: `${listing.profileCompleteness}%` }} /></div></div>

                      <div className="xl:w-48"><p className="text-[10px] uppercase tracking-wider font-bold text-neutral-400 mb-1.5">Google profile</p>{listing.googlePlaceId ? <div className="flex items-center gap-2"><span className="w-6 h-6 rounded-lg bg-blue-600 text-white text-xs font-black grid place-items-center">G</span><div><p className="text-xs font-bold">{listing.googleRating ?? '—'} <Star className="inline w-3 h-3 fill-amber-400 text-amber-400" /> · {listing.googleReviewCount || 0}</p><p className="text-[10px] text-neutral-400">{listing.googleLastSyncedAt ? `Synced ${new Date(listing.googleLastSyncedAt).toLocaleDateString()}` : 'Connected'}</p></div></div> : <p className="text-xs text-neutral-400">Not connected</p>}</div>

                      <div className="flex items-center gap-2 flex-wrap xl:justify-end">
                        {listing.slug && <Link to={`/coaching/${listing.slug}`} target="_blank" className="w-9 h-9 rounded-xl border border-neutral-200 grid place-items-center hover:bg-white" title="Preview listing"><ExternalLink className="w-4 h-4" /></Link>}
                        <button disabled={busyId === listing.id} onClick={() => updateListing(listing, { isPubliclyListed: !listing.isPubliclyListed })} className={`h-9 px-3 rounded-xl border text-[11px] font-bold flex items-center gap-1.5 ${listing.isPubliclyListed ? 'border-neutral-200 bg-white text-neutral-700' : 'border-emerald-200 bg-emerald-50 text-emerald-800'}`}>{listing.isPubliclyListed ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}{listing.isPubliclyListed ? 'Hide' : 'Publish'}</button>
                        <button disabled={busyId === listing.id} onClick={() => updateListing(listing, { isVerified: !listing.isVerified })} className={`h-9 px-3 rounded-xl border text-[11px] font-bold flex items-center gap-1.5 ${listing.isVerified ? 'border-blue-200 bg-blue-50 text-blue-800' : 'border-neutral-200 bg-white text-neutral-700'}`}><BadgeCheck className="w-3.5 h-3.5" />{listing.isVerified ? 'Verified' : 'Verify'}</button>
                        <button onClick={() => setGoogleListing(listing)} className="h-9 px-3 rounded-xl bg-neutral-950 text-white text-[11px] font-bold flex items-center gap-1.5"><RefreshCw className="w-3.5 h-3.5" />Google</button>
                      </div>
                    </div>
                  </article>
                ))}
              </div>
            </>
          ) : (
            <div className="divide-y divide-neutral-100">
              {reviews.length === 0 ? <EmptyState label="No marketplace reviews yet" /> : reviews.map((review) => (
                <article key={review.id} className="p-5 sm:p-6 flex flex-col lg:flex-row lg:items-start gap-5">
                  <div className="flex-1"><div className="flex items-center gap-2 flex-wrap"><div className="flex">{Array.from({ length: 5 }).map((_, index) => <Star key={index} className={`w-3.5 h-3.5 ${index < review.rating ? 'fill-amber-400 text-amber-400' : 'text-neutral-200'}`} />)}</div><span className="text-xs font-extrabold">{review.reviewerName}</span><span className="text-[10px] text-neutral-400">{review.reviewerRole}</span><span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${review.status === 'APPROVED' ? 'bg-emerald-50 text-emerald-700' : review.status === 'REJECTED' ? 'bg-red-50 text-red-700' : 'bg-amber-50 text-amber-700'}`}>{review.status}</span></div><p className="text-sm text-neutral-700 mt-3 leading-relaxed">“{review.comment}”</p><p className="text-[11px] text-neutral-400 mt-3">{review.institute.name} · {new Date(review.createdAt).toLocaleDateString()} · {review.source}</p></div>
                  <div className="flex items-center gap-2"><button disabled={busyId === review.id} onClick={() => updateReview(review.id, 'REJECTED')} className="px-3 py-2 rounded-xl border border-red-200 text-red-700 text-[11px] font-bold">Reject</button><button disabled={busyId === review.id} onClick={() => updateReview(review.id, 'APPROVED')} className="px-3 py-2 rounded-xl bg-neutral-950 text-white text-[11px] font-bold">Approve</button><MoreHorizontal className="w-4 h-4 text-neutral-300" /></div>
                </article>
              ))}
            </div>
          )}
        </section>

        <section className="grid md:grid-cols-2 gap-4">
          <div className="rounded-2xl border border-neutral-200 bg-white p-5 flex items-center gap-4"><div className="w-11 h-11 rounded-2xl bg-violet-50 text-violet-700 grid place-items-center"><Inbox className="w-5 h-5" /></div><div className="flex-1"><p className="text-sm font-extrabold">Lead operations</p><p className="text-xs text-neutral-400 mt-0.5">{metrics?.newLeads ?? 0} new student inquiries across the marketplace</p></div><ChevronRight className="w-4 h-4 text-neutral-300" /></div>
          <div className="rounded-2xl border border-neutral-200 bg-white p-5 flex items-center gap-4"><div className="w-11 h-11 rounded-2xl bg-amber-50 text-amber-700 grid place-items-center"><ShieldCheck className="w-5 h-5" /></div><div className="flex-1"><p className="text-sm font-extrabold">Ownership claims</p><p className="text-xs text-neutral-400 mt-0.5">{metrics?.claimRequests ?? 0} profile claims need identity verification</p></div><ChevronRight className="w-4 h-4 text-neutral-300" /></div>
        </section>
      </main>

      {googleListing && <GooglePlaceConnectModal isOpen onClose={() => setGoogleListing(null)} instituteId={googleListing.id} currentPlaceId={googleListing.googlePlaceId} currentRating={googleListing.googleRating} currentReviewCount={googleListing.googleReviewCount} currentMapsUrl={googleListing.googleMapsUrl} onSyncSuccess={() => { setGoogleListing(null); loadOverview(); }} />}
    </div>
  );
}

function EmptyState({ label }: { label: string }) {
  return <div className="py-20 text-center"><div className="w-12 h-12 mx-auto rounded-2xl bg-neutral-100 grid place-items-center"><Search className="w-5 h-5 text-neutral-400" /></div><p className="text-sm font-bold mt-4">{label}</p><p className="text-xs text-neutral-400 mt-1">Try changing the search or filter.</p></div>;
}
