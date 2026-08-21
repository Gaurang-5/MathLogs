import { describe, expect, it } from 'vitest';
import { buildCreateBatchPayload } from './batchForm';

const base = {
  customName: 'Target 2027',
  subject: 'Math',
  timeSlot: '4 PM',
  className: 'Class 10',
  startDate: '2026-06-01',
  endDate: '2027-03-31',
};

describe('month coverage batch form', () => {
  it('preserves the legacy payload without introducing date fields', () => {
    expect(buildCreateBatchPayload(base, 'CURRENT_DUE_BASED', true)).toEqual({
      customName: 'Target 2027', subject: 'Math', timeSlot: '4 PM', feeAmount: 0, className: 'Class 10',
    });
  });

  it('adds canonical batch boundaries only for month coverage', () => {
    expect(buildCreateBatchPayload(base, 'MONTH_COVERAGE', true)).toEqual({
      customName: 'Target 2027', subject: 'Math', timeSlot: '4 PM', feeAmount: 0, className: 'Class 10',
      startDate: '2026-06-01T00:00:00.000Z', endDate: '2027-03-31T23:59:59.999Z',
    });
  });
});
