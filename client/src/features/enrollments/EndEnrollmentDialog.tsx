import { useState } from 'react';
import toast from 'react-hot-toast';
import { endEnrollment } from './api';

export function EndEnrollmentDialog({ batchId, batchName, enrollmentId, studentName, onClose, onEnded }: {
  batchId: string; batchName: string; enrollmentId: string; studentName: string;
  onClose: () => void; onEnded: () => void | Promise<void>;
}) {
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);
  return <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 p-4">
    <section role="dialog" aria-label="Remove student from batch" className="w-full max-w-md rounded-3xl bg-white p-6">
      <h2 className="text-xl font-bold">Remove {studentName} from {batchName}?</h2>
      <p className="mt-2 text-sm text-app-text-secondary">This ends only this batch enrollment. Other active batches, student ID, marks, payments, and history remain unchanged.</p>
      <label className="mt-5 block"><span className="text-xs font-bold uppercase">Reason (required)</span><textarea value={reason} onChange={event => setReason(event.target.value)} className="mt-2 min-h-24 w-full rounded-xl border p-3" /></label>
      <div className="mt-5 flex gap-3"><button onClick={onClose} className="flex-1 rounded-xl border px-4 py-3">Cancel</button><button disabled={reason.trim().length < 3 || saving} onClick={async () => {
        setSaving(true); try { await endEnrollment(batchId, enrollmentId, reason); await onEnded(); toast.success(`Removed from ${batchName}`); onClose(); } catch (error) { toast.error(error instanceof Error ? error.message : 'Could not remove student'); } finally { setSaving(false); }
      }} className="flex-1 rounded-xl bg-red-600 px-4 py-3 font-semibold text-white disabled:opacity-50">Remove from batch</button></div>
    </section>
  </div>;
}
