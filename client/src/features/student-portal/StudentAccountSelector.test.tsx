import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import StudentPortalLogin from '../../pages/StudentPortalLogin';

const mocks = vi.hoisted(() => ({ apiRequest: vi.fn(), navigate: vi.fn() }));
vi.mock('../../utils/api', () => ({ apiRequest: mocks.apiRequest }));
vi.mock('../../hooks/useMetaTags', () => ({ useMetaTags: vi.fn() }));
vi.mock('react-router-dom', async importOriginal => ({
  ...await importOriginal<typeof import('react-router-dom')>(),
  useParams: () => ({ instituteSlug: 'demo' }),
  useNavigate: () => mocks.navigate,
}));

async function waitForText(container: HTMLElement, text: string) {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    if (container.textContent?.includes(text)) return;
    await act(async () => new Promise(resolve => setTimeout(resolve, 10)));
  }
  throw new Error(`Timed out waiting for ${text}`);
}

function enterValue(input: HTMLInputElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
  setter?.call(input, value);
  input.dispatchEvent(new Event('input', { bubbles: true }));
}

describe('shared-phone student login', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    localStorage.clear();
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    mocks.apiRequest.mockImplementation(async (path: string) => {
      if (path.includes('/branding/')) return { name: 'Demo Academy', logoUrl: null, primaryColor: null };
      if (path === '/student-portal/login') return { success: true, requiresOtp: true, message: 'OTP sent', student: { instituteName: 'Demo Academy' } };
      if (path === '/student-portal/verify-login-otp') return {
        success: true,
        selectionToken: 'selection-token',
        students: [
          { id: 's1', humanId: 'ML-001', name: 'Riya', activeBatchNames: ['Class 10 Boys'] },
          { id: 's2', humanId: 'ML-002', name: 'Siya', activeBatchNames: ['Class 8 Girls'] },
        ],
      };
      if (path === '/student-portal/select-account') return { token: 'student-specific-token', student: { id: 's1', name: 'Riya' } };
      throw new Error(`Unexpected request ${path}`);
    });
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    vi.clearAllMocks();
  });

  it('stores a student token only after the parent chooses an account', async () => {
    await act(async () => root.render(<StudentPortalLogin />));
    const phone = container.querySelector('input[type="tel"]') as HTMLInputElement;
    await act(async () => enterValue(phone, '9876543210'));
    await act(async () => container.querySelector('form')?.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })));
    await waitForText(container, 'Verify WhatsApp OTP');

    const otpInputs = Array.from(container.querySelectorAll('input[inputmode="numeric"]')) as HTMLInputElement[];
    for (let index = 0; index < 6; index += 1) {
      await act(async () => enterValue(otpInputs[index], String(index + 1)));
    }
    await act(async () => container.querySelector('form')?.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })));

    await waitForText(container, 'Choose student');
    expect(localStorage.getItem('student_token_demo')).toBeNull();
    const riya = Array.from(container.querySelectorAll('button')).find(button => /riya.*class 10 boys/i.test(button.textContent || ''));
    await act(async () => riya?.click());

    expect(localStorage.getItem('student_token_demo')).toBe('student-specific-token');
    expect(mocks.navigate).toHaveBeenCalledWith('/demo/student/dashboard');
  });
});
