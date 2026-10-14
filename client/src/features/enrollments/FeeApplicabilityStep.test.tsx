import { describe, expect, it } from 'vitest';
import { defaultEnrollmentFeeChoice } from './FeeApplicabilityStep';

describe('defaultEnrollmentFeeChoice', () => {
  it('never silently applies existing current-due installments', () => {
    expect(defaultEnrollmentFeeChoice({ id: 'b1', name: 'Batch', coachingFeeMode: 'CURRENT_DUE_BASED', feeInstallments: [{ id: 'f1', name: 'April', amount: 1000 }] }))
      .toEqual({ mode: 'CURRENT_DUE_BASED', installmentIds: [] });
  });
});
