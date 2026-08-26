import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import SetupAccount from './SetupAccount';

const { axiosMock } = vi.hoisted(() => ({
  axiosMock: { get: vi.fn(), post: vi.fn(), isAxiosError: vi.fn(() => false) },
}));

vi.mock('axios', () => ({ default: axiosMock }));
vi.mock('framer-motion', async () => {
  const React = await import('react');
  const element = (tag: 'div' | 'form' | 'button') => ({ children, initial: _initial, animate: _animate, exit: _exit, transition: _transition, whileTap: _whileTap, ...props }: Record<string, unknown>) =>
    React.createElement(tag, props, children as React.ReactNode);
  return {
    AnimatePresence: ({ children }: { children: React.ReactNode }) => children,
    motion: { div: element('div'), form: element('form'), button: element('button') },
  };
});

const flush = () => new Promise(resolve => setTimeout(resolve, 0));
const button = (container: HTMLElement, label: string) => Array.from(container.querySelectorAll('button'))
  .find(item => item.textContent?.includes(label)) as HTMLButtonElement;

describe('SetupAccount fee-system selection', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    vi.clearAllMocks();
    axiosMock.get.mockResolvedValue({ data: { instituteName: 'Apex Academy' } });
    axiosMock.post.mockResolvedValue({ data: { success: true, adminId: 'admin-1', token: 'token-1', refreshToken: 'refresh-1' } });
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  it('defaults to the current system and posts the selected exact enum', async () => {
    await act(async () => {
      root.render(<MemoryRouter initialEntries={['/setup?token=invite-1']}><SetupAccount /></MemoryRouter>);
      await flush();
    });

    const current = button(container, 'Current amount-due system');
    const month = button(container, 'Month coverage system');
    expect(current.getAttribute('aria-pressed')).toBe('true');
    expect(month.getAttribute('aria-pressed')).toBe('false');

    await act(async () => {
      month.click();
      button(container, 'No').click();
      await flush();
    });
    await act(async () => {
      (container.querySelector('form') as HTMLFormElement).dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
      await flush();
    });

    expect(axiosMock.post).toHaveBeenCalledWith('/api/auth/setup-account', expect.objectContaining({
      coachingFeeMode: 'MONTH_COVERAGE',
    }));
  });
});
