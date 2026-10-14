import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import BatchDetails from './BatchDetails';
import { searchEnrollmentCandidates } from '../features/enrollments/api';

const { apiRequest, loadSummary, sendRegistrationInvite } = vi.hoisted(() => ({
  apiRequest: vi.fn(),
  loadSummary: vi.fn(),
  sendRegistrationInvite: vi.fn(),
}));
vi.mock('../utils/api', () => ({ apiRequest, API_URL: '/api' }));
vi.mock('../components/Layout', () => ({ default: ({ children }: { children: React.ReactNode }) => <main>{children}</main> }));
vi.mock('../components/StudentProfileDrawer', () => ({ default: () => null }));
vi.mock('../components/batch/BatchRegistrationQrModal', () => ({ BatchRegistrationQrModal: () => null }));
vi.mock('react-qr-code', () => ({ default: () => null }));
vi.mock('../features/month-coverage/api', () => ({
  loadMonthCoverageSummary: loadSummary,
  confirmStudentFeeProfile: vi.fn(),
}));
vi.mock('../features/month-coverage/MonthCoveragePaymentDialog', () => ({
  MonthCoveragePaymentDialog: () => <div data-testid="month-payment-dialog" />,
}));
vi.mock('../features/enrollments/api', () => ({
  searchEnrollmentCandidates: vi.fn().mockResolvedValue([]),
  previewEnrollment: vi.fn(),
  enrollExisting: vi.fn(),
  resendEnrollmentNotification: vi.fn(),
  sendRegistrationInvite,
}));

const batch = {
  id: 'batch-1', name: 'Target 2027', subject: 'Math', timeSlot: '4 PM', feeAmount: 0, className: 'Class 10',
  startDate: '2026-06-01T00:00:00.000Z', endDate: '2027-05-31T23:59:59.999Z', coachingFeeMode: 'MONTH_COVERAGE',
  isRegistrationOpen: true, feeInstallments: [], tests: [], institute: { config: { registrationForm: { fields: [
    { id: 'studentName', label: 'Student Name', type: 'text', system: true },
    { id: 'parentWhatsapp', label: 'Parent WhatsApp', type: 'tel', system: true },
    { id: 'studentPhone', label: 'Student Phone', type: 'tel', system: false },
  ] } } },
  students: [{
    id: 'student-1', humanId: 'MTH-1', name: 'Aarav', parentName: 'Parent', parentWhatsapp: '9999999999', parentEmail: null,
    schoolName: null, status: 'APPROVED', createdAt: '2026-06-10T00:00:00.000Z', feePayments: [], fees: [], marks: [], feeAssignments: [],
    monthCoverageProfile: { id: 'profile-1', studentId: 'student-1', batchId: 'batch-1', feeStartMonth: '2026-06', feeEndMonth: '2027-05', status: 'ACTIVE' },
  }],
};
const summary = {
  feeMode: 'MONTH_COVERAGE', totals: { collectedRupees: 3000, receivedMonths: 2, pendingMonths: 10, overdueMonths: 1, applicableMonths: 12, progressPercent: 17 },
  students: [{ studentId: 'student-1', name: 'Aarav', batchId: 'batch-1', batchName: 'Target 2027', setupRequired: false, feeStartMonth: '2026-06', feeEndMonth: '2027-05', applicableMonths: 12, receivedMonths: 2, pendingMonths: 10, overdueMonths: 1, nextPendingMonth: '2026-08', oldestOverdueMonth: '2026-08', progressPercent: 17 }],
  recentPayments: [{ id: 'payment-1', studentId: 'student-1', studentName: 'Aarav', batchName: 'Target 2027', amountRupees: 3000, paymentDate: '2026-08-20T00:00:00.000Z', duration: 'QUARTERLY', coverageMonths: ['2026-06', '2026-07', '2026-08'], paymentMethod: 'UPI', status: 'ACTIVE', actorName: 'teacher' }],
};
const settle = () => new Promise(resolve => setTimeout(resolve, 30));

describe('BatchDetails month coverage', () => {
  let container: HTMLDivElement;
  let root: Root;
  let queryClient: QueryClient;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(searchEnrollmentCandidates).mockResolvedValue([]);
    apiRequest.mockResolvedValue(batch);
    loadSummary.mockResolvedValue(summary);
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, blob: async () => new Blob(['pdf']) }));
    vi.stubGlobal('URL', { createObjectURL: vi.fn(() => 'blob:pdf'), revokeObjectURL: vi.fn() });
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined);
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  });

  afterEach(() => {
    act(() => root.unmount());
    queryClient.clear();
    container.remove();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('shows per-student month progress without duplicating Fees dashboard history or legacy controls', async () => {
    await act(async () => root.render(<QueryClientProvider client={queryClient}><MemoryRouter initialEntries={['/batches/batch-1']}><Routes><Route path="/batches/:id" element={<BatchDetails />} /></Routes></MemoryRouter></QueryClientProvider>));
    await act(async () => { await settle(); });
    expect(container.textContent).toContain('2 / 12 months received');
    expect(container.textContent).toContain('August 2026 fee pending · overdue');
    expect(container.textContent).not.toContain('Recent fee history');
    expect(container.textContent).not.toContain('Fee Cols');
    expect(container.textContent).not.toContain('Custom Invoice');
  });

  it('lets the teacher choose configured student columns before downloading', async () => {
    await act(async () => root.render(<QueryClientProvider client={queryClient}><MemoryRouter initialEntries={['/batches/batch-1']}><Routes><Route path="/batches/:id" element={<BatchDetails />} /></Routes></MemoryRouter></QueryClientProvider>));
    await act(async () => { await settle(); });

    const downloadButton = Array.from(container.querySelectorAll('button')).find(button => button.textContent?.trim() === 'Download') as HTMLButtonElement;
    await act(async () => downloadButton.click());

    expect(document.body.textContent).toContain('Choose columns');
    const labels = Array.from(document.body.querySelectorAll('label'));
    for (const labelText of ['Student Name', 'Parent WhatsApp', 'Student Phone']) {
      const checkbox = labels.find(label => label.textContent?.includes(labelText))?.querySelector('input') as HTMLInputElement;
      expect(checkbox).not.toBeNull();
      await act(async () => checkbox.click());
    }

    const confirm = Array.from(document.body.querySelectorAll('button')).find(button => button.textContent?.includes('Download PDF')) as HTMLButtonElement;
    await act(async () => confirm.click());
    await act(async () => { await settle(); });

    expect(fetch).toHaveBeenCalledWith('/api/batches/batch-1/download?columns=studentName%2CparentWhatsapp%2Ccustom%3AstudentPhone', expect.any(Object));
  });

  it('lets the teacher choose a fee start month before inviting a new student', async () => {
    await act(async () => root.render(<QueryClientProvider client={queryClient}><MemoryRouter initialEntries={['/batches/batch-1']}><Routes><Route path="/batches/:id" element={<BatchDetails />} /></Routes></MemoryRouter></QueryClientProvider>));
    await act(async () => { await settle(); });

    const addStudent = Array.from(container.querySelectorAll('button')).find(button => button.textContent?.trim() === 'Add Student') as HTMLButtonElement;
    await act(async () => addStudent.click());
    expect(document.body.textContent).not.toContain('Create a separate student');
    const lookupInput = document.body.querySelector('input[role="searchbox"]') as HTMLInputElement;
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set?.call(lookupInput, '9876543210');
      lookupInput.dispatchEvent(new Event('input', { bubbles: true }));
    });
    for (let i = 0; i < 30 && !document.body.textContent?.includes('Create new student'); i++) {
      await act(async () => new Promise(resolve => setTimeout(resolve, 10)));
    }

    const createSeparate = Array.from(document.body.querySelectorAll('button')).find(button => button.textContent?.includes('Create new student')) as HTMLButtonElement;
    await act(async () => createSeparate.click());

    const phoneInput = document.body.querySelector('input[placeholder="10-digit number"]') as HTMLInputElement;
    const feeStartInput = document.body.querySelector('input[type="month"]') as HTMLInputElement;
    expect(feeStartInput).not.toBeNull();
    expect(feeStartInput.required).toBe(true);
    expect(feeStartInput.min).toBe('2026-06');
    expect(feeStartInput.max).toBe('2027-05');

    await act(async () => {
      const setValue = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
      expect(phoneInput.value).toBe('9876543210');
      setValue?.call(feeStartInput, '2026-08');
      feeStartInput.dispatchEvent(new Event('input', { bubbles: true }));
    });
    const submit = Array.from(document.body.querySelectorAll('button')).find(button => button.textContent?.includes('Confirm fees and send link')) as HTMLButtonElement;
    await act(async () => submit.click());
    await act(async () => { await settle(); });

    expect(sendRegistrationInvite).toHaveBeenCalledWith('batch-1', '9876543210', {
      mode: 'MONTH_COVERAGE',
      feeStartMonth: '2026-08',
    });
  });
});
