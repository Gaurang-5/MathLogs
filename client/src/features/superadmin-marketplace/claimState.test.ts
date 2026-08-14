import { describe, expect, it } from 'vitest';
import { canSubmitClaimDecision, claimActionsForStatus } from './claimState';

describe('claim decision state', () => {
  it('allows contact and decisions only while a claim is open', () => {
    expect(claimActionsForStatus('NEW')).toEqual(['contact', 'approve', 'reject']);
    expect(claimActionsForStatus('CONTACTED')).toEqual(['approve', 'reject']);
    expect(claimActionsForStatus('REJECTED')).toEqual([]);
  });

  it('requires a trimmed internal verification note for approval', () => {
    expect(canSubmitClaimDecision('approve', { verificationNote: '   ', rejectionReason: '' })).toBe(false);
    expect(canSubmitClaimDecision('approve', { verificationNote: 'Called principal', rejectionReason: '' })).toBe(true);
  });

  it('requires both notes when rejecting a claim', () => {
    expect(canSubmitClaimDecision('reject', { verificationNote: 'Could not verify', rejectionReason: '' })).toBe(false);
    expect(canSubmitClaimDecision('reject', { verificationNote: 'Could not verify', rejectionReason: 'Phone proof did not match' })).toBe(true);
  });
});
