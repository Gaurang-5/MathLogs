import {
  enqueueWhatsAppTracked,
  type TrackedWhatsAppEnqueueResult
} from '../utils/whatsapp';

type Enqueue = typeof enqueueWhatsAppTracked;

export type ClaimApprovalNotificationInput = {
  phone: string;
  claimantName: string;
  instituteName: string;
  loginUrl: string;
  instituteId: string;
};

export type ClaimRejectionNotificationInput = {
  phone: string;
  claimantName: string;
  instituteName: string;
  rejectionReason: string;
  supportUrl: string;
  instituteId: string;
};

export type LeadNotificationInput = {
  phone: string;
  ownerName: string;
  instituteName: string;
  studentName: string;
  classSubjectSummary: string;
  settingsUrl: string;
  instituteId: string;
};

export async function sendClaimApprovalNotification(
  input: ClaimApprovalNotificationInput,
  enqueue: Enqueue = enqueueWhatsAppTracked
): Promise<TrackedWhatsAppEnqueueResult> {
  const template = process.env.WHATSAPP_TEMPLATE_MARKETPLACE_CLAIM_APPROVED;
  if (!template) return { queued: false, error: 'CLAIM_APPROVAL_TEMPLATE_NOT_CONFIGURED' };
  return enqueue(input.phone, template, [input.claimantName, input.instituteName, input.loginUrl], input.instituteId);
}

export async function sendClaimRejectionNotification(
  input: ClaimRejectionNotificationInput,
  enqueue: Enqueue = enqueueWhatsAppTracked
): Promise<TrackedWhatsAppEnqueueResult> {
  const template = process.env.WHATSAPP_TEMPLATE_MARKETPLACE_CLAIM_REJECTED;
  if (!template) return { queued: false, error: 'CLAIM_REJECTION_TEMPLATE_NOT_CONFIGURED' };
  return enqueue(input.phone, template, [input.claimantName, input.instituteName, input.rejectionReason, input.supportUrl], input.instituteId);
}

export async function sendLeadNotification(
  input: LeadNotificationInput,
  enqueue: Enqueue = enqueueWhatsAppTracked
): Promise<TrackedWhatsAppEnqueueResult> {
  const template = process.env.WHATSAPP_TEMPLATE_MARKETPLACE_LEAD;
  if (!template) return { queued: false, error: 'MARKETPLACE_LEAD_TEMPLATE_NOT_CONFIGURED' };
  return enqueue(input.phone, template, [
    input.ownerName,
    input.instituteName,
    input.studentName,
    input.classSubjectSummary,
    input.settingsUrl
  ], input.instituteId);
}
