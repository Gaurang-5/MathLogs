import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { StudentFeeStartDialog } from './StudentFeeStartDialog';

const flush = () => new Promise(resolve => setTimeout(resolve, 0));

function setInput(input: HTMLInputElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
  setter?.call(input, value);
  input.dispatchEvent(new Event('input', { bubbles: true }));
}

describe('StudentFeeStartDialog', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  it('shows and confirms the teacher-visible default month for a pre-batch admission', async () => {
    const onConfirm = vi.fn().mockResolvedValue(undefined);
    await act(async () => {
      root.render(
        <StudentFeeStartDialog
          student={{ id: 'student-1', name: 'Aarav', joinedAt: '2026-05-21T10:00:00.000Z' }}
          batch={{ startDate: '2026-06-01T00:00:00.000Z', endDate: '2027-03-31T00:00:00.000Z' }}
          defaultMonth="2026-06"
          onConfirm={onConfirm}
          onClose={vi.fn()}
        />,
      );
    });

    const month = container.querySelector('input[type="month"]') as HTMLInputElement;
    expect(month.value).toBe('2026-06');
    expect(container.textContent).toContain('June 2026');

    await act(async () => {
      Array.from(container.querySelectorAll('button')).find(button => button.textContent?.includes('Confirm fee start'))?.click();
      await flush();
    });
    expect(onConfirm).toHaveBeenCalledWith('2026-06');
  });

  it('warns about teacher-selected backdating before the join month but permits confirmation', async () => {
    const onConfirm = vi.fn().mockResolvedValue(undefined);
    await act(async () => {
      root.render(
        <StudentFeeStartDialog
          student={{ id: 'student-2', name: 'Diya', joinedAt: '2026-09-12T10:00:00.000Z' }}
          batch={{ startDate: '2026-06-01T00:00:00.000Z', endDate: '2027-03-31T00:00:00.000Z' }}
          defaultMonth="2026-09"
          onConfirm={onConfirm}
          onClose={vi.fn()}
        />,
      );
    });

    const month = container.querySelector('input[type="month"]') as HTMLInputElement;
    await act(async () => setInput(month, '2026-08'));
    expect(container.textContent).toContain('before the student joined');

    await act(async () => {
      Array.from(container.querySelectorAll('button')).find(button => button.textContent?.includes('Confirm fee start'))?.click();
      await flush();
    });
    expect(onConfirm).toHaveBeenCalledWith('2026-08');
  });
});
