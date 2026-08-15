import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SuperAdminShell } from './SuperAdminShell';

vi.mock('./api', () => ({ superAdminShellApi: { search: vi.fn().mockResolvedValue([]) } }));

describe('SuperAdminShell', () => {
  let container: HTMLDivElement;
  let root: Root;
  beforeEach(() => { container = document.createElement('div'); document.body.appendChild(container); root = createRoot(container); });
  afterEach(() => { act(() => root.unmount()); container.remove(); });

  it('renders the grouped operations navigation and content', async () => {
    await act(async () => { root.render(<MemoryRouter initialEntries={['/super-admin']}><SuperAdminShell counts={{ support: 2 }}><div>Home content</div></SuperAdminShell></MemoryRouter>); });
    expect(container.querySelector('nav[aria-label="Operate Superadmin navigation"]')).toBeTruthy();
    expect(container.textContent).toContain('Institutes');
    expect(container.textContent).toContain('Revenue');
    expect(container.textContent).toContain('Support');
    expect(container.textContent).toContain('Home content');
  });
});
