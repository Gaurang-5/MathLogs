import type { EnrollmentBatch, EnrollmentFeeChoice } from './types';

export function defaultEnrollmentFeeChoice(batch: EnrollmentBatch): EnrollmentFeeChoice {
  if (batch.coachingFeeMode === 'MONTH_COVERAGE') {
    const now = new Date();
    const current = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    const first = batch.startDate?.slice(0, 7);
    const last = batch.endDate?.slice(0, 7);
    const feeStartMonth = first && current < first ? first : last && current > last ? last : current;
    return { mode: 'MONTH_COVERAGE', feeStartMonth };
  }
  return { mode: 'CURRENT_DUE_BASED', installmentIds: [] };
}

export function FeeApplicabilityStep({ batch, value, onChange }: {
  batch: EnrollmentBatch;
  value: EnrollmentFeeChoice;
  onChange: (choice: EnrollmentFeeChoice) => void;
}) {
  if (value.mode === 'MONTH_COVERAGE') {
    return <label className="block space-y-2">
      <span className="text-xs font-bold uppercase tracking-wide text-app-text-secondary">Fee starts from</span>
      <input aria-label="Fee starts from" type="month" min={batch.startDate?.slice(0, 7)} max={batch.endDate?.slice(0, 7)}
        value={value.feeStartMonth} onChange={event => onChange({ mode: 'MONTH_COVERAGE', feeStartMonth: event.target.value })}
        className="w-full rounded-xl border border-black/10 px-4 py-3" required />
      <span className="block text-xs text-app-text-tertiary">The teacher may choose the current month or an older valid batch month.</span>
    </label>;
  }

  const installments = batch.feeInstallments.filter(item => !item.studentId);
  const selectedTotal = installments.filter(item => value.installmentIds.includes(item.id)).reduce((sum, item) => sum + item.amount, 0);
  return <fieldset className="space-y-3">
    <legend className="text-xs font-bold uppercase tracking-wide text-app-text-secondary">Apply installments</legend>
    <label className="block space-y-2"><span className="text-sm font-semibold text-app-text">Fee decision</span>
      <select aria-label="Fee decision" value={value.decision || ''} className="min-h-11 w-full rounded-xl border border-app-border bg-app-surface-opaque px-3 text-app-text" onChange={event => onChange({ mode: 'CURRENT_DUE_BASED', decision: event.target.value as 'SELECTED' | 'NO_FEE' | 'LATER', installmentIds: [], applyFutureInstallments: false })}>
        <option value="" disabled>Choose before continuing</option><option value="SELECTED">Select installments</option><option value="NO_FEE">No fee for this enrollment</option><option value="LATER">Decide fees later</option>
      </select>
    </label>
    {value.decision === 'SELECTED' && (installments.length === 0 ? <p className="text-sm text-app-text-tertiary">Create a batch installment first, or choose no fee / decide later.</p> : installments.map(item => {
      const checked = value.installmentIds.includes(item.id);
      return <label key={item.id} className="flex items-center justify-between rounded-xl border border-black/10 px-4 py-3">
        <span>{item.name} · ₹{item.amount.toLocaleString('en-IN')}</span>
        <input aria-label={item.name} className="h-5 w-5 accent-current" type="checkbox" checked={checked} onChange={() => onChange({
          ...value, mode: 'CURRENT_DUE_BASED',
          amounts: Object.fromEntries(installments.map(row => [row.id, row.amount])),
          installmentIds: checked ? value.installmentIds.filter(id => id !== item.id) : [...value.installmentIds, item.id],
        })} />
      </label>;
    }))}
    {value.decision === 'SELECTED' ? <label className="flex min-h-11 items-center gap-3 text-sm text-app-text"><input type="checkbox" checked={value.applyFutureInstallments === true} onChange={event => onChange({ ...value, applyFutureInstallments: event.target.checked })} />Apply future batch installments automatically</label> : null}
    {value.decision ? <div role="status" className="rounded-xl border border-app-border bg-app-surface-opaque p-4 text-app-text"><strong>{value.decision === 'LATER' ? 'Fees pending teacher decision' : `Confirmed fee: ₹${selectedTotal.toLocaleString('en-IN')}`}</strong><p className="mt-1 text-xs text-app-text-secondary">{value.decision === 'LATER' ? 'No fees will be charged until the teacher assigns them.' : 'Only the selected fees apply. No automatic flat batch fee.'}{value.applyFutureInstallments ? ' Future batch installments will also apply.' : ' Future installments require a separate teacher assignment.'}</p></div> : null}
  </fieldset>;
}

export function isEnrollmentFeeChoiceReady(fee: EnrollmentFeeChoice) {
  return fee.mode === 'MONTH_COVERAGE' ? /^\d{4}-(0[1-9]|1[0-2])$/.test(fee.feeStartMonth) : Boolean(fee.decision && (fee.decision !== 'SELECTED' || fee.installmentIds.length > 0));
}
