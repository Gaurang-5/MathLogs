import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import StudentPaymentPortal from './StudentPaymentPortal';

const { axiosMock } = vi.hoisted(() => ({ axiosMock: { get: vi.fn(), post: vi.fn(), isAxiosError: vi.fn((error: unknown) => Boolean(error && typeof error === 'object' && 'response' in error)) } }));
vi.mock('axios', () => ({ default: axiosMock }));

const settle = () => new Promise(resolve => setTimeout(resolve, 30));

describe('StudentPaymentPortal month coverage', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    vi.clearAllMocks();
    axiosMock.get.mockImplementation(async (url: string) => {
      if (url.includes('student-fees')) throw { response: { status: 403, data: { error: 'PARENT_PAYMENTS_DISABLED_FOR_MONTH_COVERAGE' } } };
      return { data: { name: 'Apex Academy', logoUrl: null } };
    });
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  it('shows a neutral teacher-recorded message and no parent payment controls', async () => {
    await act(async () => root.render(<MemoryRouter initialEntries={['/pay/apex?phone=9999999999']}><Routes><Route path="/pay/:slug" element={<StudentPaymentPortal />} /></Routes></MemoryRouter>));
    await act(async () => { await settle(); });
    expect(container.textContent).toContain('Fee payments for this coaching are recorded by the teacher. Please contact the coaching directly.');
    expect(container.textContent).not.toContain('Upload Payment Screenshot');
    expect(container.querySelector('input[type="file"]')).toBeNull();
    expect(container.querySelector('input[type="number"]')).toBeNull();
  });
});
