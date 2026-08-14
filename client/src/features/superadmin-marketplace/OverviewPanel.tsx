import { AlertTriangle, BadgeCheck, Building2, ClipboardCheck, Inbox, MapPinned, ShieldCheck, Star } from 'lucide-react';
import type { MarketplaceOverview, MarketplaceSection } from './types';
import { EmptyState } from './ui';
import { formatDate } from './format';

const cards = [
  { key: 'publishedListings', label: 'Published', icon: Building2, tone: 'text-neutral-950 bg-neutral-100' },
  { key: 'verifiedListings', label: 'Verified', icon: BadgeCheck, tone: 'text-blue-700 bg-blue-50' },
  { key: 'claimedListings', label: 'Claimed', icon: ShieldCheck, tone: 'text-emerald-700 bg-emerald-50' },
  { key: 'newLeads', label: 'New inquiries', icon: Inbox, tone: 'text-violet-700 bg-violet-50' },
] as const;

export function OverviewPanel({ overview, onSelect }: { overview: MarketplaceOverview | null; onSelect: (section: MarketplaceSection, filter?: string) => void }) {
  if (!overview) return <div className="grid min-h-[40vh] place-items-center text-sm font-semibold text-neutral-500">Loading marketplace overview…</div>;
  const { metrics, incompleteListings, recentActivity } = overview;
  const attention = [
    { label: 'Pending ownership claims', value: metrics.pendingClaims, section: 'claims' as const, filter: 'open', icon: ClipboardCheck },
    { label: 'Reviews awaiting moderation', value: metrics.pendingReviews, section: 'reviews' as const, filter: 'PENDING', icon: Star },
    { label: 'Held inquiries', value: metrics.heldLeads, section: 'leads' as const, filter: 'HELD', icon: Inbox },
    { label: 'Failed notifications', value: metrics.failedLeadNotifications, section: 'leads' as const, filter: 'FAILED', icon: AlertTriangle },
  ];
  return <div className="space-y-6">
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{cards.map(card => { const Icon = card.icon; return <div key={card.key} className="rounded-2xl border border-neutral-200 bg-white p-4 shadow-sm"><div className={`mb-4 grid h-9 w-9 place-items-center rounded-xl ${card.tone}`}><Icon className="h-4 w-4" /></div><p className="text-2xl font-black tracking-tight">{metrics[card.key]}</p><p className="mt-0.5 text-xs font-bold text-neutral-500">{card.label}</p></div>; })}</div>
    <div className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
      <section className="rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm"><div className="mb-3 flex items-center justify-between"><div><h2 className="text-sm font-black">Attention queue</h2><p className="text-xs text-neutral-500">Open the next trust or delivery exception.</p></div><span className="rounded-full bg-amber-100 px-2 py-1 text-[10px] font-black text-amber-800">{metrics.pendingClaims + metrics.pendingReviews + metrics.heldLeads + metrics.failedLeadNotifications}</span></div><div className="divide-y divide-neutral-100">{attention.map(item => { const Icon = item.icon; return <button key={item.label} onClick={() => onSelect(item.section, item.filter)} className="flex w-full items-center gap-3 py-3 text-left hover:bg-neutral-50"><span className="grid h-8 w-8 place-items-center rounded-lg bg-neutral-100"><Icon className="h-4 w-4 text-neutral-600" /></span><span className="flex-1 text-xs font-bold text-neutral-700">{item.label}</span><span className="text-sm font-black">{item.value}</span></button>; })}</div></section>
      <section className="rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm"><div className="mb-3"><h2 className="text-sm font-black">Recent activity</h2><p className="text-xs text-neutral-500">Sensitive marketplace changes.</p></div>{recentActivity.length === 0 ? <EmptyState title="No recent marketplace activity" detail="Listing edits, decisions and delivery retries will appear here." /> : <div className="space-y-3">{recentActivity.slice(0, 5).map(activity => <div key={activity.id} className="border-l-2 border-neutral-200 pl-3"><p className="text-xs font-bold text-neutral-700">{activity.action.replace(/_/g, ' ')}</p><p className="mt-0.5 text-[11px] text-neutral-500">{activity.institute?.name || activity.entityType} · {formatDate(activity.createdAt)}</p></div>)}</div>}</section>
    </div>
    <section className="rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm"><div className="mb-4 flex items-center justify-between"><div><h2 className="text-sm font-black">Incomplete listings</h2><p className="text-xs text-neutral-500">Profiles below the published-ready threshold.</p></div><button onClick={() => onSelect('listings', 'incomplete')} className="text-xs font-bold text-blue-700">Open listings</button></div>{incompleteListings.length === 0 ? <EmptyState title="No incomplete listings" detail="Every listing is ready for review." /> : <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{incompleteListings.slice(0, 6).map(listing => <button key={listing.id} onClick={() => onSelect('listings', 'incomplete')} className="flex items-center gap-3 rounded-xl bg-neutral-50 p-3 text-left hover:bg-neutral-100"><MapPinned className="h-4 w-4 text-neutral-400" /><span className="min-w-0 flex-1"><span className="block truncate text-xs font-bold">{listing.name}</span><span className="text-[11px] text-neutral-500">{listing.profileCompleteness ?? 0}% complete</span></span></button>)}</div>}</section>
  </div>;
}
