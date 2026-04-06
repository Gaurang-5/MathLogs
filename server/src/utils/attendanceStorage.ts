import fs from 'fs/promises';
import path from 'path';
import { randomUUID } from 'crypto';
import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import type { Request } from 'express';
import { getIndiaDayKey } from './attendanceTime';

const ATTENDANCE_BUCKET = process.env.ATTENDANCE_PHOTO_BUCKET;
const ATTENDANCE_PUBLIC_BASE_URL = process.env.ATTENDANCE_PHOTO_PUBLIC_BASE_URL;
const AWS_REGION = process.env.AWS_REGION || 'ap-south-1';

const s3Client = ATTENDANCE_BUCKET
    ? new S3Client({
        region: AWS_REGION,
        credentials: process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY
            ? {
                accessKeyId: process.env.AWS_ACCESS_KEY_ID,
                secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
            }
            : undefined,
    })
    : null;

function sanitizeSegment(value: string): string {
    return value.replace(/[^a-zA-Z0-9-_]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
}

function getPublicBaseUrl(req: Request): string {
    const protocol = req.get('x-forwarded-proto') || req.protocol;
    return `${protocol}://${req.get('host')}`;
}

export async function storeAttendancePhoto(params: {
    req: Request;
    instituteId: string;
    studentId: string;
    buffer: Buffer;
    contentType: string;
}): Promise<string> {
    const { req, instituteId, studentId, buffer, contentType } = params;
    const dayKey = getIndiaDayKey();
    const extension = contentType === 'image/png' ? 'png' : 'jpg';
    const key = [
        'attendance',
        sanitizeSegment(instituteId),
        dayKey,
        `${sanitizeSegment(studentId)}-${Date.now()}-${randomUUID()}.${extension}`,
    ].join('/');

    if (s3Client && ATTENDANCE_BUCKET && ATTENDANCE_PUBLIC_BASE_URL) {
        await s3Client.send(new PutObjectCommand({
            Bucket: ATTENDANCE_BUCKET,
            Key: key,
            Body: buffer,
            ContentType: contentType,
            CacheControl: 'public, max-age=31536000, immutable',
        }));

        return `${ATTENDANCE_PUBLIC_BASE_URL.replace(/\/$/, '')}/${key}`;
    }

    const uploadsRoot = path.join(__dirname, '../../uploads');
    const filePath = path.join(uploadsRoot, key);
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await fs.writeFile(filePath, buffer);

    return `${getPublicBaseUrl(req)}/uploads/${key}`;
}
