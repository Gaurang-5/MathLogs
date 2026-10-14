import { act } from 'react';
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
});
