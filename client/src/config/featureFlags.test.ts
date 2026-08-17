import { describe, expect, it } from 'vitest';
import { parseSupportFeatureFlag } from './featureFlags';

describe('Support feature flag', () => {
  it('defaults closed and accepts only normalized true', () => {
    expect(parseSupportFeatureFlag(undefined)).toBe(false);
    expect(parseSupportFeatureFlag('false')).toBe(false);
    expect(parseSupportFeatureFlag('1')).toBe(false);
    expect(parseSupportFeatureFlag(' TRUE ')).toBe(true);
  });
});
