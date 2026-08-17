import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { SupportRouteBoundary } from './App';

describe('Support route boundary', () => {
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

  it('redirects an institute Support URL to Settings while disabled', async () => {
    await act(async () => {
      root.render(<MemoryRouter initialEntries={['/support']}><Routes>
        <Route path="/support" element={<SupportRouteBoundary enabled={false} scope="institute"><div>Support page</div></SupportRouteBoundary>} />
        <Route path="/settings" element={<div>Settings page</div>} />
      </Routes></MemoryRouter>);
    });

    expect(container.textContent).toContain('Settings page');
    expect(container.textContent).not.toContain('Support page');
  });

  it('redirects a Superadmin Support URL home while disabled', async () => {
    await act(async () => {
      root.render(<MemoryRouter initialEntries={['/super-admin/support']}><Routes>
        <Route path="/super-admin/support" element={<SupportRouteBoundary enabled={false} scope="superadmin"><div>Support operations</div></SupportRouteBoundary>} />
        <Route path="/super-admin" element={<div>Operations home</div>} />
      </Routes></MemoryRouter>);
    });

    expect(container.textContent).toContain('Operations home');
    expect(container.textContent).not.toContain('Support operations');
  });

  it('renders Support content when explicitly enabled', async () => {
    await act(async () => {
      root.render(<MemoryRouter initialEntries={['/support']}><Routes>
        <Route path="/support" element={<SupportRouteBoundary enabled scope="institute"><div>Support page</div></SupportRouteBoundary>} />
      </Routes></MemoryRouter>);
    });

    expect(container.textContent).toContain('Support page');
  });
});
