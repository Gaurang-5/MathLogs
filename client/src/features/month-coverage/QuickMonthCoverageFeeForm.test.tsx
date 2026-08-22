import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { QuickMonthCoverageFeeForm } from './QuickMonthCoverageFeeForm';
import type { MonthCoverageStudentSummary } from './types';

const apiMock = vi.hoisted(() => ({
  previewMonthCoveragePayment: vi.fn(),
  createMonthCoveragePayment: vi.fn(),
  createPaymentAttemptId: vi.fn(() => 'attempt-quick'),
}));

vi.mock('./api', () => apiMock);

const students: MonthCoverageStudentSummary[] = [{
  studentId: 'student-1', name: 'Aarav', humanId: 'ML-001', parentWhatsapp: '9557940807',
  batchId: 'batch-1', batchName: 'Target 2027', setupRequired: false,
  feeStartMonth: '2026-06', feeEndMonth: '2027-05', applicableMonths: 12,
  receivedMonths: 2, pendingMonths: 10, overdueMonths: 1, nextPendingMonth: '2026-08',
  oldestOverdueMonth: '2026-08', progressPercent: 17,
}];

const flush = () => new Promise(resolve => setTimeout(resolve, 0));

function setValue(element: HTMLInputElement | HTMLSelectElement, value: string) {
  const prototype = element instanceof HTMLSelectElement ? HTMLSelectElement.prototype : HTMLInputElement.prototype;
  Object.getOwnPropertyDescriptor(prototype, 'value')?.set?.call(element, value);
  element.dispatchEvent(new Event('input', { bubbles: true }));
  element.dispatchEvent(new Event('change', { bubbles: true }));
}

describe('QuickMonthCoverageFeeForm', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    vi.clearAllMocks();
    apiMock.previewMonthCoveragePayment.mockResolvedValue({
      studentId: 'student-1', duration: 'QUARTERLY', monthCount: 3,
      coverageMonths: ['2026-08', '2026-09', '2026-10'], oldestPendingMonth: '2026-08',
      gapWarning: null, remainingMonthsAfterPayment: 7,
    });
    apiMock.createMonthCoveragePayment.mockResolvedValue({ result: {}, preview: {} });
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  it('shows only search, amount, duration and chronological preview', async () => {
    await act(async () => root.render(<QuickMonthCoverageFeeForm students={students} onClose={vi.fn()} onSaved={vi.fn()} />));
    expect(container.querySelector('[placeholder="Search student"]')).not.toBeNull();
    expect(container.querySelector('[aria-label="Amount received"]')).not.toBeNull();
    expect(container.querySelector('[aria-label="Fee duration"]')).not.toBeNull();
    expect(container.textContent).not.toContain('Scan receipt');
    expect(container.querySelector('[aria-label="Starting month"]')).toBeNull();
    expect(container.querySelector('[aria-label="Payment date"]')).toBeNull();
    expect(container.querySelector('[aria-label="Payment method"]')).toBeNull();
  });

  it('submits quarterly coverage from the oldest pending month using today and Cash', async () => {
    const onSaved = vi.fn();
    await act(async () => root.render(<QuickMonthCoverageFeeForm students={students} onClose={vi.fn()} onSaved={onSaved} />));
    await act(async () => setValue(container.querySelector('[placeholder="Search student"]') as HTMLInputElement, 'Aarav'));
    await act(async () => Array.from(container.querySelectorAll('button')).find(button => button.textContent?.includes('Aarav'))?.click());
    await act(async () => {
      setValue(container.querySelector('[aria-label="Amount received"]') as HTMLInputElement, '3000');
      setValue(container.querySelector('[aria-label="Fee duration"]') as HTMLSelectElement, 'QUARTERLY');
      await flush();
    });
    expect(apiMock.previewMonthCoveragePayment).toHaveBeenLastCalledWith({
      studentId: 'student-1', duration: 'QUARTERLY', requestedStartMonth: null, allowGap: false,
    });
    await act(async () => {
      Array.from(container.querySelectorAll('button')).find(button => button.textContent?.includes('Save payment'))?.click();
      await flush();
    });
    expect(apiMock.createMonthCoveragePayment).toHaveBeenCalledWith(expect.objectContaining({
      studentId: 'student-1', amount: 3000, duration: 'QUARTERLY', requestedStartMonth: null,
      paymentMethod: 'CASH', allowGap: false,
    }), 'attempt-quick');
    expect(onSaved).toHaveBeenCalled();
  });
});
