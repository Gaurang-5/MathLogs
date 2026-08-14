import type { Request, Response } from 'express';
import {
  endSuperAdminSupportSession,
  sendSuperAdminReauthOtp,
  startSuperAdminSupportSession,
  SUPER_ADMIN_ACTION_CLASSES,
  verifySuperAdminReauthOtp,
  type SuperAdminActionClass
} from '../services/superAdminSecurityService';

function statusFor(code: string): number {
  if (['REAUTH_CHALLENGE_NOT_FOUND', 'INSTITUTE_NOT_FOUND', 'SUPPORT_SESSION_NOT_FOUND'].includes(code)) return 404;
  if (['REAUTH_CHALLENGE_LOCKED', 'REAUTH_RESEND_COOLDOWN'].includes(code)) return 429;
  if (code === 'REAUTH_CHALLENGE_EXPIRED') return 410;
  if (['REAUTH_CHALLENGE_CONSUMED', 'REAUTH_CHALLENGE_ALREADY_VERIFIED', 'SUPPORT_SESSION_ALREADY_ENDED'].includes(code)) return 409;
  if (code === 'SUPERADMIN_RECOVERY_CHANNEL_MISSING') return 409;
  if (code === 'REAUTH_DELIVERY_FAILED') return 502;
  return 400;
}

function failure(res: Response, error: unknown) {
  const code = error instanceof Error ? error.message : 'SUPERADMIN_SECURITY_FAILED';
  const known = new Set([
    'REAUTH_CHALLENGE_NOT_FOUND', 'INSTITUTE_NOT_FOUND', 'SUPPORT_SESSION_NOT_FOUND',
    'REAUTH_CHALLENGE_LOCKED', 'REAUTH_RESEND_COOLDOWN', 'REAUTH_CHALLENGE_EXPIRED',
    'REAUTH_CHALLENGE_CONSUMED', 'REAUTH_CHALLENGE_ALREADY_VERIFIED',
    'SUPPORT_SESSION_ALREADY_ENDED', 'SUPERADMIN_RECOVERY_CHANNEL_MISSING',
    'REAUTH_DELIVERY_FAILED', 'REAUTH_CODE_INVALID', 'REAUTH_CHALLENGE_INVALID'
  ]);
  if (!known.has(code)) return res.status(500).json({ success: false, error: 'SUPERADMIN_SECURITY_FAILED' });
  return res.status(statusFor(code)).json({ success: false, error: code });
}

export async function sendReauthOtp(req: Request, res: Response) {
  const actionClass = String(req.body?.actionClass || '') as SuperAdminActionClass;
  if (!SUPER_ADMIN_ACTION_CLASSES.includes(actionClass)) {
    return res.status(400).json({ success: false, error: 'INVALID_ACTION_CLASS' });
  }
  try {
    return res.json({ success: true, data: await sendSuperAdminReauthOtp(req.user.id, actionClass) });
  } catch (error) {
    return failure(res, error);
  }
}

export async function verifyReauthOtp(req: Request, res: Response) {
  const challengeId = String(req.body?.challengeId || '').trim();
  const otp = String(req.body?.otp || '').trim();
  if (!challengeId || !/^\d{6}$/.test(otp)) {
    return res.status(400).json({ success: false, error: 'CHALLENGE_AND_SIX_DIGIT_CODE_REQUIRED' });
  }
  try {
    return res.json({ success: true, data: await verifySuperAdminReauthOtp(req.user.id, challengeId, otp) });
  } catch (error) {
    return failure(res, error);
  }
}

export async function startSupportSession(req: Request, res: Response) {
  const instituteId = String(req.body?.instituteId || '').trim();
  const reason = String(req.body?.reason || '').trim();
  if (!instituteId || reason.length < 10) {
    return res.status(400).json({ success: false, error: 'INSTITUTE_AND_REASON_REQUIRED' });
  }
  try {
    const data = await startSuperAdminSupportSession({
      adminId: req.user.id,
      instituteId,
      reason,
      correlationId: req.correlationId
    });
    return res.status(201).json({ success: true, data });
  } catch (error) {
    return failure(res, error);
  }
}

export async function endSupportSession(req: Request, res: Response) {
  const reason = String(req.body?.reason || '').trim();
  if (reason.length < 10) return res.status(400).json({ success: false, error: 'REASON_REQUIRED' });
  try {
    const data = await endSuperAdminSupportSession({
      sessionId: String(req.params.id),
      adminId: req.user.id,
      reason,
      correlationId: req.correlationId
    });
    return res.json({ success: true, data });
  } catch (error) {
    return failure(res, error);
  }
}
