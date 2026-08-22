import { useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertCircle, CalendarDays, Download, History, IndianRupee, Loader2, Mail, Plus, Search, X } from 'lucide-react';
import toast from 'react-hot-toast';
import {
  loadMonthCoverageSummary,
  monthCoverageKeys,
  monthCoverageReportUrl,
  previewVoidPayment,
  sendMonthCoverageReminders,
  voidPayment,
} from './api';
import { formatCoverageRange, listMonths, monthStatusCopy } from './monthCoverageViewModel';
import type { MonthCoveragePaymentSummary, MonthCoverageStudentSummary } from './types';
import { MonthCoveragePaymentDialog } from './MonthCoveragePaymentDialog';

type VoidPreview = { paymentId: string; amountRupees: number; reopenedMonths: string[] };

export function MonthCoverageFeesView() {
  const queryClient = useQueryClient();
  const [batchId, setBatchId] = useState('');
  const [profileStatus, setProfileStatus] = useState('');
  const [search, setSearch] = useState('');
  const [view, setView] = useState<'students' | 'payments'>('students');
  const [paymentStudent, setPaymentStudent] = useState<MonthCoverageStudentSummary | null>(null);
  const [voiding, setVoiding] = useState<MonthCoveragePaymentSummary | null>(null);
  const [voidPreview, setVoidPreview] = useState<VoidPreview | null>(null);
  const [voidReason, setVoidReason] = useState('');
  const [busy, setBusy] = useState(false);
  const filters = { batchId: batchId || undefined, status: profileStatus || undefined };

  const { data, isLoading, error } = useQuery({
    queryKey: monthCoverageKeys.summary(filters),
    queryFn: () => loadMonthCoverageSummary(filters),
  });

  const batches = useMemo(() => {
    const map = new Map<string, string>();
    for (const student of data?.students ?? []) map.set(student.batchId, student.batchName);
    return [...map.entries()].sort((left, right) => left[1].localeCompare(right[1]));
  }, [data?.students]);

  const students = useMemo(() => (data?.students ?? []).filter(student => {
    const term = search.trim().toLowerCase();
    return !term || student.name.toLowerCase().includes(term) || student.batchName.toLowerCase().includes(term);
  }), [data?.students, search]);

  const payments = useMemo(() => (data?.recentPayments ?? []).filter(payment => {
    const term = search.trim().toLowerCase();
    return !term || payment.studentName.toLowerCase().includes(term) || payment.batchName.toLowerCase().includes(term);
  }), [data?.recentPayments, search]);

  const refresh = async () => {
    await queryClient.invalidateQueries({ queryKey: monthCoverageKeys.all });
  };

  const remind = async (student: MonthCoverageStudentSummary) => {
    setBusy(true);
    try {
      const result = await sendMonthCoverageReminders({ studentIds: [student.studentId] });
      toast.success(result.queued ? `Reminder queued for ${student.name}` : 'No reminder was needed.');
    } catch {
      toast.error('Unable to send reminder.');
    } finally {
      setBusy(false);
    }
  };

  const openVoid = async (payment: MonthCoveragePaymentSummary) => {
    setVoiding(payment);
    setVoidPreview(null);
    setVoidReason('');
    try {
      setVoidPreview(await previewVoidPayment(payment.id));
    } catch {
      toast.error('Unable to preview this correction.');
      setVoiding(null);
    }
  };

  const confirmVoid = async () => {
    if (!voiding || !voidPreview) return;
    setBusy(true);
    try {
      await voidPayment(voiding.id, voidReason.trim() || 'Corrected by teacher');
      toast.success('Payment voided and its months reopened.');
      setVoiding(null);
      setVoidPreview(null);
      await refresh();
    } catch {
      toast.error('Unable to void payment.');
    } finally {
      setBusy(false);
    }
  };

  if (isLoading) return <div className="grid min-h-72 place-items-center"><Loader2 className="h-7 w-7 animate-spin text-app-text-tertiary" /></div>;
  if (error || !data) return <div className="rounded-2xl border border-red-100 bg-red-50 p-5 text-sm font-bold text-red-700">Unable to load month coverage fees.</div>;

  const totals = data.totals;
  return (
    <div className="space-y-6 pb-24">
      <section className="overflow-hidden rounded-[26px] border border-black/5 bg-white p-5 shadow-[0_1px_3px_rgba(0,0,0,0.06),0_4px_16px_rgba(0,0,0,0.04)] sm:p-6">
        <div className="grid grid-cols-2 gap-5 lg:grid-cols-5">
          <Metric label="Amount collected" value={`₹${totals.collectedRupees.toLocaleString('en-IN')}`} tone="text-emerald-700" />
          <Metric label="Months received" value={String(totals.receivedMonths)} />
          <Metric label="Months pending" value={String(totals.pendingMonths)} tone="text-amber-700" />
          <Metric label="Months overdue" value={String(totals.overdueMonths)} tone="text-red-600" />
          <div className="col-span-2 lg:col-span-1">
            <p className="text-[10px] font-black uppercase tracking-widest text-app-text-tertiary">Overall progress</p>
            <p className="mt-1 text-2xl font-black text-app-text">{totals.receivedMonths} / {totals.applicableMonths} months</p>
            <div className="mt-2 h-2 overflow-hidden rounded-full bg-neutral-100"><div className="h-full rounded-full bg-emerald-500" style={{ width: `${totals.progressPercent}%` }} /></div>
          </div>
        </div>
      </section>

      <section className="rounded-[26px] border border-black/5 bg-white p-4 shadow-sm sm:p-5">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex rounded-xl bg-neutral-100 p-1">
            <button onClick={() => setView('students')} className={`flex-1 rounded-lg px-4 py-2 text-xs font-black ${view === 'students' ? 'bg-white text-black shadow-sm' : 'text-app-text-secondary'}`}>Students</button>
            <button onClick={() => setView('payments')} className={`flex-1 rounded-lg px-4 py-2 text-xs font-black ${view === 'payments' ? 'bg-white text-black shadow-sm' : 'text-app-text-secondary'}`}>Payments</button>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row">
            <label className="relative min-w-52 flex-1"><Search className="absolute left-3 top-3 h-4 w-4 text-app-text-tertiary" /><input value={search} onChange={event => setSearch(event.target.value)} placeholder="Search student or batch" className="w-full rounded-xl border border-black/10 bg-neutral-50 py-2.5 pl-9 pr-3 text-sm outline-none focus:border-black" /></label>
            <select value={batchId} onChange={event => setBatchId(event.target.value)} className="rounded-xl border border-black/10 bg-neutral-50 px-3 py-2.5 text-xs font-bold"><option value="">All batches</option>{batches.map(([id, name]) => <option key={id} value={id}>{name}</option>)}</select>
            <select value={profileStatus} onChange={event => setProfileStatus(event.target.value)} className="rounded-xl border border-black/10 bg-neutral-50 px-3 py-2.5 text-xs font-bold"><option value="">All fee profiles</option><option value="ACTIVE">Active</option><option value="PENDING_SETUP">Setup required</option><option value="CLOSED">Closed</option></select>
          </div>
        </div>
        <div className="mt-3 flex flex-wrap gap-2 border-t border-black/5 pt-3">
          <a href={monthCoverageReportUrl.pending(batchId || undefined)} className="inline-flex items-center gap-2 rounded-xl border border-black/10 px-3 py-2 text-xs font-bold hover:bg-neutral-50"><Download className="h-4 w-4" /> Pending report</a>
          <a href={monthCoverageReportUrl.transactions(new Date().getMonth() + 1, new Date().getFullYear())} className="inline-flex items-center gap-2 rounded-xl border border-black/10 px-3 py-2 text-xs font-bold hover:bg-neutral-50"><CalendarDays className="h-4 w-4" /> This month’s collections</a>
        </div>
      </section>

      {view === 'students' ? (
        <section className="overflow-hidden rounded-[26px] border border-black/5 bg-white shadow-sm">
          <div className="divide-y divide-black/5">
            {students.map(student => (
              <article key={student.studentId} className="p-4 sm:p-5">
                <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2"><h3 className="font-black text-app-text">{student.name}</h3><span className="rounded-full bg-neutral-100 px-2 py-1 text-[10px] font-bold text-app-text-secondary">{student.batchName}</span></div>
                    {student.setupRequired ? <p className="mt-2 flex items-center gap-2 text-sm font-bold text-amber-700"><AlertCircle className="h-4 w-4" /> Fee start month needs to be set</p> : (
                      <>
                        <p className="mt-2 text-sm font-black text-app-text">{student.receivedMonths} / {student.applicableMonths} months received <span className="ml-2 text-amber-700">{student.pendingMonths} pending</span>{student.overdueMonths > 0 && <span className="ml-2 text-red-600">{student.overdueMonths} overdue</span>}</p>
                        <div className="mt-2 h-2 max-w-xl overflow-hidden rounded-full bg-neutral-100"><div className="h-full rounded-full bg-emerald-500" style={{ width: `${student.progressPercent}%` }} /></div>
                        <p className="mt-2 text-xs font-medium text-app-text-secondary">{monthStatusCopy(student.nextPendingMonth, student.overdueMonths > 0 ? 'OVERDUE' : 'PENDING')}</p>
                      </>
                    )}
                  </div>
                  {!student.setupRequired && (
                    <div className="flex gap-2">
                      {student.pendingMonths > 0 && <button disabled={busy} onClick={() => void remind(student)} className="rounded-xl border border-black/10 p-3 text-app-text-secondary hover:bg-neutral-50" aria-label={`Remind ${student.name}`}><Mail className="h-4 w-4" /></button>}
                      {student.pendingMonths > 0 && <button onClick={() => setPaymentStudent(student)} className="inline-flex items-center gap-2 rounded-xl bg-black px-4 py-3 text-xs font-black text-white"><Plus className="h-4 w-4" /> Record payment</button>}
                    </div>
                  )}
                </div>
              </article>
            ))}
            {students.length === 0 && <p className="p-10 text-center text-sm font-medium text-app-text-tertiary">No students match these filters.</p>}
          </div>
        </section>
      ) : (
        <section className="overflow-hidden rounded-[26px] border border-black/5 bg-white shadow-sm">
          <div className="divide-y divide-black/5">
            {payments.map(payment => (
              <article key={payment.id} className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5">
                <div><div className="flex items-center gap-2"><History className="h-4 w-4 text-emerald-600" /><h3 className="font-black">{payment.studentName}</h3><span className="text-xs text-app-text-tertiary">{payment.batchName}</span></div><p className="mt-2 text-sm font-bold">₹{payment.amountRupees.toLocaleString('en-IN')} · {formatCoverageRange(payment.coverageMonths)}</p><p className="mt-1 text-xs text-app-text-tertiary">{new Date(payment.paymentDate).toLocaleDateString('en-IN')} · {payment.duration.replace(/_/g, ' ').toLowerCase()}</p></div>
                <button onClick={() => void openVoid(payment)} className="self-start rounded-xl border border-red-200 px-3 py-2 text-xs font-black text-red-600 hover:bg-red-50">Void</button>
              </article>
            ))}
            {payments.length === 0 && <p className="p-10 text-center text-sm font-medium text-app-text-tertiary">No payments recorded yet.</p>}
          </div>
        </section>
      )}

      {paymentStudent && <MonthCoveragePaymentDialog student={paymentStudent} onClose={() => setPaymentStudent(null)} onSaved={() => { setPaymentStudent(null); void refresh(); }} />}

      {voiding && createPortal((
        <div className="fixed inset-0 z-[220] flex items-end justify-center bg-black/45 sm:items-center sm:p-4">
          <div role="dialog" aria-modal="true" data-testid="void-payment-dialog" className="max-h-[calc(100dvh-env(safe-area-inset-top)-1rem)] w-full max-w-md overflow-y-auto rounded-t-[28px] bg-white p-6 pb-[calc(6rem+env(safe-area-inset-bottom))] shadow-2xl sm:rounded-[28px] sm:pb-6">
            <div className="flex items-start justify-between"><div><p className="text-xs font-black uppercase tracking-wider text-red-600">Void payment</p><h2 className="mt-1 text-xl font-black">Reopen covered months?</h2></div><button onClick={() => setVoiding(null)} aria-label="Close"><X className="h-5 w-5" /></button></div>
            {!voidPreview ? <p className="mt-5 flex items-center gap-2 text-sm"><Loader2 className="h-4 w-4 animate-spin" /> Loading correction preview…</p> : <><p className="mt-5 text-sm leading-6 text-app-text-secondary">Voiding ₹{voidPreview.amountRupees.toLocaleString('en-IN')} will mark <strong className="text-app-text">{listMonths(voidPreview.reopenedMonths)}</strong> as pending again.</p><label className="mt-4 block text-xs font-bold uppercase tracking-wider text-app-text-secondary">Reason (optional)<textarea value={voidReason} onChange={event => setVoidReason(event.target.value)} className="mt-2 min-h-20 w-full rounded-xl border border-black/10 bg-neutral-50 p-3 text-sm font-medium normal-case outline-none" /></label><div className="mt-5 flex gap-3"><button onClick={() => setVoiding(null)} className="flex-1 rounded-xl border border-black/10 py-3 text-sm font-black">Cancel</button><button disabled={busy} onClick={() => void confirmVoid()} className="flex-1 rounded-xl bg-red-600 py-3 text-sm font-black text-white disabled:opacity-50">Confirm void</button></div></>}
          </div>
        </div>
      ), document.body)}
    </div>
  );
}

function Metric({ label, value, tone = 'text-app-text' }: { label: string; value: string; tone?: string }) {
  return <div><p className="text-[10px] font-black uppercase tracking-widest text-app-text-tertiary">{label}</p><p className={`mt-1 text-2xl font-black ${tone}`}>{value}</p></div>;
}
