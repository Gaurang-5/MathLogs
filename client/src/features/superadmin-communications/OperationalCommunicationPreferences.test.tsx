import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { OperationalCommunicationPreferences } from './OperationalCommunicationPreferences';

const apiMocks = vi.hoisted(() => ({ get: vi.fn(), update: vi.fn() }));
vi.mock('./api', () => ({ instituteCommunicationApi: apiMocks }));
vi.mock('react-hot-toast', () => ({ default: { success: vi.fn() } }));

const preference = {
  instituteId: 'institute-1',
  emailOperational: true,
  emailConsentedAt: new Date().toISOString(),
  whatsappOperational: false,
  whatsappConsentedAt: null,
  consentSource: 'INSTITUTE_SETTINGS',
  updatedAt: new Date().toISOString()
};

describe('OperationalCommunicationPreferences', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    apiMocks.get.mockReset().mockResolvedValue(preference);
    apiMocks.update.mockReset().mockImplementation(async value => ({ ...preference, ...value }));
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  it('loads and saves email and WhatsApp operational consent', async () => {
    await act(async () => { root.render(<OperationalCommunicationPreferences />); });
    const inputs = Array.from(container.querySelectorAll<HTMLInputElement>('input[type="checkbox"]'));

    expect(container.textContent).toContain('Operational communication consent');
    expect(inputs).toHaveLength(2);
    expect(inputs[0].checked).toBe(true);
    expect(inputs[1].checked).toBe(false);

    await act(async () => { inputs[1].click(); });
    expect(apiMocks.update).toHaveBeenCalledWith({ emailOperational: true, whatsappOperational: true });
  });

  it('shows a bounded load error without removing surrounding Settings content', async () => {
    apiMocks.get.mockRejectedValueOnce(new Error('Provider unavailable'));
    await act(async () => { root.render(<><span>Settings content</span><OperationalCommunicationPreferences /></>); });

    expect(container.textContent).toContain('Settings content');
    expect(container.textContent).toContain('Unable to load communication preferences');
  });
});
