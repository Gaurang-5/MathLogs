import { useDeferredValue, useEffect, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { TeacherButton } from '../../components/teacher-ui/TeacherButton';
import { Search, X } from 'lucide-react';
import toast from 'react-hot-toast';
import { enrollExisting, previewEnrollment, resendEnrollmentNotification, searchEnrollmentCandidates, sendRegistrationInvite } from './api';
import { defaultEnrollmentFeeChoice, FeeApplicabilityStep, isEnrollmentFeeChoiceReady } from './FeeApplicabilityStep';
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
  const [startedAt] = useState(() => new Date().toISOString());
  const dialogRef = useRef<HTMLElement>(null);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    dialogRef.current?.focus();
    const key = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !submitting) onClose();
      if (event.key === 'Tab') {
        const items = Array.from(dialogRef.current?.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), select:not(:disabled), [tabindex="0"]') || []);
        const first = items[0], last = items[items.length - 1];
        if (event.shiftKey && (document.activeElement === first || document.activeElement === dialogRef.current)) { event.preventDefault(); last?.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
      }
    };
    document.addEventListener('keydown', key);
    return () => { document.removeEventListener('keydown', key); previous?.focus(); };
  }, [onClose, submitting]);
  const candidates = useQuery({
    queryKey: ['enrollment-candidates', batch.id, deferredQuery],
    queryFn: () => searchEnrollmentCandidates(batch.id, deferredQuery),
    enabled: /^\d{10}$/.test(deferredQuery) && !candidate && !createNew,
    staleTime: 15_000,
  });

  const phoneReady = /^\d{10}$/.test(query);
  const lookupComplete = phoneReady && query === deferredQuery && candidates.isSuccess && !candidates.isFetching;

  const confirm = async () => {
    if (!isEnrollmentFeeChoiceReady(fee)) return;
    setSubmitting(true);
    try {
      if (candidate) {
        await previewEnrollment(batch.id, candidate.studentId, startedAt, fee);
        const saved = await enrollExisting(batch.id, candidate.studentId, startedAt, fee);
        setResult(saved);
        if (saved.outcome !== 'ALREADY_ENROLLED') await onComplete();
      } else {
        await sendRegistrationInvite(batch.id, whatsapp, fee);
        toast.success('Registration link queued with the confirmed fee plan.');
        onClose();
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not add student');
    } finally {
      setSubmitting(false);
    }
  };

  return <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm">
    <section ref={dialogRef} tabIndex={-1} aria-modal="true" role="dialog" aria-label="Add student" className="max-h-[90vh] w-full max-w-xl overflow-y-auto rounded-[28px] bg-white p-6 shadow-2xl">
      <header className="mb-5 flex items-start justify-between">
        <div><h2 className="text-xl font-bold">Add student to {batch.name}</h2><p className="text-sm text-app-text-tertiary">Enter the student’s WhatsApp number to check for an existing profile.</p></div>
        <TeacherButton variant="quiet" iconOnlyLabel="Close" disabled={submitting} onClick={onClose} icon={<X className="h-5 w-5" />} />
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
            <input role="searchbox" aria-label="Student WhatsApp number" type="tel" inputMode="numeric" value={query} onChange={event => setQuery(event.target.value.replace(/\D/g, '').replace(/^91(?=\d{10}$)/, '').slice(0, 10))} placeholder="10-digit WhatsApp number"
              className="w-full rounded-xl border border-black/10 py-3 pl-10 pr-4" autoFocus />
          </label>
          {!phoneReady ? <p className="text-sm text-app-text-secondary">Enter a 10-digit number to continue.</p> : null}
          {phoneReady && (query !== deferredQuery || candidates.isFetching) ? <p role="status" className="text-sm text-app-text-secondary">Checking existing profiles…</p> : null}
          {phoneReady && query === deferredQuery && candidates.isError ? <div role="alert" className="space-y-2"><p>Could not check existing profiles. Please retry before creating a student.</p><TeacherButton variant="secondary" onClick={() => void candidates.refetch()}>Retry lookup</TeacherButton></div> : null}
          {lookupComplete ? <>
            <div className="space-y-2">
              {candidates.data.map(item => <CandidateCard key={item.studentId} candidate={item} onUse={() => { setCandidate(item); setWhatsapp(item.parentWhatsapp); }} />)}
              {candidates.data.length === 0 ? <p role="status" className="text-sm text-app-text-secondary">No existing profile found for this number.</p> : <p className="text-sm text-app-text-secondary">Use an existing profile to keep its history. Create a separate student only if this number belongs to another student too.</p>}
            </div>
            <TeacherButton variant="secondary" className="w-full" onClick={() => { setWhatsapp(query); setCreateNew(true); }}>{candidates.data.length ? 'Create a separate student' : 'Create new student'}</TeacherButton>
          </> : null}
        </> : <>
          <div className="rounded-xl bg-neutral-50 p-4">
            {candidate ? <><strong>{candidate.name}</strong><p className="text-sm">{candidate.humanId || 'No ID'} · {candidate.parentWhatsapp}</p></> : <label className="block"><span className="text-xs font-bold uppercase">Student WhatsApp</span><input aria-label="Student WhatsApp" type="tel" inputMode="numeric" value={whatsapp} readOnly className="mt-2 w-full rounded-xl border px-4 py-3" placeholder="10-digit number" /></label>}
          </div>
          <FeeApplicabilityStep batch={batch} value={fee} onChange={setFee} />
          <p className="rounded-xl border border-app-border bg-app-surface-opaque p-3 text-xs text-app-text-secondary">Review the confirmed fee total before continuing. Existing payments and previously assigned fees remain unchanged.</p>
          <div className="flex gap-3"><TeacherButton variant="secondary" className="flex-1" onClick={() => { setCandidate(null); setCreateNew(false); }}>Back</TeacherButton>
            <TeacherButton disabled={submitting || !isEnrollmentFeeChoiceReady(fee) || (!candidate && whatsapp.length < 10)} className="flex-1" onClick={confirm}>{submitting ? 'Saving…' : candidate ? 'Use existing profile' : 'Confirm fees and send link'}</TeacherButton></div>
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
