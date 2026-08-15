import { Prisma } from '@prisma/client';
import { prisma } from '../prisma';
import { writeSuperAdminAudit } from './superAdminAuditService';
import { claimSuperAdminIdempotency, completeSuperAdminIdempotency } from './superAdminIdempotencyService';

type Channel = 'EMAIL' | 'WHATSAPP';
type Audience = { instituteIds?: string[]; status?: string; plan?: string; city?: string; ownershipStatus?: string };

export class CommunicationServiceError extends Error {
  constructor(code: string, public current?: unknown) { super(code); }
}

const templates = {
  BILLING_REMINDER: { channel: 'EMAIL', label: 'Billing reminder', subject: 'A reminder about your MathLogs plan', body: (name: string) => `Hello,\n\nThis is an operational reminder for ${name}. Please review the billing section in MathLogs or reply to this email if you need help.\n\n— MathLogs Operations` },
  SERVICE_UPDATE: { channel: 'EMAIL', label: 'Service update', subject: 'MathLogs service update', body: (name: string) => `Hello,\n\nWe have an important operational update for ${name}. Please sign in to MathLogs to review the latest information.\n\n— MathLogs Operations` },
  MARKETPLACE_GUIDANCE: { channel: 'EMAIL', label: 'Marketplace guidance', subject: 'Complete your MathLogs Marketplace profile', body: (name: string) => `Hello,\n\nYour ${name} Marketplace profile needs attention. Please sign in to review your listing details, contact information, and lead preferences.\n\n— MathLogs Operations` },
  OPERATIONAL_NOTICE: { channel: 'WHATSAPP', label: 'Operational notice', env: 'WHATSAPP_TEMPLATE_SUPERADMIN_OPERATIONAL' }
} as const;

function templateFor(name: string, channel?: Channel) {
  const template = templates[name as keyof typeof templates];
  if (!template || (channel && template.channel !== channel)) throw new CommunicationServiceError('COMMUNICATION_TEMPLATE_NOT_APPROVED');
  return template;
}

function normalizeAudience(value: unknown): Audience {
  const input = value && typeof value === 'object' ? value as Record<string, unknown> : {};
  const allowed = new Set(['instituteIds', 'status', 'plan', 'city', 'ownershipStatus']);
  if (Object.keys(input).some(key => !allowed.has(key))) throw new CommunicationServiceError('INVALID_AUDIENCE');
  const instituteIds = Array.isArray(input.instituteIds) ? [...new Set(input.instituteIds.map(String).map(item => item.trim()).filter(Boolean))].slice(0, 500) : undefined;
  return {
    ...(instituteIds?.length ? { instituteIds } : {}),
    ...(input.status ? { status: String(input.status).toUpperCase() } : {}),
    ...(input.plan ? { plan: String(input.plan).toUpperCase() } : {}),
    ...(input.city ? { city: String(input.city).trim() } : {}),
    ...(input.ownershipStatus ? { ownershipStatus: String(input.ownershipStatus).toUpperCase() } : {})
  };
}

function instituteWhere(audience: Audience): Prisma.InstituteWhereInput {
  return {
    ...(audience.instituteIds ? { id: { in: audience.instituteIds } } : {}),
    ...(audience.status ? { status: audience.status } : {}),
    ...(audience.plan ? { plan: audience.plan as any } : {}),
    ...(audience.city ? { city: { equals: audience.city, mode: 'insensitive' } } : {}),
    ...(audience.ownershipStatus ? { ownershipStatus: audience.ownershipStatus } : {})
  };
}

function maskDestination(value: string) {
  if (value.includes('@')) { const [name, domain] = value.split('@'); return `${name.slice(0, 2)}***@${domain}`; }
  return `${value.slice(0, 2)}******${value.slice(-2)}`;
}

export function listApprovedCommunicationTemplates() {
  return Object.entries(templates).map(([name, item]) => ({ name, channel: item.channel, label: item.label, configured: item.channel === 'EMAIL' || Boolean(process.env[(item as any).env]) }));
}

export async function previewTargetedCommunication(value: unknown) {
  const input = value && typeof value === 'object' ? value as Record<string, unknown> : {};
  const channel = String(input.channel || '').toUpperCase() as Channel;
  if (!['EMAIL', 'WHATSAPP'].includes(channel)) throw new CommunicationServiceError('INVALID_CHANNEL');
  const templateName = String(input.templateName || '').toUpperCase();
  const template = templateFor(templateName, channel);
  if (channel === 'WHATSAPP' && !process.env[(template as any).env]?.trim()) throw new CommunicationServiceError('COMMUNICATION_TEMPLATE_NOT_CONFIGURED');
  const reason = String(input.reason || '').trim();
  if (reason.length < 10) throw new CommunicationServiceError('REASON_REQUIRED');
  const audience = normalizeAudience(input.audience);
  const institutes = await prisma.institute.findMany({
    where: instituteWhere(audience),
    select: { id: true, name: true, teacherName: true, email: true, phoneNumber: true, communicationPreference: true },
    orderBy: { name: 'asc' }, take: 500
  });
  const recipients = institutes.map(institute => {
    const destination = channel === 'EMAIL' ? institute.email : institute.phoneNumber;
    const consented = channel === 'EMAIL' ? institute.communicationPreference?.emailOperational : institute.communicationPreference?.whatsappOperational;
    const exclusionReason = !destination ? 'DESTINATION_MISSING' : !consented ? 'CONSENT_MISSING' : null;
    return { instituteId: institute.id, instituteName: institute.name, ownerName: institute.teacherName, destinationMasked: destination ? maskDestination(destination) : null, included: !exclusionReason, exclusionReason };
  });
  return { channel, templateName, audience, reason, includedCount: recipients.filter(item => item.included).length, excludedCount: recipients.filter(item => !item.included).length, recipients };
}

export async function dispatchTargetedCommunication(input: { value: unknown; actorAdminId: string; correlationId: string; idempotencyKey: string }) {
  if (!input.idempotencyKey) throw new CommunicationServiceError('IDEMPOTENCY_KEY_REQUIRED');
  const preview = await previewTargetedCommunication(input.value);
  if (preview.includedCount === 0) throw new CommunicationServiceError('NO_ELIGIBLE_RECIPIENTS');
  const claim = await claimSuperAdminIdempotency({ actorAdminId: input.actorAdminId, scope: 'TARGETED_COMMUNICATION', key: input.idempotencyKey, request: input.value });
  if (claim.kind === 'REPLAY') return claim.response;
  const template = templateFor(preview.templateName, preview.channel);
  const institutes = await prisma.institute.findMany({ where: { id: { in: preview.recipients.filter(item => item.included).map(item => item.instituteId) } }, select: { id: true, name: true, teacherName: true, email: true, phoneNumber: true } });
  const byId = new Map(institutes.map(item => [item.id, item]));
  const result = await prisma.$transaction(async tx => {
    const send = await tx.targetedCommunicationSend.create({ data: { channel: preview.channel, templateName: preview.templateName, audienceDefinition: preview.audience as Prisma.InputJsonValue, reason: preview.reason, idempotencyKey: input.idempotencyKey, status: 'QUEUED', includedCount: preview.includedCount, excludedCount: preview.excludedCount, createdByAdminId: input.actorAdminId, dispatchedAt: new Date() } });
    for (const candidate of preview.recipients) {
      const institute = byId.get(candidate.instituteId);
      if (!candidate.included || !institute) {
        await tx.targetedCommunicationRecipient.create({ data: { sendId: send.id, instituteId: candidate.instituteId, destination: candidate.destinationMasked || '', variables: {}, status: 'EXCLUDED', exclusionReason: candidate.exclusionReason || 'INSTITUTE_UNAVAILABLE' } });
        continue;
      }
      const destination = preview.channel === 'EMAIL' ? institute.email! : institute.phoneNumber!;
      const variables = { ownerName: institute.teacherName || 'Institute owner', instituteName: institute.name };
      const recipient = await tx.targetedCommunicationRecipient.create({ data: { sendId: send.id, instituteId: institute.id, destination, variables, status: 'PENDING' } });
      const job = preview.channel === 'EMAIL'
        ? await tx.emailJob.create({ data: { recipient: destination, subject: (template as any).subject, body: (template as any).body(institute.name), instituteId: institute.id, superAdminEntityType: 'TargetedCommunicationRecipient', superAdminEntityId: recipient.id, options: { senderType: 'NOREPLY' } } })
        : await tx.whatsappJob.create({ data: { recipient: destination, templateId: process.env[(template as any).env]!.trim(), data: [variables.ownerName, variables.instituteName, (template as any).label], instituteId: institute.id, superAdminEntityType: 'TargetedCommunicationRecipient', superAdminEntityId: recipient.id } });
      await tx.targetedCommunicationRecipient.update({ where: { id: recipient.id }, data: { jobId: job.id } });
    }
    await writeSuperAdminAudit(tx, { action: 'TARGETED_COMMUNICATION_DISPATCHED', entityType: 'TargetedCommunicationSend', entityId: send.id, actorAdminId: input.actorAdminId, correlationId: input.correlationId, reason: preview.reason, after: { channel: preview.channel, templateName: preview.templateName, includedCount: preview.includedCount, excludedCount: preview.excludedCount } });
    return { id: send.id, status: send.status, includedCount: send.includedCount, excludedCount: send.excludedCount, dispatchedAt: send.dispatchedAt };
  });
  await completeSuperAdminIdempotency(claim.recordId, result as unknown as Prisma.InputJsonValue);
  return result;
}

export async function listTargetedCommunicationHistory() {
  return prisma.targetedCommunicationSend.findMany({ select: { id: true, channel: true, templateName: true, reason: true, status: true, includedCount: true, excludedCount: true, dispatchedAt: true, createdAt: true, createdByAdmin: { select: { id: true, username: true } } }, orderBy: { createdAt: 'desc' }, take: 100 });
}

export async function getCommunicationPreference(instituteId: string) {
  return prisma.instituteCommunicationPreference.upsert({ where: { instituteId }, create: { instituteId }, update: {} });
}

export async function updateCommunicationPreference(input: { instituteId: string; whatsappOperational?: boolean; emailOperational?: boolean; consentSource: string; actorAdminId?: string; correlationId?: string; reason?: string }) {
  const current = await getCommunicationPreference(input.instituteId);
  const now = new Date();
  return prisma.$transaction(async tx => {
    const updated = await tx.instituteCommunicationPreference.update({ where: { instituteId: input.instituteId }, data: {
      ...(input.whatsappOperational !== undefined ? { whatsappOperational: input.whatsappOperational, whatsappConsentedAt: input.whatsappOperational ? now : null } : {}),
      ...(input.emailOperational !== undefined ? { emailOperational: input.emailOperational, emailConsentedAt: input.emailOperational ? now : null } : {}),
      consentSource: input.consentSource
    } });
    if (input.actorAdminId && input.correlationId) await writeSuperAdminAudit(tx, { action: 'COMMUNICATION_PREFERENCE_UPDATED', entityType: 'InstituteCommunicationPreference', entityId: input.instituteId, instituteId: input.instituteId, actorAdminId: input.actorAdminId, correlationId: input.correlationId, reason: input.reason, before: current, after: updated });
    return updated;
  });
}
