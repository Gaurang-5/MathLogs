import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it } from 'vitest';
import { SubscriptionStatusCard, type SubscriptionStatus } from './SubscriptionStatusCard';

describe('SubscriptionStatusCard', () => {
  let container: HTMLDivElement;

  afterEach(() => container?.remove());

  it('shows pending payment and the grace deadline without claiming payment succeeded', async () => {
    const status: SubscriptionStatus = {
      status: 'PENDING',
      plan: 'ENTERPRISE',
      amountPaise: 49_900,
      nextChargeAt: null,
      currentPeriodEnd: '2026-09-01T00:00:00.000Z',
      graceEndsAt: '2026-09-04T00:00:00.000Z',
      cancelAtPeriodEnd: false,
      cancelEffectiveAt: null,
    };
    container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);

    await act(async () => root.render(<SubscriptionStatusCard subscription={status} onCancel={() => undefined} />));

    expect(container.textContent).toContain('Retrying payment');
    expect(container.textContent).toContain('4 Sept 2026');
    expect(container.textContent).not.toContain('Payment successful');
    act(() => root.unmount());
  });
});
