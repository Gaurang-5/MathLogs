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
      additionalData: { emergencyPhone: '9888888888' }, status: 'APPROVED', createdAt: '2026-08-01T00:00:00.000Z',
      coachingFeeMode: 'MONTH_COVERAGE',
      registrationFields: [
        { id: 'studentName', label: 'Student Name', type: 'text', system: true },
        { id: 'parentName', label: 'Parent / Guardian Name', type: 'text', system: true },
        { id: 'parentWhatsapp', label: 'WhatsApp Number', type: 'tel', system: true },
        { id: 'emergencyPhone', label: 'Emergency phone', type: 'tel' },
      ],
      monthCoverageProfile: { feeStartMonth: '2026-08', feeEndMonth: '2027-03', status: 'ACTIVE' },
      monthCoverageStats: { receivedMonths: 3, pendingMonths: 5, overdueMonths: 1, progressPercent: 38 },
      marks: [], feePayments: [], balance: null,
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

  it('shows all contact details in one section and makes additional phone numbers callable', async () => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    await act(async () => root.render(<QueryClientProvider client={queryClient}><StudentProfileDrawer studentId="student-1" onClose={vi.fn()} /></QueryClientProvider>));
    await act(async () => { await flush(); });

    expect(document.body.textContent).toContain('Emergency phone');
    expect(document.body.textContent).toContain('9888888888');
    expect(document.body.textContent).not.toContain('Onboarding details');
    const additionalPhoneLink = document.body.querySelector('a[href="tel:9888888888"]');
    expect(additionalPhoneLink).not.toBeNull();
    expect(additionalPhoneLink?.textContent).toContain('Call');
    expect(document.body.textContent).not.toContain('Student Name');
    expect(document.body.textContent).not.toContain('Parent / Guardian Name');
    expect(document.body.textContent).not.toContain('WhatsApp Number');
    expect(document.body.textContent).toContain('Pending months');
    expect(document.body.textContent).toContain('Paid months');
    expect(document.body.textContent).toContain('Overdue');
    expect(document.body.textContent).not.toContain('₹');
  });
  it('keeps a dismissal control available while a profile request is pending', async () => {
    apiMock.get.mockImplementation(() => new Promise(() => {}));
    const close = vi.fn();
    const queryClient = new QueryClient();
    await act(async () => root.render(<QueryClientProvider client={queryClient}><StudentProfileDrawer studentId="pending" onClose={close} /></QueryClientProvider>));
    const button = document.body.querySelector('button[aria-label="Close profile"]') as HTMLButtonElement;
    expect(button).not.toBeNull();
    await act(async () => button.click());
    expect(close).toHaveBeenCalledOnce();
    queryClient.clear();
  });

  it('shows the request error and reloads the profile when Retry is pressed', async () => {
    apiMock.get.mockRejectedValueOnce(new Error('Profile service unavailable')).mockRejectedValueOnce(new Error('Profile service unavailable'));
    const queryClient = new QueryClient({ defaultOptions: { queries: { retryDelay: 1 } } });
    await act(async () => root.render(<QueryClientProvider client={queryClient}><StudentProfileDrawer studentId="retry" onClose={vi.fn()} /></QueryClientProvider>));
    await act(async () => { await new Promise(resolve => setTimeout(resolve, 60)); });
    expect(document.body.textContent).toContain('Profile service unavailable');
    const retry = Array.from(document.body.querySelectorAll('button')).find(button => button.textContent === 'Retry')!;
    await act(async () => retry.click());
    await act(async () => { await flush(); });
    expect(document.body.textContent).toContain('Aarav');
    expect(document.body.textContent).not.toContain('Could not load profile');
    queryClient.clear();
  });

});
