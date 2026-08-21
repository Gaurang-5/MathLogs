import { act } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import Dashboard from './Dashboard';

const { apiGet } = vi.hoisted(() => ({ apiGet: vi.fn() }));
vi.mock('../utils/api', () => ({ api: { get: apiGet } }));
vi.mock('../components/Layout', () => ({ default: ({ children }: { children: React.ReactNode }) => <main>{children}</main> }));
vi.mock('../components/StudentSearch', () => ({ default: () => <div>Student search</div> }));
vi.mock('react-countup', () => ({ default: ({ end, suffix, formattingFn }: { end: number; suffix?: string; formattingFn?: (value: number) => string }) => <>{formattingFn ? formattingFn(end) : end}{suffix}</> }));
vi.mock('recharts', () => ({
  ResponsiveContainer: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  LineChart: ({ children }: { children: React.ReactNode }) => <div>{children}</div>, BarChart: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  Line: () => null, Bar: () => null, XAxis: () => null, YAxis: () => null, CartesianGrid: () => null, Tooltip: () => null,
}));

const monthSummary = {
  feeMode: 'MONTH_COVERAGE', stats: { batches: 2, students: 12 }, userName: 'Sharma Sir',
  monthCoverage: { collectedRupees: 15000, receivedMonths: 8, pendingMonths: 4, overdueMonths: 2, applicableMonths: 12, progressPercent: 67 },
  followUps: [{ studentId: 'student-1', name: 'Aarav', batchName: 'Target 2027', overdueMonths: 2, oldestOverdueMonth: '2027-01' }],
};
const legacySummary = {
  feeMode: 'CURRENT_DUE_BASED', stats: { batches: 2, students: 12 }, userName: 'Sharma Sir',
  finances: { collected: 5000, totalCollected: 15000, pending: 5000 }, defaulters: [{ name: 'Target 2027', amount: 5000 }],
};

const settle = () => new Promise(resolve => setTimeout(resolve, 25));

describe('Dashboard fee-mode rendering', () => {
  let container: HTMLDivElement;
  let root: Root;
  let queryClient: QueryClient;

  beforeEach(() => {
    vi.clearAllMocks();
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

  const renderDashboard = async (summary: typeof monthSummary | typeof legacySummary) => {
    apiGet.mockImplementation(async (path: string) => path === '/dashboard/summary' ? summary : []);
    await act(async () => root.render(<MemoryRouter><QueryClientProvider client={queryClient}><Dashboard /></QueryClientProvider></MemoryRouter>));
    await act(async () => { await settle(); });
  };

  it('uses months for collection progress and keeps received rupees separate', async () => {
    await renderDashboard(monthSummary);
    expect(container.textContent).toContain('Students');
    expect(container.textContent).toContain('Batches');
    expect(container.textContent).toContain('Collection');
    expect(container.textContent).toContain('8 / 12');
    expect(container.textContent).toContain('67%');
    expect(container.textContent).toContain('Total Received');
    expect(container.textContent).toContain('₹15,000');
    expect(container.textContent).toContain('2 overdue months');
    expect(container.textContent).toContain('Oldest: January 2027');
    expect(container.textContent).not.toContain('Pending Dues by Batch');
    expect(apiGet).not.toHaveBeenCalledWith('/dashboard/installment-stats');
  });

  it('preserves amount-based labels and calculations for the current system', async () => {
    await renderDashboard(legacySummary);
    expect(container.textContent).toContain('Collection');
    expect(container.textContent).toContain('75%');
    expect(container.textContent).toContain('This Month');
    expect(container.textContent).toContain('₹5,000');
    expect(container.textContent).toContain('Pending Dues by Batch');
    expect(apiGet).toHaveBeenCalledWith('/dashboard/installment-stats');
  });
});
