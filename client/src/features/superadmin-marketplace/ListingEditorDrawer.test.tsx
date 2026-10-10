import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ListingEditorDrawer } from './ListingEditorDrawer';
import type { MarketplaceListingDetail } from './types';

const { api } = vi.hoisted(() => ({
  api: {
    getListing: vi.fn(), getActivity: vi.fn(), updateListing: vi.fn(),
  },
}));

vi.mock('./api', () => ({
  marketplaceApi: api,
  MarketplaceApiError: class MarketplaceApiError extends Error {
    status: number;
    latestListing?: MarketplaceListingDetail;
    constructor(message: string, status: number, latestListing?: MarketplaceListingDetail) {
      super(message);
      this.name = 'MarketplaceApiError';
      this.status = status;
      this.latestListing = latestListing;
    }
  },
}));

vi.mock('../../components/GooglePlaceConnectModal', () => ({
  GooglePlaceConnectModal: ({ isOpen }: { isOpen: boolean }) => isOpen ? <div data-testid="google-modal" /> : null,
}));

const listing: MarketplaceListingDetail = {
  id: 'listing-1', name: 'Apex Academy', isPubliclyListed: true, isVerified: false,
  city: 'Delhi',
  updatedAt: '2026-08-15T00:00:00.000Z',
};
const latest: MarketplaceListingDetail = {
  ...listing, name: 'Apex Academy, latest', updatedAt: '2026-08-15T01:00:00.000Z',
};

const flush = () => new Promise(resolve => setTimeout(resolve, 0));
const button = (container: HTMLElement, label: string) => Array.from(container.querySelectorAll('button')).find(item => item.textContent?.includes(label)) as HTMLButtonElement;

describe('ListingEditorDrawer conflict handling', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    vi.restoreAllMocks();
    api.getListing.mockResolvedValue(listing);
    api.getActivity.mockResolvedValue([]);
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  it('rebases a visible draft on the latest conflict timestamp before retrying save', async () => {
    api.updateListing
      .mockRejectedValueOnce(new (await import('./api')).MarketplaceApiError('Listing was updated by another operator', 409, latest))
      .mockResolvedValueOnce(latest);

    await act(async () => {
      root.render(<ListingEditorDrawer listingId="listing-1" onClose={vi.fn()} onChanged={vi.fn()} onDirtyChange={vi.fn()} />);
      await flush();
    });

    const name = container.querySelector('input')!;
    await act(async () => {
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
      setter?.call(name, 'My draft name');
      name.dispatchEvent(new Event('input', { bubbles: true }));
      await flush();
    });

    await act(async () => {
      button(container, 'Save changes').click();
      await flush();
    });
    expect(button(container, 'Rebase my draft')).toBeTruthy();

    await act(async () => {
      button(container, 'Rebase my draft').click();
      await flush();
    });
    await act(async () => {
      button(container, 'Save changes').click();
      await flush();
    });

    expect(api.updateListing).toHaveBeenLastCalledWith('listing-1', expect.objectContaining({
      name: 'My draft name',
      expectedUpdatedAt: '2026-08-15T01:00:00.000Z',
    }));
  });

  it('offers only canonical Muzaffarnagar in the city selector', async () => {
    await act(async () => {
      root.render(<ListingEditorDrawer listingId="listing-1" onClose={vi.fn()} onChanged={vi.fn()} onDirtyChange={vi.fn()} />);
      await flush();
    });

    const city = container.querySelector('select[name="marketplace-city"]') as HTMLSelectElement;
    expect(city).toBeTruthy();
    expect(city.value).toBe('Muzaffarnagar');
    expect(Array.from(city.options).map(option => option.value)).toEqual(['Muzaffarnagar']);
  });

  it('keeps a dirty editor open when discard is declined for close or Google sync', async () => {
    await act(async () => {
      root.render(<ListingEditorDrawer listingId="listing-1" onClose={vi.fn()} onChanged={vi.fn()} onDirtyChange={vi.fn()} />);
      await flush();
    });
    const name = container.querySelector('input')!;
    await act(async () => {
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
      setter?.call(name, 'Unsaved name');
      name.dispatchEvent(new Event('input', { bubbles: true }));
      await flush();
    });
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);

    await act(async () => {
      button(container, 'Sync Google').click();
      await flush();
    });
    expect(confirm).toHaveBeenCalledWith('Discard unsaved listing changes?');
    expect(container.querySelector('[data-testid="google-modal"]')).toBeNull();

    await act(async () => {
      button(container, 'Close').click();
      await flush();
    });
    expect(confirm).toHaveBeenCalledTimes(2);
    expect(container.querySelector('[aria-label="Apex Academy"]')).toBeTruthy();
  });

  it('clears dirty state after a successful save', async () => {
    api.updateListing.mockResolvedValue({ ...listing, name: 'Saved name', updatedAt: '2026-08-15T02:00:00.000Z' });
    await act(async () => {
      root.render(<ListingEditorDrawer listingId="listing-1" onClose={vi.fn()} onChanged={vi.fn()} onDirtyChange={vi.fn()} />);
      await flush();
    });
    const name = container.querySelector('input')!;
    await act(async () => {
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
      setter?.call(name, 'Saved name');
      name.dispatchEvent(new Event('input', { bubbles: true }));
      button(container, 'Save changes').click();
      await flush();
    });
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);

    await act(async () => {
      button(container, 'Sync Google').click();
      await flush();
    });
    expect(confirm).not.toHaveBeenCalled();
    expect(container.querySelector('[data-testid="google-modal"]')).toBeTruthy();
  });
});
