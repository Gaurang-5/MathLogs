import jwt from 'jsonwebtoken';
import { Request } from 'express';
import { getJwtSecret } from '../utils/env';

export function normalizeParentPhone(value: unknown): string | null {
  if (typeof value !== 'string' || !/^[+\d\s()-]+$/.test(value)) return null;
  const digits = value.replace(/\D/g, '');
  const phone = digits.length === 12 && digits.startsWith('91') ? digits.slice(2) : digits;
  return /^\d{10}$/.test(phone) ? phone : null;
}
export function parentFeeScope(req: Request): { instituteId: string; studentIds: string[]; phone?: string } | null {
  try {
    const header = req.headers.authorization;
    if (!header?.startsWith('Bearer ')) return null;
    const claims = jwt.verify(header.slice(7), getJwtSecret(), { algorithms: ['HS256'] }) as jwt.JwtPayload;
    if (typeof claims.instituteId !== 'string') return null;
    if (claims.role === 'STUDENT' && claims.authenticationMethod === 'WHATSAPP_OTP' && typeof claims.studentId === 'string') return { instituteId: claims.instituteId, studentIds: [claims.studentId] };
    if (claims.purpose === 'STUDENT_ACCOUNT_SELECTION' && Array.isArray(claims.studentIds) && claims.studentIds.length && claims.studentIds.every(id => typeof id === 'string') && normalizeParentPhone(claims.normalizedPhone)) {
      return { instituteId: claims.instituteId, studentIds: claims.studentIds, phone: claims.normalizedPhone };
    }
    return null;
  } catch { return null; }
}
