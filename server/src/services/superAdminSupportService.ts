import { Prisma } from '@prisma/client';
import { prisma } from '../prisma';
import { writeSuperAdminAudit } from './superAdminAuditService';
import { storeSupportAttachment } from '../utils/supportAttachmentStorage';

export class SupportServiceError extends Error {
  constructor(code: string, public current?: unknown) { super(code); }
}

const ticketTransitions: Record<string, string[]> = {
  NEW: ['IN_PROGRESS', 'WAITING_ON_INSTITUTE', 'RESOLVED'],
  IN_PROGRESS: ['WAITING_ON_INSTITUTE', 'RESOLVED'],
  WAITING_ON_INSTITUTE: ['IN_PROGRESS', 'RESOLVED'],
  RESOLVED: ['IN_PROGRESS', 'CLOSED'],
  CLOSED: []
};

const ticketSelect = {
  id: true, reference: true, instituteId: true, category: true, subject: true, description: true,
  priority: true, status: true, resolvedAt: true, closedAt: true, createdAt: true, updatedAt: true,
  institute: { select: { id: true, name: true, teacherName: true, phoneNumber: true, email: true } },
  attachments: { select: { id: true, fileName: true, contentType: true, sizeBytes: true, createdAt: true }, orderBy: { createdAt: 'asc' as const } }
} satisfies Prisma.SupportTicketSelect;

function validateTicketInput(value: any) {
  const category = String(value?.category || '').toUpperCase();
  const priority = String(value?.priority || 'NORMAL').toUpperCase();
  const subject = String(value?.subject || '').trim();
  const description = String(value?.description || '').trim();
  if (!['ACCOUNT', 'BILLING', 'MARKETPLACE', 'QUIZ', 'STUDENTS', 'TECHNICAL', 'OTHER'].includes(category)) throw new SupportServiceError('INVALID_CATEGORY');
  if (!['LOW', 'NORMAL', 'HIGH', 'URGENT'].includes(priority)) throw new SupportServiceError('INVALID_PRIORITY');
  if (subject.length < 5 || subject.length > 160) throw new SupportServiceError('INVALID_SUBJECT');
  if (description.length < 10 || description.length > 10_000) throw new SupportServiceError('INVALID_DESCRIPTION');
  return { category, priority, subject, description };
}

export async function createSupportTicket(instituteId: string, value: unknown) {
  const input = validateTicketInput(value);
  return prisma.$transaction(async tx => {
    const counter = await tx.idCounter.upsert({ where: { prefix: 'SUP' }, create: { prefix: 'SUP', seq: 1 }, update: { seq: { increment: 1 } } });
    return tx.supportTicket.create({ data: { ...input, instituteId, reference: `SUP-${String(counter.seq).padStart(6, '0')}` }, select: ticketSelect });
  });
}

export async function addSupportAttachments(ticketId: string, instituteId: string, files: Express.Multer.File[]) {
  const ticket = await prisma.supportTicket.findFirst({ where: { id: ticketId, instituteId }, select: { id: true, instituteId: true } });
  if (!ticket) throw new SupportServiceError('SUPPORT_TICKET_NOT_FOUND');
  const saved = [];
  for (const file of files) {
    const storageKey = await storeSupportAttachment({ instituteId, ticketId, body: file.buffer, contentType: file.mimetype });
    saved.push(await prisma.supportAttachment.create({
      data: { ticketId, storageKey, fileName: file.originalname.slice(0, 255), contentType: file.mimetype, sizeBytes: file.size },
      select: { id: true, fileName: true, contentType: true, sizeBytes: true, createdAt: true }
    }));
  }
  return saved;
}

export async function getAuthorizedSupportAttachment(attachmentId: string, actor: { role: string; instituteId?: string }) {
  const attachment = await prisma.supportAttachment.findUnique({
    where: { id: attachmentId },
    include: { ticket: { select: { instituteId: true } } }
  });
  if (!attachment || (actor.role !== 'SUPER_ADMIN' && attachment.ticket.instituteId !== actor.instituteId)) throw new SupportServiceError('SUPPORT_ATTACHMENT_NOT_FOUND');
  return attachment;
}

export async function listSupportTickets(input: { instituteId?: string; status?: string; priority?: string; category?: string; q?: string }) {
  return prisma.supportTicket.findMany({
    where: {
      ...(input.instituteId ? { instituteId: input.instituteId } : {}),
      ...(input.status ? { status: input.status } : {}),
      ...(input.priority ? { priority: input.priority } : {}),
      ...(input.category ? { category: input.category } : {}),
      ...(input.q ? { OR: [
        { reference: { contains: input.q, mode: 'insensitive' } }, { subject: { contains: input.q, mode: 'insensitive' } },
        { description: { contains: input.q, mode: 'insensitive' } }, { institute: { name: { contains: input.q, mode: 'insensitive' } } }
      ] } : {})
    },
    select: ticketSelect,
    orderBy: [{ priority: 'desc' }, { updatedAt: 'desc' }],
    take: 250
  });
}

export async function getSupportTicket(ticketId: string, instituteId?: string) {
  const ticket = await prisma.supportTicket.findFirst({ where: { id: ticketId, ...(instituteId ? { instituteId } : {}) }, select: ticketSelect });
  if (!ticket) throw new SupportServiceError('SUPPORT_TICKET_NOT_FOUND');
  const messages = await prisma.supportMessage.findMany({
    where: { ticketId, ...(instituteId ? { visibility: 'PUBLIC' } : {}) },
    select: { id: true, visibility: true, body: true, createdAt: true, authorAdmin: { select: { id: true, username: true, role: true } } },
    orderBy: { createdAt: 'asc' }
  });
  return { ...ticket, messages };
}

export async function addSupportMessage(input: { ticketId: string; instituteId?: string; authorAdminId: string; visibility: 'PUBLIC' | 'INTERNAL'; body: string; expectedUpdatedAt: string; correlationId: string }) {
  const body = input.body.trim();
  if (body.length < 2 || body.length > 10_000) throw new SupportServiceError('INVALID_MESSAGE');
  if (input.instituteId && input.visibility !== 'PUBLIC') throw new SupportServiceError('INVALID_VISIBILITY');
  const current = await prisma.supportTicket.findFirst({ where: { id: input.ticketId, ...(input.instituteId ? { instituteId: input.instituteId } : {}) }, select: ticketSelect });
  if (!current) throw new SupportServiceError('SUPPORT_TICKET_NOT_FOUND');
  if (!input.expectedUpdatedAt || Number.isNaN(new Date(input.expectedUpdatedAt).getTime())) throw new SupportServiceError('EXPECTED_UPDATED_AT_REQUIRED');
  const result = await prisma.$transaction(async tx => {
    const touched = await tx.supportTicket.updateMany({ where: { id: current.id, updatedAt: new Date(input.expectedUpdatedAt) }, data: { status: current.status } });
    if (touched.count !== 1) return null;
    const message = await tx.supportMessage.create({ data: { ticketId: current.id, authorAdminId: input.authorAdminId, visibility: input.visibility, body } });
    if (!input.instituteId) await writeSuperAdminAudit(tx, { action: input.visibility === 'INTERNAL' ? 'SUPPORT_INTERNAL_NOTE_ADDED' : 'SUPPORT_REPLY_SENT', entityType: 'SupportTicket', entityId: current.id, instituteId: current.instituteId, actorAdminId: input.authorAdminId, correlationId: input.correlationId, after: { messageId: message.id, visibility: input.visibility } });
    return message;
  });
  if (!result) throw new SupportServiceError('STALE_SUPPORT_TICKET', await getSupportTicket(input.ticketId, input.instituteId));
  return result;
}

export async function transitionSupportTicket(input: { ticketId: string; actorAdminId: string; status: string; resolutionSummary?: string; expectedUpdatedAt: string; correlationId: string }) {
  const status = input.status.toUpperCase();
  const current = await prisma.supportTicket.findUnique({ where: { id: input.ticketId }, select: ticketSelect });
  if (!current) throw new SupportServiceError('SUPPORT_TICKET_NOT_FOUND');
  if (!ticketTransitions[current.status]?.includes(status)) throw new SupportServiceError('INVALID_TICKET_TRANSITION');
  const summary = String(input.resolutionSummary || '').trim();
  if (status === 'RESOLVED' && summary.length < 10) throw new SupportServiceError('RESOLUTION_SUMMARY_REQUIRED');
  const result = await prisma.$transaction(async tx => {
    const updated = await tx.supportTicket.updateMany({
      where: { id: current.id, updatedAt: new Date(input.expectedUpdatedAt) },
      data: { status, ...(status === 'RESOLVED' ? { resolvedAt: new Date() } : {}), ...(status === 'CLOSED' ? { closedAt: new Date() } : {}), ...(status === 'IN_PROGRESS' && current.status === 'RESOLVED' ? { resolvedAt: null } : {}) }
    });
    if (updated.count !== 1) return null;
    if (status === 'RESOLVED') await tx.supportMessage.create({ data: { ticketId: current.id, authorAdminId: input.actorAdminId, visibility: 'PUBLIC', body: summary } });
    await writeSuperAdminAudit(tx, { action: 'SUPPORT_TICKET_STATUS_CHANGED', entityType: 'SupportTicket', entityId: current.id, instituteId: current.instituteId, actorAdminId: input.actorAdminId, correlationId: input.correlationId, before: { status: current.status }, after: { status } });
    return tx.supportTicket.findUniqueOrThrow({ where: { id: current.id }, select: ticketSelect });
  });
  if (!result) throw new SupportServiceError('STALE_SUPPORT_TICKET', await getSupportTicket(input.ticketId));
  return result;
}

export async function createInternalCase(input: { actorAdminId: string; correlationId: string; value: any }) {
  const instituteId = String(input.value?.instituteId || '').trim(); const title = String(input.value?.title || '').trim(); const category = String(input.value?.category || '').trim().toUpperCase(); const priority = String(input.value?.priority || 'NORMAL').trim().toUpperCase();
  const followUpAt = input.value?.followUpAt ? new Date(input.value.followUpAt) : null;
  if (!instituteId || title.length < 5 || !category || !['LOW', 'NORMAL', 'HIGH', 'URGENT'].includes(priority) || (followUpAt && Number.isNaN(followUpAt.getTime()))) throw new SupportServiceError('INVALID_INTERNAL_CASE');
  return prisma.$transaction(async tx => {
    const institute = await tx.institute.findUnique({ where: { id: instituteId }, select: { id: true } }); if (!institute) throw new SupportServiceError('INSTITUTE_NOT_FOUND');
    const created = await tx.internalCase.create({ data: { instituteId, title, category, priority, followUpAt, linkedType: input.value?.linkedType || null, linkedId: input.value?.linkedId || null } });
    await writeSuperAdminAudit(tx, { action: 'INTERNAL_CASE_CREATED', entityType: 'InternalCase', entityId: created.id, instituteId, actorAdminId: input.actorAdminId, correlationId: input.correlationId, after: { title, category, priority, followUpAt: followUpAt?.toISOString() || null } });
    return created;
  });
}

export async function listInternalCases(input: { instituteId?: string; status?: string }) {
  return prisma.internalCase.findMany({ where: { ...(input.instituteId ? { instituteId: input.instituteId } : {}), ...(input.status ? { status: input.status } : {}) }, include: { institute: { select: { id: true, name: true } }, _count: { select: { notes: true } } }, orderBy: [{ followUpAt: 'asc' }, { updatedAt: 'desc' }], take: 250 });
}

export async function getInternalCase(id: string) {
  const result = await prisma.internalCase.findUnique({ where: { id }, include: { institute: { select: { id: true, name: true } }, notes: { include: { authorAdmin: { select: { id: true, username: true } } }, orderBy: { createdAt: 'asc' } } } });
  if (!result) throw new SupportServiceError('INTERNAL_CASE_NOT_FOUND'); return result;
}

export async function addInternalCaseNote(input: { id: string; actorAdminId: string; body: string; correlationId: string }) {
  const body = input.body.trim(); if (body.length < 2 || body.length > 10_000) throw new SupportServiceError('INVALID_NOTE');
  return prisma.$transaction(async tx => { const current = await tx.internalCase.findUnique({ where: { id: input.id } }); if (!current) throw new SupportServiceError('INTERNAL_CASE_NOT_FOUND'); const note = await tx.internalCaseNote.create({ data: { caseId: current.id, authorAdminId: input.actorAdminId, body } }); await writeSuperAdminAudit(tx, { action: 'INTERNAL_CASE_NOTE_ADDED', entityType: 'InternalCase', entityId: current.id, instituteId: current.instituteId, actorAdminId: input.actorAdminId, correlationId: input.correlationId, after: { noteId: note.id } }); return note; });
}
