import crypto from 'node:crypto';
import axios from 'axios';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { prisma } from '../prisma';
import { sendOtpEmail } from '../utils/email';
import { writeSuperAdminAudit } from './superAdminAuditService';

export const SUPER_ADMIN_ACTION_CLASSES = [
  'SUPPORT_SESSION',
  'PLAN_REVOKE',
  'BILLING_ADJUSTMENT',
  'ADMIN_ACCESS_CHANGE',
  'SENSITIVE_CONFIGURATION',
  'TARGETED_COMMUNICATION',
  'INSTITUTE_DELETE',
  'SYSTEM_SESSION_REVOKE'
] as const;

export type SuperAdminActionClass = typeof SUPER_ADMIN_ACTION_CLASSES[number];

function securityError(code: string): Error & { code: string } {
  return Object.assign(new Error(code), { code });
}

function maskDestination(value: string): string {
  if (value.includes('@')) {
    const [name, domain] = value.split('@');
    return `${name.slice(0, 2)}***@${domain}`;
  }
  return `${value.slice(0, 2)}******${value.slice(-2)}`;
}

async function dispatchWhatsAppOtp(phone: string, otp: string): Promise<void> {
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID?.trim();
  const accessToken = process.env.WHATSAPP_ACCESS_TOKEN?.trim();
  const templateName = process.env.WHATSAPP_TEMPLATE_OTP?.trim();
  if (!phoneNumberId || !accessToken || !templateName) throw securityError('SUPERADMIN_RECOVERY_CHANNEL_MISSING');
  const digits = phone.replace(/\D/g, '');
  const destination = digits.length === 10 ? `91${digits}` : digits;
  await axios.post(`https://graph.facebook.com/v21.0/${phoneNumberId}/messages`, {
    messaging_product: 'whatsapp',
    to: destination,
    type: 'template',
    template: {
      name: templateName,
      language: { code: 'en' },
      components: [{ type: 'body', parameters: [{ type: 'text', text: otp }] }]
    }
  }, {
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    timeout: 10_000
  });
}

export async function sendSuperAdminReauthOtp(adminId: string, actionClass: SuperAdminActionClass) {
  const admin = await prisma.admin.findUniqueOrThrow({ where: { id: adminId }, select: { username: true } });
  const now = new Date();
  const recent = await prisma.superAdminReauthChallenge.findFirst({
    where: { adminId, actionClass, createdAt: { gt: new Date(now.getTime() - 60_000) }, consumedAt: null },
    orderBy: { createdAt: 'desc' }
  });
  if (recent) throw securityError('REAUTH_RESEND_COOLDOWN');

  const otp = crypto.randomInt(100000, 1000000).toString();
  const otpHash = await bcrypt.hash(otp, 10);
  const expiresAt = new Date(now.getTime() + 5 * 60_000);
  const isEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(admin.username);
  const isPhone = /^\+?[\d\s()-]{10,18}$/.test(admin.username);
  if (!isEmail && !isPhone) throw securityError('SUPERADMIN_RECOVERY_CHANNEL_MISSING');

  await prisma.superAdminReauthChallenge.updateMany({
    where: { adminId, actionClass, consumedAt: null },
    data: { consumedAt: now }
  });
  const challenge = await prisma.superAdminReauthChallenge.create({
    data: { adminId, actionClass, otpHash, expiresAt }
  });

  try {
    if (isEmail) {
      const result = await sendOtpEmail(admin.username, otp);
      if (!result.success) throw new Error(result.error || 'EMAIL_DISPATCH_FAILED');
    } else {
      await dispatchWhatsAppOtp(admin.username, otp);
    }
  } catch (error) {
    await prisma.superAdminReauthChallenge.update({ where: { id: challenge.id }, data: { consumedAt: new Date() } });
    throw securityError('REAUTH_DELIVERY_FAILED');
  }

  return {
    challengeId: challenge.id,
    expiresAt,
    deliveryChannel: isEmail ? 'EMAIL' : 'WHATSAPP',
    destinationMasked: maskDestination(admin.username)
  };
}

export async function verifySuperAdminReauthOtp(adminId: string, challengeId: string, otp: string) {
  const challenge = await prisma.superAdminReauthChallenge.findFirst({ where: { id: challengeId, adminId } });
  const now = new Date();
  if (!challenge) throw securityError('REAUTH_CHALLENGE_NOT_FOUND');
  if (challenge.lockedAt || challenge.attempts >= 5) throw securityError('REAUTH_CHALLENGE_LOCKED');
  if (challenge.consumedAt) throw securityError('REAUTH_CHALLENGE_CONSUMED');
  if (challenge.expiresAt <= now) throw securityError('REAUTH_CHALLENGE_EXPIRED');
  if (challenge.verifiedAt) throw securityError('REAUTH_CHALLENGE_ALREADY_VERIFIED');

  if (!(await bcrypt.compare(otp, challenge.otpHash))) {
    const failedAttempts = challenge.attempts + 1;
    await prisma.superAdminReauthChallenge.update({
      where: { id: challenge.id },
      data: { attempts: { increment: 1 }, lockedAt: failedAttempts >= 5 ? now : undefined }
    });
    throw securityError(failedAttempts >= 5 ? 'REAUTH_CHALLENGE_LOCKED' : 'REAUTH_CODE_INVALID');
  }

  const updated = await prisma.superAdminReauthChallenge.updateMany({
    where: { id: challenge.id, verifiedAt: null, lockedAt: null, consumedAt: null, expiresAt: { gt: now } },
    data: { verifiedAt: now }
  });
  if (updated.count !== 1) throw securityError('REAUTH_CHALLENGE_INVALID');
  return { challengeId: challenge.id, verifiedAt: now, actionClass: challenge.actionClass };
}

export async function startSuperAdminSupportSession(input: {
  adminId: string;
  instituteId: string;
  ticketId?: string;
  caseId?: string;
  reason: string;
  correlationId: string;
}) {
  if (input.ticketId && input.caseId) throw securityError('SUPPORT_SESSION_LINK_INVALID');
  const institute = await prisma.institute.findUnique({ where: { id: input.instituteId }, select: { id: true } });
  if (!institute) throw securityError('INSTITUTE_NOT_FOUND');
  if (input.ticketId) {
    const ticket = await prisma.supportTicket.findFirst({ where: { id: input.ticketId, instituteId: input.instituteId }, select: { id: true } });
    if (!ticket) throw securityError('SUPPORT_SESSION_LINK_INVALID');
  }
  if (input.caseId) {
    const internalCase = await prisma.internalCase.findFirst({ where: { id: input.caseId, instituteId: input.instituteId }, select: { id: true } });
    if (!internalCase) throw securityError('SUPPORT_SESSION_LINK_INVALID');
  }
  const expiresAt = new Date(Date.now() + 15 * 60_000);
  const session = await prisma.$transaction(async tx => {
    const created = await tx.superAdminSupportSession.create({
      data: { adminId: input.adminId, instituteId: input.instituteId, ticketId: input.ticketId, caseId: input.caseId, reason: input.reason, expiresAt }
    });
    await writeSuperAdminAudit(tx, {
      action: 'SUPPORT_SESSION_STARTED',
      entityType: 'Institute',
      entityId: input.instituteId,
      actorAdminId: input.adminId,
      instituteId: input.instituteId,
      reason: input.reason,
      metadata: { ticketId: input.ticketId || null, caseId: input.caseId || null },
      correlationId: input.correlationId,
      supportSessionId: created.id
    });
    return created;
  });
  const secret = process.env.JWT_SECRET;
  if (!secret) throw new Error('JWT_SECRET_REQUIRED');
  const supportToken = jwt.sign({
    kind: 'SUPPORT_SESSION',
    sessionId: session.id,
    actorAdminId: input.adminId,
    instituteId: input.instituteId,
    role: 'INSTITUTE_ADMIN'
  }, secret, { expiresIn: Math.max(1, Math.floor((session.expiresAt.getTime() - Date.now()) / 1000)) });
  return { session, supportToken };
}

export async function endSuperAdminSupportSession(input: {
  sessionId: string;
  adminId: string;
  reason: string;
  correlationId: string;
}) {
  return prisma.$transaction(async tx => {
    const current = await tx.superAdminSupportSession.findFirst({ where: { id: input.sessionId, adminId: input.adminId } });
    if (!current) throw securityError('SUPPORT_SESSION_NOT_FOUND');
    if (current.endedAt) throw securityError('SUPPORT_SESSION_ALREADY_ENDED');
    const endedAt = new Date();
    const session = await tx.superAdminSupportSession.update({
      where: { id: current.id },
      data: { endedAt, endReason: 'MANUAL' }
    });
    await writeSuperAdminAudit(tx, {
      action: 'SUPPORT_SESSION_ENDED',
      entityType: 'SuperAdminSupportSession',
      entityId: current.id,
      actorAdminId: input.adminId,
      instituteId: current.instituteId,
      reason: input.reason,
      correlationId: input.correlationId,
      supportSessionId: current.id
    });
    return session;
  });
}
