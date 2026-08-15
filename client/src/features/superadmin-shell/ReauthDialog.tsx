import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from 'react';
import { KeyRound, Loader2, ShieldCheck, X } from 'lucide-react';
import { superAdminShellApi } from './api';
import type { SuperAdminActionClass } from './types';

type PendingRequest = {
  actionClass: SuperAdminActionClass;
  challengeId: string;
  destinationMasked: string;
  deliveryChannel: 'EMAIL' | 'WHATSAPP';
};

type ReauthApi = { request: (actionClass: SuperAdminActionClass) => Promise<string> };
const ReauthContext = createContext<ReauthApi | null>(null);

export function useSuperAdminReauth(): ReauthApi {
  const value = useContext(ReauthContext);
  if (!value) throw new Error('useSuperAdminReauth must be used inside SuperAdminReauthProvider');
  return value;
}

export function SuperAdminReauthProvider({ children }: { children: ReactNode }) {
  const [pending, setPending] = useState<PendingRequest | null>(null);
  const [otp, setOtp] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const resolver = useRef<{ resolve: (value: string) => void; reject: (reason: Error) => void } | null>(null);

  const close = useCallback((reason = 'Verification cancelled') => {
    resolver.current?.reject(new Error(reason));
    resolver.current = null;
    setPending(null);
    setOtp('');
    setError('');
  }, []);

  const request = useCallback(async (actionClass: SuperAdminActionClass) => {
    if (resolver.current) throw new Error('Another verification is already in progress');
    const challenge = await superAdminShellApi.sendReauth(actionClass);
    setPending({ actionClass, ...challenge });
    return new Promise<string>((resolve, reject) => { resolver.current = { resolve, reject }; });
  }, []);

  const verify = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!pending || !/^\d{6}$/.test(otp)) {
      setError('Enter the six-digit code.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      const result = await superAdminShellApi.verifyReauth(pending.challengeId, otp);
      resolver.current?.resolve(result.challengeId);
      resolver.current = null;
      setPending(null);
      setOtp('');
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Verification failed');
    } finally {
      setBusy(false);
    }
  };

  const api = useMemo(() => ({ request }), [request]);
  return <ReauthContext.Provider value={api}>
    {children}
    {pending ? <div className="fixed inset-0 z-[100] grid place-items-center bg-stone-950/45 p-4 backdrop-blur-sm" role="dialog" aria-modal="true" aria-label="Confirm sensitive action">
      <div className="w-full max-w-md overflow-hidden rounded-[28px] border border-stone-200 bg-[#fffdf9] shadow-2xl">
        <div className="flex items-start gap-4 border-b border-stone-200 p-6">
          <div className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-amber-100 text-amber-900"><ShieldCheck className="h-5 w-5" /></div>
          <div className="min-w-0 flex-1"><p className="text-xs font-bold uppercase tracking-[0.16em] text-stone-400">Fresh verification</p><h2 className="mt-1 text-xl font-black text-stone-950">Confirm this sensitive action</h2></div>
          <button onClick={() => close()} className="rounded-xl p-2 text-stone-400 hover:bg-stone-100" aria-label="Close verification"><X className="h-4 w-4" /></button>
        </div>
        <form onSubmit={verify} className="space-y-5 p-6">
          <p className="text-sm leading-6 text-stone-600">A code was sent by {pending.deliveryChannel.toLowerCase()} to <strong className="text-stone-900">{pending.destinationMasked}</strong>. It can approve only this action.</p>
          <label className="block"><span className="mb-2 block text-xs font-bold uppercase tracking-wider text-stone-500">Verification code</span><div className="flex items-center gap-3 rounded-2xl border border-stone-300 bg-white px-4 py-3 focus-within:border-amber-500 focus-within:ring-4 focus-within:ring-amber-100"><KeyRound className="h-4 w-4 text-stone-400" /><input autoFocus inputMode="numeric" autoComplete="one-time-code" value={otp} onChange={event => setOtp(event.target.value.replace(/\D/g, '').slice(0, 6))} className="w-full bg-transparent text-lg font-black tracking-[0.35em] outline-none" placeholder="000000" /></div></label>
          {error ? <p className="rounded-xl bg-rose-50 px-3 py-2 text-sm font-semibold text-rose-700">{error}</p> : null}
          <button disabled={busy || otp.length !== 6} className="flex w-full items-center justify-center gap-2 rounded-2xl bg-stone-950 px-4 py-3.5 text-sm font-black text-white disabled:opacity-50">{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />}Verify and continue</button>
        </form>
      </div>
    </div> : null}
  </ReauthContext.Provider>;
}
