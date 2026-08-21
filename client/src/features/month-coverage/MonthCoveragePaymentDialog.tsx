import { useEffect, useRef, useState } from 'react';
import { AlertTriangle, CalendarDays, Camera, IndianRupee, Loader2, X } from 'lucide-react';
import {
  createMonthCoveragePayment,
  createPaymentAttemptId,
  previewMonthCoveragePayment,
  scanMonthCoverageReceipt,
  updateMonthCoveragePayment,
} from './api';
import { availableDurations, formatCoverageRange, listMonths, overlapMessage } from './monthCoverageViewModel';
import type {
  MonthCoverageDuration,
  MonthCoveragePaymentMethod,
  MonthCoveragePreview,
  MonthCoverageStudentSummary,
} from './types';

type EditablePayment = {
  id: string;
  amountRupees: number;
  paymentDate: string;
  duration: MonthCoverageDuration;
  coverageMonths: string[];
  paymentMethod?: MonthCoveragePaymentMethod;
  note?: string | null;
};

type MonthCoveragePaymentDialogProps = {
  student: MonthCoverageStudentSummary;
  payment?: EditablePayment;
  onClose: () => void;
  onSaved: () => void;
};

function errorCode(reason: unknown): string {
  return reason instanceof Error ? reason.message : 'Unable to preview this payment.';
}

function friendlyError(code: string): string {
  if (code === 'INSUFFICIENT_REMAINING_MONTHS') return 'This duration is longer than the remaining fee months.';
  if (code === 'COVERAGE_START_OUT_OF_RANGE') return 'Choose a month within this student’s fee period.';
  if (code === 'PROFILE_NOT_ACTIVE') return 'Set this student’s fee start month before recording payment.';
  return code.replace(/_/g, ' ').toLowerCase().replace(/^./, value => value.toUpperCase());
}

export function MonthCoveragePaymentDialog({ student, payment, onClose, onSaved }: MonthCoveragePaymentDialogProps) {
  const [amount, setAmount] = useState(payment ? String(payment.amountRupees) : '');
  const [duration, setDuration] = useState<MonthCoverageDuration>(payment?.duration ?? 'MONTHLY');
  const [requestedStartMonth, setRequestedStartMonth] = useState(payment?.coverageMonths[0] ?? student.nextPendingMonth ?? student.feeStartMonth ?? '');
  const [paymentDate, setPaymentDate] = useState(payment?.paymentDate.slice(0, 10) ?? new Date().toISOString().slice(0, 10));
  const [paymentMethod, setPaymentMethod] = useState<MonthCoveragePaymentMethod>(payment?.paymentMethod ?? 'CASH');
  const [note, setNote] = useState(payment?.note ?? '');
  const [preview, setPreview] = useState<MonthCoveragePreview | null>(null);
  const [previewError, setPreviewError] = useState('');
  const [gapAcknowledged, setGapAcknowledged] = useState(false);
  const [previewing, setPreviewing] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [attemptId] = useState(createPaymentAttemptId);
  const previewSequence = useRef(0);

  const runPreview = async (
    nextDuration = duration,
    nextStart = requestedStartMonth,
  ) => {
    const sequence = ++previewSequence.current;
    setPreviewing(true);
    setPreviewError('');
    setPreview(null);
    setGapAcknowledged(false);
    const input = {
      studentId: student.studentId,
      duration: nextDuration,
      requestedStartMonth: nextStart || null,
      allowGap: false,
    };
    try {
      const result = await previewMonthCoveragePayment(input);
      if (sequence === previewSequence.current) setPreview(result);
    } catch (reason) {
      const code = errorCode(reason);
      if (code === 'COVERAGE_GAP_REQUIRES_CONFIRMATION') {
        try {
          const result = await previewMonthCoveragePayment({ ...input, allowGap: true });
          if (sequence === previewSequence.current) setPreview(result);
        } catch (gapReason) {
          if (sequence === previewSequence.current) setPreviewError(friendlyError(errorCode(gapReason)));
        }
      } else if (code === 'MONTH_ALREADY_COVERED') {
        if (sequence === previewSequence.current) setPreviewError(overlapMessage(nextStart || student.nextPendingMonth || student.feeStartMonth!));
      } else if (sequence === previewSequence.current) {
        setPreviewError(friendlyError(code));
      }
    } finally {
      if (sequence === previewSequence.current) setPreviewing(false);
    }
  };

  useEffect(() => {
    void runPreview();
    // Initial preview belongs to this dialog instance; later previews run in input handlers.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!preview || previewError || !amount || (preview.gapWarning && !gapAcknowledged)) return;
    setSubmitting(true);
    const input = {
      studentId: student.studentId,
      amount: Number(amount),
      paymentDate: `${paymentDate}T12:00:00.000Z`,
      paymentMethod,
      duration,
      requestedStartMonth: requestedStartMonth || null,
      allowGap: Boolean(preview.gapWarning && gapAcknowledged),
      note: note.trim() || undefined,
    };
    try {
      if (payment) await updateMonthCoveragePayment(payment.id, input);
      else await createMonthCoveragePayment(input, attemptId);
      onSaved();
    } catch (reason) {
      const code = errorCode(reason);
      setPreviewError(code === 'MONTH_ALREADY_COVERED'
        ? overlapMessage(requestedStartMonth || student.nextPendingMonth || student.feeStartMonth!)
        : friendlyError(code));
    } finally {
      setSubmitting(false);
    }
  };

  const scanReceipt = async (file?: File) => {
    if (!file) return;
    setScanning(true);
    try {
      const result = await scanMonthCoverageReceipt(file);
      if (result.amountPaid) setAmount(String(result.amountPaid));
      if (result.date) setPaymentDate(result.date.slice(0, 10));
    } catch {
      setPreviewError('Receipt scanning failed. You can enter the payment manually.');
    } finally {
      setScanning(false);
    }
  };

  const durations = availableDurations(student.pendingMonths);
  const hasUnconfirmedGap = Boolean(preview?.gapWarning && !gapAcknowledged);

  return (
    <div className="fixed inset-0 z-[110] flex items-end justify-center bg-black/45 backdrop-blur-sm sm:items-center sm:p-4">
      <form role="dialog" aria-modal="true" aria-label={`${payment ? 'Edit' : 'Record'} payment for ${student.name}`} onSubmit={submit} className="max-h-[94vh] w-full max-w-xl overflow-y-auto rounded-t-[30px] bg-white p-5 shadow-2xl sm:rounded-[30px] sm:p-7">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.16em] text-app-text-tertiary">{student.batchName}</p>
            <h2 className="mt-1 text-xl font-black text-app-text">{payment ? 'Edit payment' : 'Record fee received'} · {student.name}</h2>
            <p className="mt-1 text-sm text-app-text-secondary">Choose how many months this payment covers.</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="rounded-xl p-2 text-app-text-tertiary hover:bg-neutral-100"><X className="h-5 w-5" /></button>
        </div>

        <div className="mt-6 grid grid-cols-2 gap-2 sm:grid-cols-4">
          {durations.map(option => (
            <button
              key={option.value}
              type="button"
              disabled={option.disabled}
              aria-pressed={duration === option.value}
              onClick={() => { setDuration(option.value); void runPreview(option.value, requestedStartMonth); }}
              className={`rounded-xl border px-2 py-3 text-xs font-black transition-all disabled:cursor-not-allowed disabled:opacity-35 ${duration === option.value ? 'border-black bg-black text-white' : 'border-black/10 bg-neutral-50 text-app-text hover:bg-neutral-100'}`}
            >
              {option.label}
            </button>
          ))}
        </div>

        <div className="mt-5 grid gap-4 sm:grid-cols-2">
          <label className="space-y-2">
            <span className="text-xs font-bold uppercase tracking-wider text-app-text-secondary">Amount received</span>
            <span className="relative block">
              <IndianRupee className="absolute left-3 top-3.5 h-4 w-4 text-app-text-tertiary" />
              <input type="number" inputMode="decimal" min="0.01" step="0.01" required value={amount} onChange={event => setAmount(event.target.value)} className="w-full rounded-xl border border-black/10 bg-neutral-50 py-3 pl-9 pr-3 font-bold outline-none focus:border-black" placeholder="Enter amount" />
            </span>
          </label>
          <label className="space-y-2">
            <span className="text-xs font-bold uppercase tracking-wider text-app-text-secondary">Starting month</span>
            <input type="month" min={student.feeStartMonth ?? undefined} max={student.feeEndMonth ?? undefined} required value={requestedStartMonth} onChange={event => { const value = event.target.value; setRequestedStartMonth(value); void runPreview(duration, value); }} className="w-full rounded-xl border border-black/10 bg-neutral-50 px-3 py-3 font-bold outline-none focus:border-black" />
          </label>
          <label className="space-y-2">
            <span className="text-xs font-bold uppercase tracking-wider text-app-text-secondary">Payment date</span>
            <span className="relative block"><CalendarDays className="absolute left-3 top-3.5 h-4 w-4 text-app-text-tertiary" /><input type="date" required value={paymentDate} onChange={event => setPaymentDate(event.target.value)} className="w-full rounded-xl border border-black/10 bg-neutral-50 py-3 pl-9 pr-3 font-bold outline-none focus:border-black" /></span>
          </label>
          <label className="space-y-2">
            <span className="text-xs font-bold uppercase tracking-wider text-app-text-secondary">Payment method</span>
            <select value={paymentMethod} onChange={event => setPaymentMethod(event.target.value as MonthCoveragePaymentMethod)} className="w-full rounded-xl border border-black/10 bg-neutral-50 px-3 py-3 font-bold outline-none focus:border-black">
              <option value="CASH">Cash</option><option value="UPI">UPI</option><option value="BANK">Bank transfer</option><option value="CARD">Card</option><option value="OTHER">Other</option>
            </select>
          </label>
        </div>

        <label className="mt-4 block space-y-2">
          <span className="text-xs font-bold uppercase tracking-wider text-app-text-secondary">Note (optional)</span>
          <textarea value={note} onChange={event => setNote(event.target.value)} className="min-h-20 w-full rounded-xl border border-black/10 bg-neutral-50 px-3 py-3 text-sm outline-none focus:border-black" placeholder="Receipt number or payment note" />
        </label>

        <label className="mt-3 inline-flex cursor-pointer items-center gap-2 rounded-xl border border-black/10 px-3 py-2 text-xs font-bold text-app-text-secondary hover:bg-neutral-50">
          {scanning ? <Loader2 className="h-4 w-4 animate-spin" /> : <Camera className="h-4 w-4" />} Scan receipt
          <input type="file" accept="image/*" className="hidden" onChange={event => void scanReceipt(event.target.files?.[0])} />
        </label>

        <div className="mt-5 min-h-20 rounded-2xl border border-black/5 bg-neutral-50 p-4">
          {previewing ? <p className="flex items-center gap-2 text-sm font-bold text-app-text-secondary"><Loader2 className="h-4 w-4 animate-spin" /> Checking months…</p> : preview ? (
            <>
              <p className="text-xs font-black uppercase tracking-wider text-emerald-700">This payment covers</p>
              <p className="mt-1 text-lg font-black text-app-text">{formatCoverageRange(preview.coverageMonths)}</p>
              <p className="mt-1 text-xs text-app-text-secondary">{preview.remainingMonthsAfterPayment} month(s) will remain pending.</p>
              {preview.gapWarning && (
                <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
                  <p className="flex gap-2 font-bold"><AlertTriangle className="h-4 w-4 shrink-0" /> This skips {listMonths(preview.gapWarning.skippedMonths)}.</p>
                  {!gapAcknowledged && <button type="button" onClick={() => setGapAcknowledged(true)} className="mt-2 rounded-lg bg-amber-900 px-3 py-2 text-xs font-black text-white">I understand, continue</button>}
                </div>
              )}
            </>
          ) : <p className="text-sm font-medium text-app-text-secondary">Choose valid payment details to preview covered months.</p>}
          {previewError && <p className="mt-2 text-sm font-bold text-red-600">{previewError}</p>}
        </div>

        <div className="mt-5 flex gap-3">
          <button type="button" onClick={onClose} className="flex-1 rounded-xl border border-black/10 px-4 py-3.5 text-sm font-black">Cancel</button>
          <button type="submit" disabled={!preview || Boolean(previewError) || hasUnconfirmedGap || !amount || submitting || previewing} className="flex-[1.4] rounded-xl bg-black px-4 py-3.5 text-sm font-black text-white disabled:cursor-not-allowed disabled:opacity-40">
            {submitting ? 'Saving…' : payment ? 'Save changes' : 'Confirm payment'}
          </button>
        </div>
      </form>
    </div>
  );
}
