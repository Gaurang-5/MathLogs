import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import StudentProfileDrawer from './StudentProfileDrawer';

const apiMock = vi.hoisted(() => ({ get: vi.fn() }));
vi.mock('../utils/api', () => ({ api: apiMock }));

const flush = () => new Promise(resolve => setTimeout(resolve, 20));

describe('StudentProfileDrawer month coverage', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    apiMock.get.mockResolvedValue({
      id: 'student-1', humanId: 'ML-001', name: 'Aarav', parentName: 'Parent',
      parentWhatsapp: '9557940807', parentEmail: null, schoolName: null,
      additionalData: { emergencyPhone: '9557940807' }, status: 'APPROVED', createdAt: '2026-08-01T00:00:00.000Z',
      coachingFeeMode: 'MONTH_COVERAGE',
      registrationFields: [{ id: 'emergencyPhone', label: 'Emergency phone', type: 'tel' }],
      monthCoverageProfile: { feeStartMonth: '2026-08', feeEndMonth: '2027-03', status: 'ACTIVE' },
      monthCoverageStats: { receivedMonths: 3, pendingMonths: 5, overdueMonths: 1, progressPercent: 38 },
      stats: { attendancePercentage: null, attendedClasses: 0, totalClasses: 0 },
      attendanceRecords: [], marks: [], feePayments: [], balance: null,
      batch: { name: 'Target', className: null, subject: 'Maths' },
    });
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    document.body.innerHTML = '';
    vi.clearAllMocks();
  });

  it('shows configured onboarding values and month metrics instead of an amount balance', async () => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    await act(async () => root.render(<QueryClientProvider client={queryClient}><StudentProfileDrawer studentId="student-1" onClose={vi.fn()} /></QueryClientProvider>));
    await act(async () => { await flush(); });

    expect(document.body.textContent).toContain('Emergency phone');
    expect(document.body.textContent).toContain('9557940807');
    expect(document.body.textContent).toContain('Pending months');
    expect(document.body.textContent).toContain('Paid months');
    expect(document.body.textContent).toContain('Overdue');
    expect(document.body.textContent).not.toContain('₹');
  });
});
