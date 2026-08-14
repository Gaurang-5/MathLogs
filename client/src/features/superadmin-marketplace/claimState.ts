import type { ClaimStatus } from './types';

export type ClaimDecision = 'approve' | 'reject';
export interface ClaimDecisionInput { verificationNote: string; rejectionReason: string; }

export const claimActionsForStatus = (status: ClaimStatus) => {
  if (status === 'NEW') return ['contact', 'approve', 'reject'] as const;
  if (status === 'CONTACTED') return ['approve', 'reject'] as const;
  return [] as const;
};

export const canSubmitClaimDecision = (decision: ClaimDecision, values: ClaimDecisionInput) => Boolean(values.verificationNote.trim())
  && (decision === 'approve' || Boolean(values.rejectionReason.trim()));
