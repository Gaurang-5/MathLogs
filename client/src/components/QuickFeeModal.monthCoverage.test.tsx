import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import QuickFeeModal from './QuickFeeModal';

const { apiMock, loadSummary } = vi.hoisted(() => ({
  apiMock: { get: vi.fn(), post: vi.fn() },
  loadSummary: vi.fn(),
}));

vi.mock('../utils/api', () => ({ api: apiMock }));
vi.mock('../features/month-coverage/api', () => ({ loadMonthCoverageSummary: loadSummary }));
vi.mock('../features/month-coverage/MonthCoveragePaymentDialog', () => ({
  MonthCoveragePaymentDialog: ({ student }: { student: { name: string } }) => <div data-testid="month-payment">Month payment for {student.name}</div>,
}));

const settle = () => new Promise(resolve => setTimeout(resolve, 20));

describe('QuickFeeModal month coverage dispatch', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    vi.clearAllMocks();
    apiMock.get.mockResolvedValue({ coachingFeeMode: 'MONTH_COVERAGE' });
    loadSummary.mockResolvedValue({
      students: [{
        studentId: 'student-1', name: 'Aarav', batchId: 'batch-1', batchName: 'Target 2027', setupRequired: false,
        feeStartMonth: '2026-06', feeEndMonth: '2027-05', applicableMonths: 12, receivedMonths: 2,
        pendingMonths: 10, overdueMonths: 1, nextPendingMonth: '2026-08', oldestOverdueMonth: '2026-08', progressPercent: 17,
      }],
    });
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  it('loads month students and never requests the legacy fee list', async () => {
    await act(async () => root.render(<QuickFeeModal isOpen onClose={vi.fn()} />));
    await act(async () => { await settle(); });
    expect(apiMock.get).toHaveBeenCalledWith('/institute/me');
    expect(apiMock.get).not.toHaveBeenCalledWith('/fees');
    expect(container.textContent).toContain('Aarav');
    await act(async () => Array.from(container.querySelectorAll('button')).find(button => button.textContent?.includes('Aarav'))?.click());
    expect(container.textContent).toContain('Month payment for Aarav');
  });
});
