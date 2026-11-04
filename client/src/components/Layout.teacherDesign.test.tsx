import { act } from 'react';
import { createPortal } from 'react-dom';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import Layout from './Layout';

vi.mock('../utils/api', () => ({
  api: {
    get: vi.fn().mockResolvedValue({
      quizCredits: 3,
      coachingFeeMode: 'CURRENT_DUE_BASED',
    }),
  },
}));

describe('authenticated teacher shell', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    localStorage.clear();
    Object.defineProperty(window, 'matchMedia', {
      configurable: true,
      value: vi.fn().mockImplementation((query: string) => ({
        matches: false,
        media: query,
        onchange: null,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        addListener: vi.fn(),
        removeListener: vi.fn(),
        dispatchEvent: vi.fn(),
      })),
    });
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
  });

  it('labels its navigation and icon-only controls', async () => {
    await act(async () => {
      root.render(
        <MemoryRouter initialEntries={['/dashboard']}>
          <Layout title="Dashboard"><p>Teacher content</p></Layout>
        </MemoryRouter>,
      );
    });

    expect(container.querySelector('[data-teacher-shell]')).not.toBeNull();
    expect(container.querySelector('nav[aria-label="Primary teacher navigation"]')).not.toBeNull();
    expect(container.querySelector('button[aria-label="Open navigation menu"]')).not.toBeNull();
    expect(container.querySelector('button[aria-label="Record fee payment"]')).not.toBeNull();
    expect(container.querySelector('a[aria-current="page"]')?.getAttribute('href')).toBe('/dashboard');
  });

  const touch = async (target: Element, type: string, y: number) => {
    const event = new Event(type, { bubbles: true });
    Object.defineProperty(event, 'touches', { value: [{ clientY: y }] });
    await act(async () => target.dispatchEvent(event));
  };

  it('ignores scrolling in a portalled marks review dialog', async () => {
    await act(async () => root.render(
      <MemoryRouter><Layout>{createPortal(
        <div role="dialog" aria-modal="true"><div data-review>Scanned marks</div></div>, document.body,
      )}</Layout></MemoryRouter>,
    ));
    const review = document.querySelector('[data-review]')!;
    const indicator = container.querySelector('main > div') as HTMLElement;
    await touch(review, 'touchstart', 100);
    await touch(review, 'touchmove', 300);
    expect(indicator.style.height).toBe('0px');
    await touch(review, 'touchend', 300);
    expect(document.querySelector('[data-review]')?.textContent).toBe('Scanned marks');
  });

  it('disables pull to refresh throughout an active scan session', async () => {
    await act(async () => root.render(
      <MemoryRouter><Layout disablePullToRefresh><p>Scanning</p></Layout></MemoryRouter>,
    ));
    const main = container.querySelector('main')!;
    await touch(main, 'touchstart', 100);
    await touch(main, 'touchmove', 300);
    expect((main.firstElementChild as HTMLElement).style.height).toBe('0px');
    await touch(main, 'touchend', 300);
  });

  it('clears a refresh gesture on reversal or cancellation', async () => {
    await act(async () => root.render(<MemoryRouter><Layout><p>Content</p></Layout></MemoryRouter>));
    const main = container.querySelector('main')!;
    const indicator = main.firstElementChild as HTMLElement;
    await touch(main, 'touchstart', 100);
    await touch(main, 'touchmove', 300);
    expect(indicator.style.height).toBe('80px');
    await touch(main, 'touchmove', 90);
    expect(indicator.style.height).toBe('0px');
    await touch(main, 'touchend', 90);
    await touch(main, 'touchstart', 100);
    await touch(main, 'touchmove', 300);
    await touch(main, 'touchcancel', 300);
    expect(indicator.style.height).toBe('0px');
    await touch(main, 'touchend', 300);
  });
});
