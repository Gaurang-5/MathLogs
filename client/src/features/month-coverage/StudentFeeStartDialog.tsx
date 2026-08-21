import { useMemo, useState } from 'react';
import { AlertTriangle, CalendarDays, Loader2, X } from 'lucide-react';
import { monthLabel } from './monthCoverageViewModel';

export type StudentFeeStartDialogProps = {
  student: { id: string; name: string; joinedAt: string };
  batch: { startDate: string; endDate: string };
  defaultMonth: string;
  onConfirm: (feeStartMonth: string) => Promise<void>;
  onClose: () => void;
};

function dateMonth(value: string): string {
  const date = new Date(value);
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
}

export function StudentFeeStartDialog({
  student,
  batch,
  defaultMonth,
  onConfirm,
  onClose,
}: StudentFeeStartDialogProps) {
  const [feeStartMonth, setFeeStartMonth] = useState(defaultMonth);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const batchStartMonth = useMemo(() => dateMonth(batch.startDate), [batch.startDate]);
  const batchEndMonth = useMemo(() => dateMonth(batch.endDate), [batch.endDate]);
  const joinedMonth = useMemo(() => dateMonth(student.joinedAt), [student.joinedAt]);
  const isBackdated = feeStartMonth < joinedMonth;

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setSubmitting(true);
    setError('');
    try {
      await onConfirm(feeStartMonth);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Unable to set the fee start month.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-end justify-center bg-black/45 p-0 backdrop-blur-sm sm:items-center sm:p-4" role="presentation">
      <form
        aria-label={`Set fee start for ${student.name}`}
        aria-modal="true"
        role="dialog"
        onSubmit={submit}
        className="w-full max-w-lg rounded-t-[28px] border border-black/5 bg-app-surface-opaque p-6 shadow-2xl sm:rounded-[28px] sm:p-8"
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.16em] text-app-text-tertiary">Student fee profile</p>
            <h2 className="mt-1 text-xl font-bold tracking-tight text-app-text">Set fee start for {student.name}</h2>
            <p className="mt-2 text-sm leading-6 text-app-text-secondary">
              We suggested {monthLabel(defaultMonth)}. You can edit it before confirming.
            </p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="rounded-xl p-2 text-app-text-tertiary hover:bg-black/5 hover:text-app-text">
            <X className="h-5 w-5" />
          </button>
        </div>

        <label className="mt-6 block">
          <span className="mb-2 flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-app-text-secondary">
            <CalendarDays className="h-4 w-4" /> Fee start month
          </span>
          <input
            type="month"
            min={batchStartMonth}
            max={batchEndMonth}
            required
            value={feeStartMonth}
            onChange={event => setFeeStartMonth(event.target.value)}
            className="w-full rounded-2xl border-2 border-transparent bg-neutral-50 px-4 py-3.5 font-semibold text-app-text outline-none transition-all focus:border-accent-primary focus:bg-white"
          />
        </label>

        <div className="mt-3 rounded-2xl bg-blue-50 px-4 py-3 text-sm text-blue-800">
          Fee progress will begin from <strong>{monthLabel(feeStartMonth)}</strong> and end with the batch.
        </div>

        {isBackdated && (
          <div className="mt-3 flex gap-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm leading-5 text-amber-800">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>This month is before the student joined. You can still confirm it if fees should be counted from then.</span>
          </div>
        )}

        {error && <p className="mt-3 rounded-xl bg-red-50 px-4 py-3 text-sm font-medium text-red-700">{error}</p>}

        <div className="mt-6 flex gap-3">
          <button type="button" onClick={onClose} className="flex-1 rounded-2xl border border-black/10 px-4 py-3.5 text-sm font-bold text-app-text hover:bg-black/5">
            Cancel
          </button>
          <button type="submit" disabled={submitting} className="flex flex-[1.4] items-center justify-center gap-2 rounded-2xl bg-black px-4 py-3.5 text-sm font-bold text-white hover:bg-neutral-800 disabled:opacity-60">
            {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
            Confirm fee start
          </button>
        </div>
      </form>
    </div>
  );
}
