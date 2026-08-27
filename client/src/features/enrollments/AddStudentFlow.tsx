import { useDeferredValue, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Search, X } from 'lucide-react';
import toast from 'react-hot-toast';
import { enrollExisting, previewEnrollment, resendEnrollmentNotification, searchEnrollmentCandidates, sendRegistrationInvite } from './api';
import { defaultEnrollmentFeeChoice, FeeApplicabilityStep } from './FeeApplicabilityStep';
import type { EnrollmentBatch, EnrollmentCandidate, EnrollmentFeeChoice, EnrollmentResult } from './types';

export function AddStudentFlow({ batch, onClose, onComplete }: {
  batch: EnrollmentBatch;
  onClose: () => void;
  onComplete: () => void | Promise<void>;
}) {
  const [query, setQuery] = useState('');
  const deferredQuery = useDeferredValue(query.trim());
  const [candidate, setCandidate] = useState<EnrollmentCandidate | null>(null);
  const [createNew, setCreateNew] = useState(false);
  const [whatsapp, setWhatsapp] = useState('');
  const [fee, setFee] = useState<EnrollmentFeeChoice>(() => defaultEnrollmentFeeChoice(batch));
  const [result, setResult] = useState<EnrollmentResult | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const startedAt = new Date().toISOString();
  const candidates = useQuery({
    queryKey: ['enrollment-candidates', batch.id, deferredQuery],
    queryFn: () => searchEnrollmentCandidates(batch.id, deferredQuery),
    enabled: deferredQuery.length >= 2 && !candidate && !createNew,
    staleTime: 15_000,
  });

  const confirm = async () => {
    setSubmitting(true);
    try {
      if (candidate) {
        await previewEnrollment(batch.id, candidate.studentId, startedAt, fee);
        const saved = await enrollExisting(batch.id, candidate.studentId, startedAt, fee);
        setResult(saved);
        if (saved.outcome !== 'ALREADY_ENROLLED') await onComplete();
      } else {
        await sendRegistrationInvite(batch.id, whatsapp, fee);
        toast.success('Registration link sent with the selected fee settings.');
        onClose();
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not add student');
    } finally {
      setSubmitting(false);
    }
  };

  return <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm">
    <section role="dialog" aria-label="Add student" className="max-h-[90vh] w-full max-w-xl overflow-y-auto rounded-[28px] bg-white p-6 shadow-2xl">
      <header className="mb-5 flex items-start justify-between">
        <div><h2 className="text-xl font-bold">Add student to {batch.name}</h2><p className="text-sm text-app-text-tertiary">Find an old profile first, or send a link for a new student.</p></div>
        <button aria-label="Close" onClick={onClose}><X className="h-5 w-5" /></button>
      </header>

      {result ? <div className="space-y-4">
        <div className="rounded-2xl bg-emerald-50 p-4 text-emerald-900">
          <strong>{result.outcome === 'ALREADY_ENROLLED' ? 'Already enrolled' : result.outcome === 'REENROLLED' ? 'Old profile re-enrolled' : 'Student enrolled'}</strong>
          <p className="mt-1 text-sm">Student ID, marks, payments, and profile history remain unchanged.</p>
          {result.notification ? <p className="mt-1 text-xs">WhatsApp: {result.notification.status.replaceAll('_', ' ').toLowerCase()}</p> : null}
        </div>
        {result.outcome === 'ALREADY_ENROLLED' ? <button className="w-full rounded-xl border px-4 py-3 font-semibold" onClick={async () => {
          await resendEnrollmentNotification(result.enrollmentId); toast.success('Notification queued again.');
        }}>Resend notification</button> : null}
        <button className="w-full rounded-xl bg-black px-4 py-3 font-semibold text-white" onClick={onClose}>Done</button>
      </div> : <div className="space-y-5">
        {!candidate && !createNew ? <>
          <label className="relative block"><Search className="absolute left-3 top-3.5 h-4 w-4 text-app-text-tertiary" />
            <input role="searchbox" value={query} onChange={event => setQuery(event.target.value)} placeholder="Student ID, name, parent or phone"
              className="w-full rounded-xl border border-black/10 py-3 pl-10 pr-4" autoFocus />
          </label>
          <div className="space-y-2">
            {candidates.data?.map(item => <CandidateCard key={item.studentId} candidate={item} onUse={() => { setCandidate(item); setWhatsapp(item.parentWhatsapp); }} />)}
            {deferredQuery.length >= 2 && !candidates.isFetching && candidates.data?.length === 0 ? <p className="text-sm text-app-text-tertiary">No matching old profile found.</p> : null}
          </div>
          <button className="w-full rounded-xl border border-black/10 px-4 py-3 font-semibold" onClick={() => setCreateNew(true)}>Create a separate student</button>
        </> : <>
          <div className="rounded-xl bg-neutral-50 p-4">
            {candidate ? <><strong>{candidate.name}</strong><p className="text-sm">{candidate.humanId || 'No ID'} · {candidate.parentWhatsapp}</p></> : <label className="block"><span className="text-xs font-bold uppercase">Student WhatsApp</span><input value={whatsapp} onChange={event => setWhatsapp(event.target.value.replace(/\D/g, '').slice(-10))} className="mt-2 w-full rounded-xl border px-4 py-3" placeholder="10-digit number" /></label>}
          </div>
          <FeeApplicabilityStep batch={batch} value={fee} onChange={setFee} />
          <p className="rounded-xl bg-blue-50 p-3 text-xs text-blue-900">Existing fees and payments will not be recreated. Only the choices above apply to this enrollment.</p>
          <div className="flex gap-3"><button className="flex-1 rounded-xl border px-4 py-3" onClick={() => { setCandidate(null); setCreateNew(false); }}>Back</button>
            <button disabled={submitting || (!candidate && whatsapp.length < 10)} className="flex-1 rounded-xl bg-black px-4 py-3 font-semibold text-white disabled:opacity-50" onClick={confirm}>{submitting ? 'Saving…' : candidate ? 'Use existing profile' : 'Send registration link'}</button></div>
        </>}
      </div>}
    </section>
  </div>;
}

function CandidateCard({ candidate, onUse }: { candidate: EnrollmentCandidate; onUse: () => void }) {
  return <article className="rounded-2xl border border-black/10 p-4">
    <div className="flex justify-between gap-3"><div><strong>{candidate.name}</strong><p className="text-sm">{candidate.humanId || 'No student ID'} · {candidate.parentWhatsapp}</p></div><button onClick={onUse} className="rounded-lg bg-black px-3 py-2 text-sm font-semibold text-white">Use existing profile</button></div>
    <p className="mt-2 text-xs text-app-text-tertiary">Current: {candidate.currentBatches.map(item => item.name).join(', ') || 'None'} · Previous: {candidate.previousBatches.map(item => item.name).join(', ') || 'None'} · Balance ₹{candidate.balance.toLocaleString('en-IN')}</p>
  </article>;
}
