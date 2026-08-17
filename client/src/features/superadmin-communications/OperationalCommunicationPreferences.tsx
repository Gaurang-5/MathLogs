import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { instituteCommunicationApi, type CommunicationPreference } from './api';

export function OperationalCommunicationPreferences() {
  const [preference, setPreference] = useState<CommunicationPreference | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    instituteCommunicationApi.get()
      .then(value => { if (active) setPreference(value); })
      .catch(() => { if (active) setError('Unable to load communication preferences'); });
    return () => { active = false; };
  }, []);

  const save = async (next: { emailOperational: boolean; whatsappOperational: boolean }) => {
    setSaving(true);
    setError('');
    try {
      setPreference(await instituteCommunicationApi.update(next));
      toast.success('Communication preferences updated');
    } catch {
      setError('Unable to save communication preferences');
    } finally {
      setSaving(false);
    }
  };

  return <section className="mb-8 flex flex-col gap-4 rounded-[22px] border border-stone-200 bg-white p-5 shadow-sm sm:flex-row sm:items-center sm:justify-between">
    <div>
      <p className="text-sm font-black">Operational communication consent</p>
      <p className="mt-1 text-xs leading-5 text-stone-500">Choose whether MathLogs may send necessary service, billing, plan, and account notices. Promotional messages are not included.</p>
      {error ? <p role="alert" className="mt-2 text-xs font-semibold text-rose-700">{error}</p> : null}
    </div>
    {preference ? <div className="flex flex-wrap gap-3">
      <label className="flex items-center gap-2 rounded-xl bg-stone-100 px-3 py-2 text-xs font-bold">
        <input type="checkbox" disabled={saving} checked={preference.emailOperational} onChange={event => void save({ emailOperational: event.target.checked, whatsappOperational: preference.whatsappOperational })} />
        Email
      </label>
      <label className="flex items-center gap-2 rounded-xl bg-stone-100 px-3 py-2 text-xs font-bold">
        <input type="checkbox" disabled={saving} checked={preference.whatsappOperational} onChange={event => void save({ emailOperational: preference.emailOperational, whatsappOperational: event.target.checked })} />
        WhatsApp
      </label>
    </div> : <div className="h-9 w-44 animate-pulse rounded-xl bg-stone-100" aria-hidden="true" />}
  </section>;
}
