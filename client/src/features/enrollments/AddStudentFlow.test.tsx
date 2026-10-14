import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AddStudentFlow } from './AddStudentFlow';

const apiMocks = vi.hoisted(() => ({
  searchEnrollmentCandidates: vi.fn(), previewEnrollment: vi.fn(), enrollExisting: vi.fn(),
  resendEnrollmentNotification: vi.fn(), sendRegistrationInvite: vi.fn(),
}));
vi.mock('./api', () => apiMocks);

async function waitForText(container: HTMLElement, text: string) {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    if (container.textContent?.includes(text)) return;
    await act(async () => new Promise(resolve => setTimeout(resolve, 10)));
  }
  throw new Error(`Timed out waiting for ${text}`);
}

describe('AddStudentFlow', () => {
  let container: HTMLDivElement;
  let root: Root;
  beforeEach(() => {
    container = document.createElement('div'); document.body.appendChild(container); root = createRoot(container);
    apiMocks.searchEnrollmentCandidates.mockResolvedValue([{
      studentId: 's1', humanId: 'MB-MTH26-049', name: 'Riya', parentName: 'Asha', parentWhatsapp: '9876543210',
      schoolName: 'DPS', currentBatches: [], previousBatches: [{ id: 'old', name: 'Old batch' }], balance: 0, matchReasons: ['PARENT_PHONE'],
    }]);
  });
  afterEach(() => { act(() => root.unmount()); container.remove(); vi.clearAllMocks(); });

  it('does not reuse a candidate until the teacher explicitly selects it', async () => {
    await act(async () => root.render(<QueryClientProvider client={new QueryClient()}><AddStudentFlow
      batch={{ id: 'b1', name: 'Class 10', coachingFeeMode: 'CURRENT_DUE_BASED', feeInstallments: [] }}
      onClose={vi.fn()} onComplete={vi.fn()} /></QueryClientProvider>));
    expect(container.textContent).not.toContain('Create a separate student');
    const search = container.querySelector('[role="searchbox"]') as HTMLInputElement;
    await act(async () => {
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
      setter?.call(search, '9876543210'); search.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await waitForText(container, 'MB-MTH26-049');
    expect(apiMocks.searchEnrollmentCandidates).toHaveBeenCalledWith('b1', '9876543210');
    expect(container.textContent).toContain('MB-MTH26-049');
    expect(apiMocks.enrollExisting).not.toHaveBeenCalled();
    await act(async () => Array.from(container.querySelectorAll('button')).find(button => button.textContent?.includes('Create a separate student'))?.click());
    expect((container.querySelector('[aria-label="Student WhatsApp"]') as HTMLInputElement).value).toBe('9876543210');
    await act(async () => Array.from(container.querySelectorAll('button')).find(button => button.textContent === 'Back')?.click());
    await waitForText(container, 'MB-MTH26-049');
    await act(async () => Array.from(container.querySelectorAll('button')).find(button => button.textContent?.includes('Use existing profile'))?.click());
    expect(container.textContent).toContain('Apply installments');
    expect(apiMocks.enrollExisting).not.toHaveBeenCalled();
  });
});
