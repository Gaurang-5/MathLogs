import { useCallback, useEffect, useState } from 'react';
import { Headphones, RefreshCw } from 'lucide-react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { superAdminSupportApi } from '../../features/superadmin-support/api';
import { SupportQueue } from '../../features/superadmin-support/SupportQueue';
import { TicketWorkspace } from '../../features/superadmin-support/TicketWorkspace';
import type { SupportTicket } from '../../features/superadmin-support/types';

export default function SuperAdminSupport() {
  const { id } = useParams();
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();
  const [tickets, setTickets] = useState<SupportTicket[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const instituteId = params.get('instituteId') || '';
  const filters = { q: params.get('q') || '', status: params.get('status') || '', priority: params.get('priority') || '' };
  const load = useCallback(async () => { setLoading(true); setError(''); try { setTickets(await superAdminSupportApi.tickets({ ...filters, instituteId })); } catch (reason) { setError(reason instanceof Error ? reason.message : 'Unable to load support queue'); } finally { setLoading(false); } }, [filters.q, filters.status, filters.priority, instituteId]);
  useEffect(() => { const timer = window.setTimeout(() => void load(), 180); return () => window.clearTimeout(timer); }, [load]);
  const updateFilters = (next: typeof filters) => { const result = new URLSearchParams(); Object.entries(next).forEach(([key, value]) => { if (value) result.set(key, value); }); if (instituteId) result.set('instituteId', instituteId); setParams(result, { replace: true }); };
  return <div className="mx-auto max-w-[1600px] space-y-5"><header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between"><div><div className="flex items-center gap-2 text-xs font-black uppercase tracking-[0.18em] text-amber-700"><Headphones className="h-4 w-4" />Serve</div><h1 className="mt-2 text-3xl font-black tracking-tight">Support operations</h1><p className="mt-2 max-w-2xl text-sm text-stone-600">One queue for institute requests, internal context, explicit resolution states, and time-limited audited assistance.</p></div><button onClick={() => void load()} className="inline-flex items-center gap-2 self-start rounded-xl border border-stone-200 bg-white px-4 py-2.5 text-sm font-black"><RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />Refresh</button></header>{error ? <p className="rounded-xl bg-rose-50 p-4 text-sm font-semibold text-rose-700">{error}</p> : null}<div className="grid gap-5 lg:grid-cols-[360px_minmax(0,1fr)]"><SupportQueue tickets={tickets} selectedId={id} filters={filters} onFilters={updateFilters} onSelect={ticketId => navigate(`/super-admin/support/tickets/${ticketId}${params.size ? `?${params}` : ''}`)} /><TicketWorkspace ticketId={id} onUpdated={() => void load()} /></div></div>;
}
