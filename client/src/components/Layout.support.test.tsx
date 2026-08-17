import { beforeEach, describe, expect, it } from 'vitest';
import { getInstituteNavigation } from './layoutNavigation';
import { reconcileSupportSession } from '../features/superadmin-shell/supportSession';

describe('institute Support holdback', () => {
  beforeEach(() => sessionStorage.clear());

  it('omits Support navigation for every plan shape while disabled', () => {
    const planShapes = [
      { isPageOnly: true, isQuizOnly: false },
      { isPageOnly: false, isQuizOnly: true },
      { isPageOnly: false, isQuizOnly: false }
    ];

    for (const planShape of planShapes) {
      const names = getInstituteNavigation({ ...planShape, supportEnabled: false }).map(item => item.name);
      expect(names).not.toContain('Support');
      expect(names).toContain('Settings');
    }
  });

  it('restores Support navigation when explicitly enabled', () => {
    const names = getInstituteNavigation({ isPageOnly: false, isQuizOnly: false, supportEnabled: true }).map(item => item.name);
    expect(names).toContain('Support');
  });

  it('clears stale support-session context while disabled', () => {
    sessionStorage.setItem('superAdminSupportSession', JSON.stringify({ sessionId: 'session-1' }));
    reconcileSupportSession(false);
    expect(sessionStorage.getItem('superAdminSupportSession')).toBeNull();
  });
});
