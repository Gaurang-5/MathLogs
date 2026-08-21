import { describe, expect, it } from 'vitest';
import {
  availableDurations,
  formatCoverageRange,
  monthStatusCopy,
  overlapMessage,
  paymentPreviewCopy,
} from './monthCoverageViewModel';

describe('month coverage view model', () => {
  it('disables durations longer than remaining months', () => {
    expect(availableDurations(4).map(option => [option.value, option.disabled])).toEqual([
      ['MONTHLY', false], ['QUARTERLY', false], ['HALF_YEARLY', true], ['YEARLY', true],
    ]);
  });

  it('describes the exact preview months', () => {
    expect(paymentPreviewCopy(1000, 'QUARTERLY', ['2026-07', '2026-08', '2026-09']))
      .toBe('₹1,000 received · Quarterly · Covers July, August, and September 2026');
  });

  it('uses the approved overlap warning', () => {
    expect(overlapMessage('2026-09')).toBe('September 2026 fee has already been received. Please select another month.');
  });

  it('formats same-year and cross-year coverage ranges without timezone shifts', () => {
    expect(formatCoverageRange(['2026-07', '2026-08', '2026-09'])).toBe('July–September 2026');
    expect(formatCoverageRange(['2026-12', '2027-01'])).toBe('December 2026–January 2027');
  });

  it('describes received, overdue, pending, and setup-required months for teachers', () => {
    expect(monthStatusCopy('2026-09', 'RECEIVED')).toBe('September 2026 fee received');
    expect(monthStatusCopy('2026-09', 'OVERDUE')).toBe('September 2026 fee pending · overdue');
    expect(monthStatusCopy('2026-10', 'PENDING')).toBe('October 2026 fee pending');
    expect(monthStatusCopy(null, 'SETUP_REQUIRED')).toBe('Fee start month needs to be set');
  });
});
