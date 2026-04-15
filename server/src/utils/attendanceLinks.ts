import type { Request } from 'express';
import jwt, { JsonWebTokenError, type JwtPayload } from 'jsonwebtoken';

const FALLBACK_SECRET = process.env.JWT_SECRET || 'dev-attendance-photo-secret';
const ATTENDANCE_LINK_SECRET = process.env.ATTENDANCE_LINK_SECRET || FALLBACK_SECRET;

// Default: 15 minutes
export const ATTENDANCE_LINK_TTL_MS = Number(process.env.ATTENDANCE_LINK_TTL_MS || 15 * 60 * 1000);

interface AttendancePhotoTokenPayload extends JwtPayload {
    rid: string;
    sk: string;
    mt?: string;
}

function getTokenExpirySeconds(expiresAt: Date): number {
    const seconds = Math.floor((expiresAt.getTime() - Date.now()) / 1000);
    return Math.max(seconds, 1);
}

export function buildAttendancePhotoPath(params: {
    recordId: string;
    storageKey: string;
    mimeType: string;
    expiresAt: Date;
}): string {
    const { recordId, storageKey, mimeType, expiresAt } = params;
    const token = jwt.sign(
        {
            rid: recordId,
            sk: storageKey,
            mt: mimeType,
        },
        ATTENDANCE_LINK_SECRET,
        { expiresIn: getTokenExpirySeconds(expiresAt) }
    );

    return `/api/public/attendance-photo/${encodeURIComponent(recordId)}?token=${encodeURIComponent(token)}`;
}

export function toAbsoluteAttendancePhotoLink(req: Request, pathOrUrl: string): string {
    if (/^https?:\/\//i.test(pathOrUrl)) {
        return pathOrUrl;
    }
    const host = req.get('host') || 'localhost:3001';
    return `${req.protocol}://${host}${pathOrUrl}`;
}

export function parseAttendancePhotoLinkExpiry(photoUrl?: string | null): Date | null {
    if (!photoUrl) return null;
    try {
        const parsed = new URL(photoUrl, 'http://localhost');
        const token = parsed.searchParams.get('token');
        if (!token) return null;
        const decoded = jwt.decode(token) as JwtPayload | null;
        if (!decoded?.exp) return null;
        return new Date(decoded.exp * 1000);
    } catch {
        return null;
    }
}

export function verifyAttendancePhotoToken(token: string, expectedRecordId: string): {
    recordId: string;
    storageKey: string;
    mimeType: string;
} {
    const payload = jwt.verify(token, ATTENDANCE_LINK_SECRET) as AttendancePhotoTokenPayload;
    if (!payload?.rid || !payload?.sk || payload.rid !== expectedRecordId) {
        throw new JsonWebTokenError('Invalid attendance photo token');
    }
    return {
        recordId: payload.rid,
        storageKey: payload.sk,
        mimeType: payload.mt || 'image/jpeg',
    };
}
