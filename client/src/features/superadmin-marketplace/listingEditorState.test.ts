import { describe, expect, it, vi } from 'vitest';
import { canDiscardListingChanges, canSwitchMarketplaceSection } from './listingEditorState';

describe('listing editor dirty-state guard', () => {
  it('allows a clean editor to continue without asking for confirmation', () => {
    const confirmDiscard = vi.fn();

    expect(canDiscardListingChanges(false, confirmDiscard)).toBe(true);
    expect(confirmDiscard).not.toHaveBeenCalled();
  });

  it('stops a dirty editor action when discarding is declined', () => {
    const confirmDiscard = vi.fn(() => false);

    expect(canDiscardListingChanges(true, confirmDiscard)).toBe(false);
    expect(confirmDiscard).toHaveBeenCalledWith('Discard unsaved listing changes?');
  });

  it('stops URL-driven section changes when a dirty editor declines discard', () => {
    const confirmDiscard = vi.fn(() => false);

    expect(canSwitchMarketplaceSection(true, '?section=listings', '?section=claims', confirmDiscard)).toBe(false);
    expect(confirmDiscard).toHaveBeenCalledWith('Discard unsaved listing changes?');
  });
});
