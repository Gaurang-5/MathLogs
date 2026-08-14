import type { LeadInquiry } from '@prisma/client';
import { prisma } from '../prisma';
import { normalizeMarketplacePhone } from './marketplaceClaimService';
import { sendLeadNotification, type LeadNotificationInput } from './marketplaceNotificationService';
import { writeMarketplaceAudit } from './marketplaceAuditService';
import type { TrackedWhatsAppEnqueueResult } from '../utils/whatsapp';

type LeadNotifier = (input: LeadNotificationInput) => Promise<TrackedWhatsAppEnqueueResult>;

export type CreateMarketplaceLeadInput = {
  instituteId: string;
  studentName: string;
  phone: string;
  subject?: string;
  classGrade?: string;
  message?: string;
};

export type LeadRoutingResult = { lead: LeadInquiry };

function leadError(code: string): Error {
  return new Error(code);
}

function notificationInput(lead: LeadInquiry, institute: {
  id: string;
  name: string;
  teacherName: string | null;
  whatsappPhone: string | null;
  phoneNumber: string | null;
}): LeadNotificationInput {
  const destination = institute.whatsappPhone || institute.phoneNumber;
  if (!destination) throw leadError('OWNER_PHONE_MISSING');
  const summary = [lead.classGrade, lead.subject].filter(Boolean).join(' · ') || 'General inquiry';
  const clientUrl = (process.env.CLIENT_URL || 'https://mathlogs.app').replace(/\/$/, '');
  return {
    phone: destination,
    ownerName: institute.teacherName || 'Teacher',
    instituteName: institute.name,
    studentName: lead.studentName,
    classSubjectSummary: summary,
    settingsUrl: `${clientUrl}/marketplace-settings`,
    instituteId: institute.id
  };
}

async function queueLead(
  lead: LeadInquiry,
  institute: Parameters<typeof notificationInput>[1],
  notify: LeadNotifier
): Promise<LeadInquiry> {
  let result: TrackedWhatsAppEnqueueResult;
  try {
    result = await notify(notificationInput(lead, institute));
  } catch (error: any) {
    result = { queued: false, error: error?.message || 'MARKETPLACE_LEAD_ENQUEUE_FAILED' };
  }
  return prisma.leadInquiry.update({
    where: { id: lead.id },
    data: {
      deliveryStatus: result.queued ? 'QUEUED' : 'FAILED',
      destinationPhone: institute.whatsappPhone || institute.phoneNumber,
      notificationJobId: result.jobId || null,
      notificationError: result.queued ? null : (result.error || 'MARKETPLACE_LEAD_ENQUEUE_FAILED').slice(0, 500)
    }
  });
}

export async function createMarketplaceLead(
  input: CreateMarketplaceLeadInput,
  notify: LeadNotifier = sendLeadNotification
): Promise<LeadRoutingResult> {
  const normalizedPhone = normalizeMarketplacePhone(input.phone);
  const institute = await prisma.institute.findUnique({
    where: { id: input.instituteId },
    select: { id: true, name: true, teacherName: true, whatsappPhone: true, phoneNumber: true, ownershipStatus: true }
  });
  if (!institute) throw leadError('INSTITUTE_NOT_FOUND');

  const duplicate = await prisma.leadInquiry.findFirst({
    where: {
      instituteId: input.instituteId,
      phone: normalizedPhone,
      createdAt: { gte: new Date(Date.now() - 15 * 60_000) }
    },
    orderBy: { createdAt: 'asc' }
  });

  let lead = await prisma.leadInquiry.create({
    data: {
      instituteId: input.instituteId,
      studentName: input.studentName.trim(),
      phone: normalizedPhone,
      subject: input.subject?.trim() || null,
      classGrade: input.classGrade?.trim() || null,
      message: input.message?.trim() || null,
      status: 'NEW',
      deliveryStatus: institute.ownershipStatus === 'CLAIMED' ? 'QUEUED' : 'HELD',
      destinationPhone: institute.ownershipStatus === 'CLAIMED' ? institute.whatsappPhone || institute.phoneNumber : null,
      possibleDuplicate: Boolean(duplicate),
      duplicateOfId: duplicate?.id || null
    }
  });

  if (institute.ownershipStatus === 'CLAIMED') lead = await queueLead(lead, institute, notify);
  return { lead };
}

export async function retryMarketplaceLeadNotification(
  input: { leadId: string; actorAdminId: string },
  notify: LeadNotifier = sendLeadNotification
): Promise<LeadInquiry> {
  const lead = await prisma.leadInquiry.findUnique({
    where: { id: input.leadId },
    include: { institute: { select: { id: true, name: true, teacherName: true, whatsappPhone: true, phoneNumber: true, ownershipStatus: true } } }
  });
  if (!lead) throw leadError('LEAD_NOT_FOUND');
  if (lead.institute.ownershipStatus !== 'CLAIMED') throw leadError('INSTITUTE_NOT_CLAIMED');
  if (lead.deliveryStatus !== 'FAILED') throw leadError('LEAD_NOT_RETRYABLE');

  const queued = await queueLead(lead, lead.institute, notify);
  const updated = await prisma.leadInquiry.update({
    where: { id: lead.id },
    data: { notificationRetryCount: { increment: 1 } }
  });
  await prisma.$transaction(async (tx) => writeMarketplaceAudit(tx, {
    action: 'LEAD_MESSAGE_RETRIED', entityType: 'LeadInquiry', entityId: lead.id,
    actorAdminId: input.actorAdminId, instituteId: lead.instituteId,
    before: { deliveryStatus: lead.deliveryStatus }, after: { deliveryStatus: queued.deliveryStatus }
  }));
  return updated;
}

export async function releaseMarketplaceLead(
  input: { leadId: string; actorAdminId: string },
  notify: LeadNotifier = sendLeadNotification
): Promise<LeadInquiry> {
  const lead = await prisma.leadInquiry.findUnique({
    where: { id: input.leadId },
    include: { institute: { select: { id: true, name: true, teacherName: true, whatsappPhone: true, phoneNumber: true, ownershipStatus: true } } }
  });
  if (!lead) throw leadError('LEAD_NOT_FOUND');
  if (lead.institute.ownershipStatus !== 'CLAIMED') throw leadError('INSTITUTE_NOT_CLAIMED');
  if (lead.deliveryStatus !== 'HELD') throw leadError('LEAD_NOT_HELD');

  const released = await prisma.leadInquiry.update({ where: { id: lead.id }, data: { releasedAt: new Date() } });
  const queued = await queueLead(released, lead.institute, notify);
  await prisma.$transaction(async (tx) => writeMarketplaceAudit(tx, {
    action: 'LEAD_RELEASED', entityType: 'LeadInquiry', entityId: lead.id,
    actorAdminId: input.actorAdminId, instituteId: lead.instituteId,
    before: { deliveryStatus: 'HELD' }, after: { deliveryStatus: queued.deliveryStatus }
  }));
  return queued;
}
