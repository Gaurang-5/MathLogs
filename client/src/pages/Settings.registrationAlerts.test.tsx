import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { RegistrationFormBuilder } from './Settings';

const apiMock = vi.hoisted(() => ({ get: vi.fn(), put: vi.fn() }));
vi.mock('../utils/api', () => ({ api: apiMock }));
vi.mock('react-hot-toast', () => ({ default: { success: vi.fn(), error: vi.fn() } }));

const flush = () => new Promise(resolve => setTimeout(resolve, 0));
describe('registration phone alerts', () => {
  let container: HTMLDivElement;
  let root: Root;
  beforeEach(() => {
    apiMock.get.mockResolvedValue({ config: { registrationForm: { fields: [
      { id: 'emergencyPhone', label: 'Emergency phone', type: 'tel', system: false, required: false, sendAlerts: false },
      { id: 'notes', label: 'Notes', type: 'text', system: false, required: false },
    ] } } });
    apiMock.put.mockResolvedValue({});
    container = document.createElement('div'); document.body.appendChild(container); root = createRoot(container);
  });
  afterEach(() => { act(() => root.unmount()); container.remove(); vi.clearAllMocks(); });

  it('persists sendAlerts for a custom phone field and hides it for text fields', async () => {
    await act(async () => root.render(<RegistrationFormBuilder />));
    await act(async () => { await flush(); });
    expect(container.textContent).not.toContain('Send alerts to this number');
    const phoneRow = Array.from(container.querySelectorAll('.bg-gray-50')).find(row => row.textContent?.includes('Emergency phone')) as HTMLElement;
    await act(async () => (phoneRow.querySelector('button[title="Edit Field"]') as HTMLButtonElement).click());
    const alertCheckbox = Array.from(container.querySelectorAll('label')).find(label => label.textContent?.includes('Send alerts to this number'))?.querySelector('input') as HTMLInputElement;
    expect(alertCheckbox).not.toBeNull();
    await act(async () => alertCheckbox.click());
    await act(async () => Array.from(container.querySelectorAll('button')).find(button => button.textContent?.trim() === 'Save')?.click());
    await act(async () => Array.from(container.querySelectorAll('button')).find(button => button.textContent?.trim() === 'Save Form')?.click());
    await act(async () => { await flush(); });
    expect(apiMock.put).toHaveBeenCalledWith('/institute/me/config', expect.objectContaining({
      registrationForm: { fields: expect.arrayContaining([expect.objectContaining({ label: 'Emergency phone', type: 'tel', sendAlerts: true })]) },
    }));
    const saved = apiMock.put.mock.calls[0][1].registrationForm.fields;
    expect(saved.find((field: { id: string }) => field.id === 'notes')).not.toHaveProperty('sendAlerts');
  });
});
