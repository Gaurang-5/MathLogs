import { act } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MonthCoverageFeesView } from './MonthCoverageFeesView';

const { apiMock } = vi.hoisted(() => ({
  apiMock: {
    loadMonthCoverageSummary: vi.fn(), previewVoidPayment: vi.fn(), voidPayment: vi.fn(),
    sendMonthCoverageReminders: vi.fn(),
    monthCoverageKeys: { all: ['monthCoverage'], summary: (filters: unknown) => ['monthCoverage', 'summary', filters] },
    monthCoverageReportUrl: { pending: vi.fn(() => '/pending.pdf'), transactions: vi.fn(() => '/transactions.pdf') },
  },
}));

vi.mock('./api', () => apiMock);
vi.mock('./MonthCoveragePaymentDialog', () => ({
  MonthCoveragePaymentDialog: () => <div data-testid="payment-dialog" />,
}));

const summary = {
  feeMode: 'MONTH_COVERAGE' as const,
  totals: { collectedRupees: 15000, receivedMonths: 8, pendingMonths: 4, overdueMonths: 2, applicableMonths: 12, progressPercent: 67 },
  students: [{
    studentId: 'student-1', name: 'Aarav', batchId: 'batch-1', batchName: 'Target 2027', setupRequired: false,
    feeStartMonth: '2026-06', feeEndMonth: '2027-05', applicableMonths: 12, receivedMonths: 8,
    pendingMonths: 4, overdueMonths: 2, nextPendingMonth: '2027-02', oldestOverdueMonth: '2027-01', progressPercent: 67,
  }],
  recentPayments: [{
    id: 'payment-1', studentId: 'student-1', studentName: 'Aarav', batchName: 'Target 2027', amountRupees: 3000,
    paymentDate: '2026-08-20T12:00:00.000Z', duration: 'QUARTERLY' as const, coverageMonths: ['2026-06', '2026-07', '2026-08'],
  }],
};

const flush = () => new Promise(resolve => setTimeout(resolve, 0));
const settleQuery = () => new Promise(resolve => setTimeout(resolve, 20));
const button = (container: HTMLElement, label: string) => Array.from(container.querySelectorAll('button'))
  .find(item => item.textContent?.includes(label)) as HTMLButtonElement;

describe('MonthCoverageFeesView', () => {
  let container: HTMLDivElement;
  let root: Root;
  let queryClient: QueryClient;

  beforeEach(() => {
    vi.clearAllMocks();
    apiMock.loadMonthCoverageSummary.mockResolvedValue(summary);
    apiMock.previewVoidPayment.mockResolvedValue({ paymentId: 'payment-1', amountRupees: 3000, reopenedMonths: ['2026-06', '2026-07', '2026-08'] });
    apiMock.voidPayment.mockResolvedValue({});
    queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    queryClient.clear();
    container.remove();
  });

  it('shows collected amount separately from month progress and student month status', async () => {
    await act(async () => {
      root.render(<QueryClientProvider client={queryClient}><MonthCoverageFeesView /></QueryClientProvider>);
    });
    await act(async () => {
      await settleQuery();
    });
    expect(container.textContent).toContain('₹15,000');
    expect(container.textContent).toContain('8 / 12 months');
    expect(container.textContent).toContain('4 pending');
    expect(container.textContent).toContain('2 overdue');
    expect(container.textContent).toContain('February 2027 fee pending');
    expect(container.textContent).not.toContain('Amount due');
  });

  it('previews the exact reopened months before voiding a payment', async () => {
    await act(async () => {
      root.render(<QueryClientProvider client={queryClient}><MonthCoverageFeesView /></QueryClientProvider>);
    });
    await act(async () => {
      await settleQuery();
    });
    await act(async () => { button(container, 'Payments').click(); await flush(); });
    await act(async () => { button(container, 'Void').click(); await flush(); });
    expect(document.body.textContent).toContain('June, July, and August 2026');
    await act(async () => { button(document.body, 'Confirm void').click(); await flush(); });
    expect(apiMock.voidPayment).toHaveBeenCalledWith('payment-1', expect.anything());
  });
});
