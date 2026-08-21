import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MonthCoveragePaymentDialog } from './MonthCoveragePaymentDialog';
import type { MonthCoverageStudentSummary } from './types';

const { apiMock } = vi.hoisted(() => ({
  apiMock: {
    previewMonthCoveragePayment: vi.fn(), createMonthCoveragePayment: vi.fn(),
    updateMonthCoveragePayment: vi.fn(), scanMonthCoverageReceipt: vi.fn(),
    createPaymentAttemptId: vi.fn(() => 'attempt-fixed'),
  },
}));

vi.mock('./api', () => apiMock);

const student: MonthCoverageStudentSummary = {
  studentId: 'student-1', name: 'Aarav', batchId: 'batch-1', batchName: 'Target 2027',
  setupRequired: false, feeStartMonth: '2026-06', feeEndMonth: '2027-03', applicableMonths: 10,
  receivedMonths: 1, pendingMonths: 9, overdueMonths: 2, nextPendingMonth: '2026-07',
  oldestOverdueMonth: '2026-07', progressPercent: 10,
};

const flush = () => new Promise(resolve => setTimeout(resolve, 0));
const button = (container: HTMLElement, label: string) => Array.from(container.querySelectorAll('button'))
  .find(item => item.textContent?.includes(label)) as HTMLButtonElement;

function setInput(input: HTMLInputElement | HTMLTextAreaElement, value: string) {
  const prototype = input instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  Object.getOwnPropertyDescriptor(prototype, 'value')?.set?.call(input, value);
  input.dispatchEvent(new Event('input', { bubbles: true }));
  input.dispatchEvent(new Event('change', { bubbles: true }));
}

describe('MonthCoveragePaymentDialog', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    vi.clearAllMocks();
    apiMock.previewMonthCoveragePayment.mockImplementation(async (input: { duration: string; requestedStartMonth: string | null; allowGap: boolean }) => ({
      studentId: 'student-1', duration: input.duration, monthCount: input.duration === 'QUARTERLY' ? 3 : 1,
      coverageMonths: input.duration === 'QUARTERLY' ? ['2026-07', '2026-08', '2026-09'] : [input.requestedStartMonth || '2026-07'],
      oldestPendingMonth: '2026-07', gapWarning: null, remainingMonthsAfterPayment: 6,
    }));
    apiMock.createMonthCoveragePayment.mockResolvedValue({ result: {}, preview: {} });
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  it('previews duration/start changes and submits the complete payload with one stable attempt key', async () => {
    const onSaved = vi.fn();
    await act(async () => {
      root.render(<MonthCoveragePaymentDialog student={student} onClose={vi.fn()} onSaved={onSaved} />);
      await flush();
    });
    await act(async () => { button(container, 'Quarterly').click(); await flush(); });
    expect(apiMock.previewMonthCoveragePayment).toHaveBeenLastCalledWith(expect.objectContaining({ duration: 'QUARTERLY' }));
    expect(container.textContent).toContain('July–September 2026');

    const startMonth = container.querySelector('input[type="month"]') as HTMLInputElement;
    await act(async () => { setInput(startMonth, '2026-08'); await flush(); });
    expect(apiMock.previewMonthCoveragePayment).toHaveBeenLastCalledWith(expect.objectContaining({ requestedStartMonth: '2026-08' }));

    await act(async () => {
      setInput(container.querySelector('input[type="number"]') as HTMLInputElement, '1000');
      button(container, 'Confirm payment').click();
      await flush();
    });
    expect(apiMock.createMonthCoveragePayment).toHaveBeenCalledWith(expect.objectContaining({
      studentId: 'student-1', amount: 1000, duration: 'QUARTERLY', requestedStartMonth: '2026-08', allowGap: false,
    }), 'attempt-fixed');
    expect(apiMock.createPaymentAttemptId).toHaveBeenCalledTimes(1);
    expect(onSaved).toHaveBeenCalled();
  });

  it('shows the exact covered-month conflict and disables confirmation', async () => {
    apiMock.previewMonthCoveragePayment.mockRejectedValue(new Error('MONTH_ALREADY_COVERED'));
    await act(async () => {
      root.render(<MonthCoveragePaymentDialog student={student} onClose={vi.fn()} onSaved={vi.fn()} />);
      await flush();
    });
    await act(async () => {
      setInput(container.querySelector('input[type="month"]') as HTMLInputElement, '2026-09');
      await flush();
    });
    expect(container.textContent).toContain('September 2026 fee has already been received. Please select another month.');
    expect(button(container, 'Confirm payment').disabled).toBe(true);
  });

  it('lists skipped months and requires explicit gap confirmation', async () => {
    apiMock.previewMonthCoveragePayment.mockImplementation(async (input: { allowGap: boolean }) => {
      if (!input.allowGap) throw new Error('COVERAGE_GAP_REQUIRES_CONFIRMATION');
      return {
        studentId: 'student-1', duration: 'MONTHLY', monthCount: 1, coverageMonths: ['2026-09'],
        oldestPendingMonth: '2026-07', gapWarning: { skippedMonths: ['2026-07', '2026-08'] }, remainingMonthsAfterPayment: 8,
      };
    });
    await act(async () => {
      root.render(<MonthCoveragePaymentDialog student={student} onClose={vi.fn()} onSaved={vi.fn()} />);
      await flush();
    });
    await act(async () => {
      setInput(container.querySelector('input[type="month"]') as HTMLInputElement, '2026-09');
      await flush();
    });
    expect(container.textContent).toContain('July and August 2026');
    await act(async () => setInput(container.querySelector('input[type="number"]') as HTMLInputElement, '1000'));
    expect(button(container, 'Confirm payment').disabled).toBe(true);
    await act(async () => button(container, 'I understand, continue').click());
    expect(button(container, 'Confirm payment').disabled).toBe(false);
  });

  it('previews and updates an existing payment without creating another payment', async () => {
    apiMock.updateMonthCoveragePayment.mockResolvedValue({ result: {}, preview: {} });
    await act(async () => {
      root.render(<MonthCoveragePaymentDialog
        student={student}
        payment={{
          id: 'payment-1', amountRupees: 2500, paymentDate: '2026-08-20T12:00:00.000Z',
          duration: 'QUARTERLY', coverageMonths: ['2026-07', '2026-08', '2026-09'], paymentMethod: 'UPI', note: 'Original note',
        }}
        onClose={vi.fn()}
        onSaved={vi.fn()}
      />);
      await flush();
    });
    expect((container.querySelector('input[type="number"]') as HTMLInputElement).value).toBe('2500');
    await act(async () => { button(container, 'Save changes').click(); await flush(); });
    expect(apiMock.updateMonthCoveragePayment).toHaveBeenCalledWith('payment-1', expect.objectContaining({
      amount: 2500, duration: 'QUARTERLY', requestedStartMonth: '2026-07', paymentMethod: 'UPI', note: 'Original note',
    }));
    expect(apiMock.createMonthCoveragePayment).not.toHaveBeenCalled();
  });
});
