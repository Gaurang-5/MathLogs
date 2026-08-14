import crypto from 'node:crypto';
import { prisma } from '../prisma';
import { secureLogger } from '../utils/secureLogger';

const HASH_SECRET = process.env.JWT_SECRET || 'local-auth-event-hash';

export function hashRequestIp(ip: string | undefined): string | undefined {
  if (!ip) return undefined;
  return crypto.createHmac('sha256', HASH_SECRET).update(ip).digest('hex');
}

export function safeDeviceLabel(userAgent: string | undefined): string {
  const value = userAgent || '';
  const browser = /Edg\//.test(value) ? 'Edge' : /Chrome\//.test(value) ? 'Chrome' : /Safari/.test(value) ? 'Safari' : /Firefox\//.test(value) ? 'Firefox' : 'Browser';
  const platform = /iPhone|iPad/.test(value) ? 'iOS' : /Android/.test(value) ? 'Android' : /Macintosh|Mac OS/.test(value) ? 'macOS' : /Windows/.test(value) ? 'Windows' : /Linux/.test(value) ? 'Linux' : 'Unknown device';
  return `${browser} on ${platform}`;
}

export async function recordAuthenticationEvent(input: {
  adminId?: string;
  eventType: 'LOGIN' | 'LOGIN_FAILED' | 'REFRESH' | 'LOGOUT';
  success: boolean;
  ip?: string;
  userAgent?: string;
  metadata?: Record<string, string | number | boolean | null>;
}): Promise<void> {
  try {
    await prisma.authenticationEvent.create({
      data: {
        adminId: input.adminId,
        eventType: input.eventType,
        success: input.success,
        ipHash: hashRequestIp(input.ip),
        deviceLabel: safeDeviceLabel(input.userAgent),
        metadata: input.metadata
      }
    });
  } catch (error) {
    secureLogger.warn('[AUTH_EVENT] Unable to persist bounded authentication event', {
      eventType: input.eventType,
      success: input.success,
      error: error instanceof Error ? error.name : 'UnknownError'
    });
  }
}
