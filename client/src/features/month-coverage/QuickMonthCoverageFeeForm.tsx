import { useEffect, useMemo, useState } from 'react';
import { IndianRupee, Loader2, Search, X } from 'lucide-react';
import { createMonthCoveragePayment, createPaymentAttemptId, previewMonthCoveragePayment } from './api';
import { formatCoverageRange } from './monthCoverageViewModel';
import type { MonthCoverageDuration, MonthCoveragePreview, MonthCoverageStudentSummary } from './types';

type QuickMonthCoverageFeeFormProps = {
  students: MonthCoverageStudentSummary[];
  onClose: () => void;
  onSaved: () => void;
};

const durations: Array<{ value: MonthCoverageDuration; label: string }> = [
  { value: 'MONTHLY', label: 'Monthly' },
  { value: 'QUARTERLY', label: 'Quarterly' },
  { value: 'HALF_YEARLY', label: 'Half-yearly' },
  { value: 'YEARLY', label: 'Yearly' },
];

function errorMessage(reason: unknown): string {
  const code = reason instanceof Error ? reason.message : 'Unable to preview this payment.';
  if (code === 'INSUFFICIENT_REMAINING_MONTHS') return 'This duration is longer than the remaining fee months.';
  return code.replace(/_/g, ' ').toLowerCase().replace(/^./, value => value.toUpperCase());
}

export function QuickMonthCoverageFeeForm({ students, onClose, onSaved }: QuickMonthCoverageFeeFormProps) {
  const [query, setQuery] = useState('');
  const [student, setStudent] = useState<MonthCoverageStudentSummary | null>(null);
  const [amount, setAmount] = useState('');
  const [duration, setDuration] = useState<MonthCoverageDuration>('MONTHLY');
  const [preview, setPreview] = useState<MonthCoveragePreview | null>(null);
  const [previewing, setPreviewing] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [attemptId] = useState(createPaymentAttemptId);

  const matches = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle || student) return [];
    return students.filter(candidate => [
      candidate.name,
      candidate.humanId ?? '',
      candidate.parentWhatsapp ?? '',
      candidate.batchName,
    ].some(value => value.toLowerCase().includes(needle))).slice(0, 8);
  }, [query, student, students]);

  useEffect(() => {
    if (!student) {
      setPreview(null);
      return;
    }
    let active = true;
    setPreviewing(true);
    setPreview(null);
    setError('');
    previewMonthCoveragePayment({
      studentId: student.studentId,
      duration,
      requestedStartMonth: null,
      allowGap: false,
    }).then(result => {
      if (active) setPreview(result);
    }).catch(reason => {
      if (active) setError(errorMessage(reason));
    }).finally(() => {
      if (active) setPreviewing(false);
    });
    return () => { active = false; };
  }, [duration, student]);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    const numericAmount = Number(amount);
    if (!student || !preview || numericAmount <= 0 || submitting) return;
    setSubmitting(true);
    setError('');
    try {
      const today = new Date().toISOString().slice(0, 10);
      await createMonthCoveragePayment({
        studentId: student.studentId,
        amount: numericAmount,
        paymentDate: `${today}T12:00:00.000Z`,
        paymentMethod: 'CASH',
        duration,
        requestedStartMonth: null,
        allowGap: false,
      }, attemptId);
      onSaved();
    } catch (reason) {
      setError(errorMessage(reason));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[110] flex items-end justify-center bg-black/45 backdrop-blur-sm sm:items-center sm:p-4">
      <form role="dialog" aria-modal="true" aria-label="Quick fee payment" onSubmit={submit} className="max-h-[94dvh] w-full max-w-md overflow-y-auto rounded-t-[28px] bg-white p-5 shadow-2xl sm:rounded-[28px] sm:p-6">
        <div className="flex items-start justify-between gap-4">
          <div><h2 className="text-xl font-black text-app-text">Quick fee</h2><p className="mt-1 text-sm text-app-text-secondary">Record received months in a few seconds.</p></div>
          <button type="button" aria-label="Close" onClick={onClose} className="rounded-xl p-2 text-app-text-tertiary hover:bg-neutral-100"><X className="h-5 w-5" /></button>
        </div>

        <div className="relative mt-5">
          <Search className="absolute left-3 top-3.5 h-4 w-4 text-app-text-tertiary" />
          <input autoFocus placeholder="Search student" value={query} onChange={event => { setQuery(event.target.value); setStudent(null); }} className="w-full rounded-xl border border-black/10 bg-neutral-50 py-3 pl-9 pr-3 font-semibold outline-none focus:border-black" />
          {matches.length > 0 && <div className="absolute z-10 mt-2 max-h-56 w-full overflow-y-auto rounded-xl border border-black/10 bg-white shadow-xl">
            {matches.map(candidate => <button key={candidate.studentId} type="button" onClick={() => { setStudent(candidate); setQuery(candidate.name); }} className="flex w-full items-center justify-between gap-3 border-b border-black/5 p-3 text-left last:border-0 hover:bg-neutral-50">
              <span><span className="block font-bold">{candidate.name}</span><span className="block text-xs text-app-text-secondary">{candidate.humanId || candidate.parentWhatsapp || candidate.batchName} · {candidate.batchName}</span></span>
              <span className="text-xs font-bold text-emerald-700">{candidate.pendingMonths} pending</span>
            </button>)}
          </div>}
        </div>

        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <label className="space-y-2"><span className="text-xs font-bold uppercase tracking-wider text-app-text-secondary">Amount received</span><span className="relative block"><IndianRupee className="absolute left-3 top-3.5 h-4 w-4 text-app-text-tertiary" /><input aria-label="Amount received" type="number" inputMode="decimal" min="0.01" step="0.01" value={amount} onChange={event => setAmount(event.target.value)} className="w-full rounded-xl border border-black/10 bg-neutral-50 py-3 pl-9 pr-3 font-bold outline-none focus:border-black" /></span></label>
          <label className="space-y-2"><span className="text-xs font-bold uppercase tracking-wider text-app-text-secondary">Fee duration</span><select aria-label="Fee duration" value={duration} onChange={event => setDuration(event.target.value as MonthCoverageDuration)} className="w-full rounded-xl border border-black/10 bg-neutral-50 px-3 py-3 font-bold outline-none focus:border-black">{durations.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>
        </div>

        <div className="mt-4 min-h-20 rounded-2xl border border-black/5 bg-neutral-50 p-4">
          {previewing ? <p className="flex items-center gap-2 text-sm font-bold text-app-text-secondary"><Loader2 className="h-4 w-4 animate-spin" /> Checking oldest pending month…</p> : preview ? <><p className="text-xs font-black uppercase tracking-wider text-emerald-700">This payment covers</p><p className="mt-1 text-lg font-black">{formatCoverageRange(preview.coverageMonths)}</p><p className="mt-1 text-xs text-app-text-secondary">{preview.remainingMonthsAfterPayment} month(s) will remain pending.</p></> : <p className="text-sm text-app-text-secondary">Select a student to preview covered months.</p>}
          {error && <p className="mt-2 text-sm font-bold text-red-600">{error}</p>}
        </div>

        <div className="mt-5 flex gap-3"><button type="button" onClick={onClose} className="flex-1 rounded-xl border border-black/10 px-4 py-3.5 text-sm font-black">Cancel</button><button type="submit" disabled={!student || !preview || Number(amount) <= 0 || previewing || submitting} className="flex-[1.4] rounded-xl bg-black px-4 py-3.5 text-sm font-black text-white disabled:opacity-40">{submitting ? 'Saving…' : 'Save payment'}</button></div>
      </form>
    </div>
  );
}
