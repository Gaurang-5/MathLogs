import { describe, expect, it } from 'vitest';
import { installedInstituteTabs } from './InstituteWorkspace';

describe('Institute workspace contract', () => {
  it('registers all eight approved workspace tabs', () => {
    expect(Object.keys(installedInstituteTabs)).toEqual(['overview', 'account', 'usage', 'billing', 'marketplace', 'leads', 'support', 'activity']);
  });
});
