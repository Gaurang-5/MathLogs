import { Clock3, MessageCircleMore, Search } from 'lucide-react';
import type { SupportTicket } from './types';

const priorityStyle: Record<string, string> = {
  URGENT: 'bg-rose-100 text-rose-800', HIGH: 'bg-amber-100 text-amber-900', NORMAL: 'bg-stone-100 text-stone-700', LOW: 'bg-sky-50 text-sky-700'
};

export function SupportQueue({ tickets, selectedId, filters, onFilters, onSelect }: {
  tickets: SupportTicket[];
  selectedId?: string;
  filters: { q: string; status: string; priority: string };
  onFilters: (filters: { q: string; status: string; priority: string }) => void;
  onSelect: (id: string) => void;
}) {
  return <section className="overflow-hidden rounded-[26px] border border-stone-200 bg-[#fffdf9] shadow-sm">
    <div className="border-b border-stone-200 p-4">
      <label className="flex items-center gap-2 rounded-xl border border-stone-200 bg-white px-3 py-2.5"><Search className="h-4 w-4 text-stone-400" /><input value={filters.q} onChange={event => onFilters({ ...filters, q: event.target.value })} placeholder="Search tickets or institutes" className="min-w-0 flex-1 bg-transparent text-sm outline-none" /></label>
      <div className="mt-3 grid grid-cols-2 gap-2"><select value={filters.status} onChange={event => onFilters({ ...filters, status: event.target.value })} className="rounded-xl border border-stone-200 bg-white px-3 py-2 text-xs font-bold"><option value="">All statuses</option><option>NEW</option><option>IN_PROGRESS</option><option>WAITING_ON_INSTITUTE</option><option>RESOLVED</option><option>CLOSED</option></select><select value={filters.priority} onChange={event => onFilters({ ...filters, priority: event.target.value })} className="rounded-xl border border-stone-200 bg-white px-3 py-2 text-xs font-bold"><option value="">All priorities</option><option>URGENT</option><option>HIGH</option><option>NORMAL</option><option>LOW</option></select></div>
    </div>
    <div className="max-h-[calc(100vh-250px)] overflow-y-auto">{tickets.map(ticket => <button key={ticket.id} onClick={() => onSelect(ticket.id)} className={`w-full border-b border-stone-100 p-4 text-left transition last:border-0 ${selectedId === ticket.id ? 'bg-amber-50' : 'hover:bg-stone-50'}`}>
      <div className="flex items-center justify-between gap-2"><span className="text-[10px] font-black uppercase tracking-wider text-stone-400">{ticket.reference}</span><span className={`rounded-full px-2 py-1 text-[9px] font-black ${priorityStyle[ticket.priority]}`}>{ticket.priority}</span></div>
      <p className="mt-2 line-clamp-2 text-sm font-black text-stone-900">{ticket.subject}</p><p className="mt-1 truncate text-xs text-stone-500">{ticket.institute.name}</p>
      <div className="mt-3 flex items-center justify-between text-[10px] font-bold text-stone-400"><span className="inline-flex items-center gap-1"><MessageCircleMore className="h-3 w-3" />{ticket.status.replace(/_/g, ' ')}</span><span className="inline-flex items-center gap-1"><Clock3 className="h-3 w-3" />{new Date(ticket.updatedAt).toLocaleDateString()}</span></div>
    </button>)}{tickets.length === 0 ? <p className="p-8 text-center text-sm text-stone-500">No tickets match this view.</p> : null}</div>
  </section>;
}
