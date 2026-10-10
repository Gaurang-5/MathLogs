import { useState, useEffect, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { TeacherButton } from '../../components/teacher-ui/TeacherButton';
import toast from 'react-hot-toast';
import { endEnrollment } from './api';

export function EndEnrollmentDialog({ batchId, batchName, enrollmentId, studentName, onClose, onEnded }: {
  batchId: string; batchName: string; enrollmentId: string; studentName: string;
  onClose: () => void; onEnded: () => void | Promise<void>;
}) {
  const queryClient = useQueryClient();
  const [idempotencyKey] = useState(() => crypto.randomUUID());
  const dialogRef = useRef<HTMLElement>(null);
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    dialogRef.current?.querySelector('textarea')?.focus();
    return () => previous?.focus();
  }, []);
  return <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 p-4">
    <section ref={dialogRef} aria-modal="true" onKeyDown={event => { if (event.key === 'Escape' && !saving) onClose(); }} role="dialog" aria-label="Remove student from batch" className="w-full max-w-md rounded-3xl bg-app-surface-opaque p-6 text-app-text">
      <h2 className="text-xl font-bold">Remove {studentName} from {batchName}?</h2>
      <p className="mt-2 text-sm text-app-text-secondary">This ends only this batch enrollment. Other active batches, student ID, marks, payments, and history remain unchanged.</p>
      <label className="mt-5 block"><span className="text-xs font-bold uppercase">Reason (required)</span><textarea value={reason} onChange={event => setReason(event.target.value)} className="mt-2 min-h-24 w-full rounded-xl border p-3" /></label>
      <div className="mt-5 flex gap-3"><TeacherButton disabled={saving} variant="secondary" onClick={onClose} className="flex-1">Cancel</TeacherButton><TeacherButton variant="destructive" disabled={!enrollmentId || reason.trim().length < 3 || saving} onClick={async () => {
        setSaving(true);
        try {
          await endEnrollment(batchId, enrollmentId, reason, idempotencyKey);
          toast.success(`Removed from ${batchName}`);
          void queryClient.invalidateQueries({ queryKey: ['studentProfile'] });
          try { await onEnded(); } catch { toast.error('Student removed. Refresh the batch to update the list.'); }
          onClose();
        } catch (error) { toast.error(error instanceof Error ? error.message : 'Could not remove student'); } finally { setSaving(false); }
      }} className="flex-1">{saving ? 'Removing…' : 'Remove from batch'}</TeacherButton></div>
    </section>
  </div>;
}
