const discardMessage = 'Discard unsaved listing changes?';

export const canDiscardListingChanges = (
  isDirty: boolean,
  confirmDiscard: (message: string) => boolean = message => window.confirm(message),
) => !isDirty || confirmDiscard(discardMessage);

export const canSwitchMarketplaceSection = (
  isDirty: boolean,
  currentSearch: string,
  nextSearch: string,
  confirmDiscard: (message: string) => boolean = message => window.confirm(message),
) => {
  const currentSection = new URLSearchParams(currentSearch).get('section') || 'overview';
  const nextSection = new URLSearchParams(nextSearch).get('section') || 'overview';
  return currentSection === nextSection || canDiscardListingChanges(isDirty, confirmDiscard);
};
