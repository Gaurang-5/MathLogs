import type { LeadInquiry } from '@prisma/client';
import { prisma } from '../prisma';
import { normalizeMarketplacePhone } from './marketplaceClaimService';
import { sendLeadNotification, type LeadNotificationInput } from './marketplaceNotificationService';
import { writeMarketplaceAudit } from './marketplaceAuditService';
import {
  enqueueWhatsAppTracked,
  type MarketplaceWhatsAppTracking,
  type TrackedWhatsAppEnqueueResult
} from '../utils/whatsapp';

type LeadNotifier = (
  input: LeadNotificationInput,
  enqueue?: typeof enqueueWhatsAppTracked
) => Promise<TrackedWhatsAppEnqueueResult>;

const LEGACY_CLAIM_MARKER = '[CLAIM REQUEST]';

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
    instituteId: institute.id,
    leadId: lead.id
  };
}

async function queueLead(input: {
  leadId: string;
  mode: 'CREATE' | 'RETRY' | 'RELEASE';
  actorAdminId?: string;
},
  notify: LeadNotifier
): Promise<LeadInquiry> {
  return prisma.$transaction(async (tx) => {
    const before = await tx.leadInquiry.findFirst({
      where: { id: input.leadId, NOT: { studentName: { startsWith: LEGACY_CLAIM_MARKER } } },
      include: {
        institute: {
          select: {
            id: true, name: true, teacherName: true, whatsappPhone: true,
            phoneNumber: true, ownershipStatus: true
          }
        }
      }
    });
    if (!before) throw leadError('LEAD_NOT_FOUND');
    if (before.institute.ownershipStatus !== 'CLAIMED') throw leadError('INSTITUTE_NOT_CLAIMED');

    const eligibility = input.mode === 'RELEASE'
      ? { deliveryStatus: 'HELD' }
      : {
          OR: [
            { deliveryStatus: 'FAILED' },
            { deliveryStatus: 'QUEUED', notificationJobId: null }
          ]
        };
    const transition = await tx.leadInquiry.updateMany({
      where: { id: before.id, ...eligibility },
      data: {
        deliveryStatus: 'QUEUED',
        destinationPhone: before.institute.whatsappPhone || before.institute.phoneNumber,
        notificationJobId: null,
        notificationError: null,
        ...(input.mode === 'RETRY' ? { notificationRetryCount: { increment: 1 } } : {}),
        ...(input.mode === 'RELEASE' ? { releasedAt: new Date() } : {})
      }
    });
    if (transition.count === 0) {
      throw leadError(input.mode === 'RELEASE' ? 'LEAD_NOT_HELD' : 'LEAD_NOT_RETRYABLE');
    }

    const queued = await tx.leadInquiry.findUniqueOrThrow({ where: { id: before.id } });
    if (input.actorAdminId && input.mode !== 'CREATE') {
      await writeMarketplaceAudit(tx, {
        action: input.mode === 'RELEASE' ? 'LEAD_RELEASED' : 'LEAD_MESSAGE_RETRIED',
        entityType: 'LeadInquiry', entityId: before.id,
        actorAdminId: input.actorAdminId, instituteId: before.instituteId,
        before: {
          deliveryStatus: before.deliveryStatus,
          retryCount: before.notificationRetryCount
        },
        after: {
          deliveryStatus: 'QUEUED',
          retryCount: queued.notificationRetryCount
        }
      });
    }

    const enqueueInTransaction = (
      mobileNumber: string,
      templateName: string,
      componentValues: string[],
      instituteId?: string,
      tracking?: MarketplaceWhatsAppTracking
    ) => enqueueWhatsAppTracked(mobileNumber, templateName, componentValues, instituteId, tracking, tx);

    let result: TrackedWhatsAppEnqueueResult;
    try {
      result = await notify(notificationInput(queued, before.institute), enqueueInTransaction);
    } catch (error: any) {
      result = { queued: false, error: error?.message || 'MARKETPLACE_LEAD_ENQUEUE_FAILED' };
    }

    return tx.leadInquiry.update({
      where: { id: before.id },
      data: {
        deliveryStatus: result.queued ? 'QUEUED' : 'FAILED',
        notificationJobId: result.jobId || null,
        notificationError: result.queued
          ? null
          : (result.error || 'MARKETPLACE_LEAD_ENQUEUE_FAILED').slice(0, 500)
      }
    });
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
      NOT: { studentName: { startsWith: LEGACY_CLAIM_MARKER } },
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

  if (institute.ownershipStatus === 'CLAIMED') {
    lead = await queueLead({ leadId: lead.id, mode: 'CREATE' }, notify);
  }
  return { lead };
}

export async function retryMarketplaceLeadNotification(
  input: { leadId: string; actorAdminId: string },
  notify: LeadNotifier = sendLeadNotification
): Promise<LeadInquiry> {
  return queueLead({ leadId: input.leadId, mode: 'RETRY', actorAdminId: input.actorAdminId }, notify);
}

export async function releaseMarketplaceLead(
  input: { leadId: string; actorAdminId: string },
  notify: LeadNotifier = sendLeadNotification
): Promise<LeadInquiry> {
  return queueLead({ leadId: input.leadId, mode: 'RELEASE', actorAdminId: input.actorAdminId }, notify);
}
