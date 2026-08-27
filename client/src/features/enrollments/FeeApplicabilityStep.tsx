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
  return <fieldset className="space-y-2">
    <legend className="text-xs font-bold uppercase tracking-wide text-app-text-secondary">Apply installments</legend>
    {installments.length === 0 ? <p className="text-sm text-app-text-tertiary">No existing installments will be applied.</p> : installments.map(item => {
      const checked = value.installmentIds.includes(item.id);
      return <label key={item.id} className="flex items-center justify-between rounded-xl border border-black/10 px-4 py-3">
        <span>{item.name} · ₹{item.amount.toLocaleString('en-IN')}</span>
        <input type="checkbox" checked={checked} onChange={() => onChange({
          mode: 'CURRENT_DUE_BASED',
          installmentIds: checked ? value.installmentIds.filter(id => id !== item.id) : [...value.installmentIds, item.id],
        })} />
      </label>;
    })}
  </fieldset>;
}
