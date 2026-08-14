/**
 * Global Mobile Virtual Keyboard Avoidance Helper
 * Solves the mobile web UX bug where soft virtual keyboards on iOS/Android cover inputs
 * located in the lower half of the screen.
 */
export function initMobileKeyboardFix() {
  if (typeof window === 'undefined') return;

  const isTouchDevice = 'ontouchstart' in window || navigator.maxTouchPoints > 0 || window.innerWidth <= 1024;

  if (!isTouchDevice) return;

  // Listen to focusin events globally on form controls
  document.addEventListener(
    'focusin',
    (event: FocusEvent) => {
      const target = event.target as HTMLElement | null;
      if (!target) return;

      const isInput =
        target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.tagName === 'SELECT' ||
        target.isContentEditable;

      if (!isInput) return;

      // Ignore non-text inputs (checkbox, radio, button, etc.)
      const inputType = (target as HTMLInputElement).type?.toLowerCase();
      if (['checkbox', 'radio', 'button', 'submit', 'image', 'color', 'file'].includes(inputType)) {
        return;
      }

      // Wait for the virtual software keyboard slide-up animation to complete (~300ms)
      setTimeout(() => {
        try {
          target.scrollIntoView({
            behavior: 'smooth',
            block: 'center',
            inline: 'nearest'
          });
        } catch {
          target.scrollIntoView(false);
        }
      }, 300);
    },
    { capture: true, passive: true }
  );

  // Handle Visual Viewport API for dynamic keyboard size shifts
  if (window.visualViewport) {
    let resizeTimer: any = null;

    window.visualViewport.addEventListener('resize', () => {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(() => {
        const activeEl = document.activeElement as HTMLElement | null;
        if (
          activeEl &&
          (activeEl.tagName === 'INPUT' ||
            activeEl.tagName === 'TEXTAREA' ||
            activeEl.tagName === 'SELECT' ||
            activeEl.isContentEditable)
        ) {
          try {
            activeEl.scrollIntoView({
              behavior: 'smooth',
              block: 'center',
              inline: 'nearest'
            });
          } catch {
            activeEl.scrollIntoView(false);
          }
        }
      }, 150);
    });
  }
}
