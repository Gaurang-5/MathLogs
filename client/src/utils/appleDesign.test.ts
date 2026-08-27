import { describe, expect, it } from 'vitest';
import {
  appleSpringDefault,
  appleSpringMomentum,
  getApplePageTransition,
} from './appleDesign';

describe('teacher motion contract', () => {
  it('cross-fades instead of springing when reduced motion is requested', () => {
    expect(getApplePageTransition(true)).toEqual({
      duration: 0.16,
      ease: 'easeOut',
    });
  });

  it('uses the default critically damped spring otherwise', () => {
    expect(getApplePageTransition(false)).toBe(appleSpringDefault);
  });

  it('keeps bounce limited to momentum-driven interactions', () => {
    expect(appleSpringDefault.type).toBe('spring');
    expect(appleSpringMomentum.type).toBe('spring');
    expect(appleSpringMomentum.damping).toBeLessThan(
      appleSpringDefault.damping as number,
    );
  });
});
