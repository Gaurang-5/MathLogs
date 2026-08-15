import { useEffect, useState } from 'react';
import { ShieldCheck, X } from 'lucide-react';
import { apiRequest } from '../../utils/api';
import { clearSupportSession, getSupportSession, type ActiveSupportSession } from './supportSession';

export function SupportSessionBanner() {
  const [session, setSession] = useState<ActiveSupportSession | null>(() => getSupportSession()); const [now, setNow] = useState(Date.now()); const [busy, setBusy] = useState(false);
  useEffect(() => { const sync = () => setSession(getSupportSession()); window.addEventListener('support-session-change', sync); const timer = window.setInterval(() => setNow(Date.now()), 1000); return () => { window.removeEventListener('support-session-change', sync); window.clearInterval(timer); }; }, []);
  if (!session) return null; const remaining = Math.max(0, new Date(session.expiresAt).getTime() - now); const minutes = Math.floor(remaining / 60_000); const seconds = Math.floor((remaining % 60_000) / 1000);
  if (remaining === 0) { clearSupportSession(); return null; }
  const end = async () => { setBusy(true); try { const normalToken = localStorage.getItem('token') || ''; await apiRequest(`/super-admin/support-sessions/${session.sessionId}`, 'DELETE', { reason: 'Support assistance explicitly ended by Superadmin' }, { headers: { Authorization: `Bearer ${normalToken}` } }); } catch { /* Session may already be expired; local cleanup is still correct. */ } finally { clearSupportSession(); window.location.assign(`/super-admin/institutes/${session.instituteId}/support`); } };
  return <div className="fixed inset-x-0 top-0 z-[70] flex flex-col gap-3 bg-amber-300 px-4 py-3 text-stone-950 shadow-md sm:flex-row sm:items-center sm:justify-between"><div className="flex items-start gap-3"><ShieldCheck className="mt-0.5 h-5 w-5 shrink-0" /><div><p className="text-sm font-black">Support mode · {session.instituteName}</p><p className="mt-0.5 text-xs font-semibold opacity-75">{session.ticketReference ? `${session.ticketReference} · ` : ''}{session.reason} · expires in {minutes}:{String(seconds).padStart(2, '0')}</p></div></div><button onClick={() => void end()} disabled={busy} className="inline-flex items-center justify-center gap-2 rounded-xl bg-stone-950 px-3 py-2 text-xs font-black text-white disabled:opacity-50"><X className="h-3.5 w-3.5" />End session</button></div>;
}
