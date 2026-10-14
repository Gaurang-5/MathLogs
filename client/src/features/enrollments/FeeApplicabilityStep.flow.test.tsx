import { act, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it } from 'vitest';
import { defaultEnrollmentFeeChoice, FeeApplicabilityStep, isEnrollmentFeeChoiceReady } from './FeeApplicabilityStep';
import type { EnrollmentFeeChoice } from './types';

it('requires an explicit decision and records selected prices without opting into future fees', async () => {
  const batch = { id: 'batch', name: 'Math', coachingFeeMode: 'CURRENT_DUE_BASED' as const, feeInstallments: [{ id: 'one', name: 'First installment', amount: 1200 }] };
  let choice: EnrollmentFeeChoice = defaultEnrollmentFeeChoice(batch);
  function Form() {
    const [value, setValue] = useState(choice);
    choice = value;
    return <FeeApplicabilityStep batch={batch} value={value} onChange={setValue} />;
  }
  const container = document.createElement('div');
  document.body.append(container);
  const root = createRoot(container);
  try {
    await act(async () => root.render(<Form />));
    expect(isEnrollmentFeeChoiceReady(choice)).toBe(false);
    const select = container.querySelector('select')!;
    await act(async () => { select.value = 'SELECTED'; select.dispatchEvent(new Event('change', { bubbles: true })); });
    expect(isEnrollmentFeeChoiceReady(choice)).toBe(false);
    await act(async () => (container.querySelector('input[aria-label="First installment"]') as HTMLInputElement).click());
    expect(choice).toMatchObject({ decision: 'SELECTED', installmentIds: ['one'], amounts: { one: 1200 }, applyFutureInstallments: false });
    expect(isEnrollmentFeeChoiceReady(choice)).toBe(true);
    expect(container.textContent).toContain('Confirmed fee: ₹1,200');
    await act(async () => { select.value = 'NO_FEE'; select.dispatchEvent(new Event('change', { bubbles: true })); });
    expect(choice).toMatchObject({ decision: 'NO_FEE', installmentIds: [], applyFutureInstallments: false });
    expect(isEnrollmentFeeChoiceReady(choice)).toBe(true);
    expect(container.textContent).toContain('Confirmed fee: ₹0');
  } finally { await act(async () => root.unmount()); container.remove(); }
});
