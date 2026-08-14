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
  claimId: string;
};

export type ClaimRejectionNotificationInput = {
  phone: string;
  claimantName: string;
  instituteName: string;
  rejectionReason: string;
  supportUrl: string;
  instituteId: string;
  claimId: string;
};

export type LeadNotificationInput = {
  phone: string;
  ownerName: string;
  instituteName: string;
  studentName: string;
  classSubjectSummary: string;
  settingsUrl: string;
  instituteId: string;
  leadId: string;
};

function marketplaceConfigurationError(template: string | undefined, templateError: string): string | undefined {
  if (!template?.trim()) return templateError;
  if (!process.env.WHATSAPP_PHONE_NUMBER_ID?.trim() || !process.env.WHATSAPP_ACCESS_TOKEN?.trim()) {
    return 'WHATSAPP_CREDENTIALS_NOT_CONFIGURED';
  }
  return undefined;
}

export async function sendClaimApprovalNotification(
  input: ClaimApprovalNotificationInput,
  enqueue: Enqueue = enqueueWhatsAppTracked
): Promise<TrackedWhatsAppEnqueueResult> {
  const template = process.env.WHATSAPP_TEMPLATE_MARKETPLACE_CLAIM_APPROVED?.trim();
  const error = marketplaceConfigurationError(template, 'CLAIM_APPROVAL_TEMPLATE_NOT_CONFIGURED');
  if (error) return { queued: false, error };
  return enqueue(input.phone, template!, [input.claimantName, input.instituteName, input.loginUrl], input.instituteId, {
    marketplaceEntityType: 'MarketplaceClaim', marketplaceEntityId: input.claimId
  });
}

export async function sendClaimRejectionNotification(
  input: ClaimRejectionNotificationInput,
  enqueue: Enqueue = enqueueWhatsAppTracked
): Promise<TrackedWhatsAppEnqueueResult> {
  const template = process.env.WHATSAPP_TEMPLATE_MARKETPLACE_CLAIM_REJECTED?.trim();
  const error = marketplaceConfigurationError(template, 'CLAIM_REJECTION_TEMPLATE_NOT_CONFIGURED');
  if (error) return { queued: false, error };
  return enqueue(input.phone, template!, [input.claimantName, input.instituteName, input.rejectionReason, input.supportUrl], input.instituteId, {
    marketplaceEntityType: 'MarketplaceClaim', marketplaceEntityId: input.claimId
  });
}

export async function sendLeadNotification(
  input: LeadNotificationInput,
  enqueue: Enqueue = enqueueWhatsAppTracked
): Promise<TrackedWhatsAppEnqueueResult> {
  const template = process.env.WHATSAPP_TEMPLATE_MARKETPLACE_LEAD?.trim();
  const error = marketplaceConfigurationError(template, 'MARKETPLACE_LEAD_TEMPLATE_NOT_CONFIGURED');
  if (error) return { queued: false, error };
  return enqueue(input.phone, template!, [
    input.ownerName,
    input.instituteName,
    input.studentName,
    input.classSubjectSummary,
    input.settingsUrl
  ], input.instituteId, {
    marketplaceEntityType: 'LeadInquiry', marketplaceEntityId: input.leadId
  });
}
