import fs from 'fs/promises';
import path from 'path';
import { randomUUID } from 'crypto';
import { GetObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { getIndiaDayKey } from './attendanceTime';

const ATTENDANCE_BUCKET = process.env.ATTENDANCE_PHOTO_BUCKET;
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

export async function storeAttendancePhoto(params: {
    instituteId: string;
    studentId: string;
    buffer: Buffer;
    contentType: string;
}): Promise<string> {
    const { instituteId, studentId, buffer, contentType } = params;
    const dayKey = getIndiaDayKey();
    const extension = contentType === 'image/png' ? 'png' : 'jpg';
    const key = [
        'attendance',
        sanitizeSegment(instituteId),
        dayKey,
        `${sanitizeSegment(studentId)}-${Date.now()}-${randomUUID()}.${extension}`,
    ].join('/');

    if (s3Client && ATTENDANCE_BUCKET) {
        await s3Client.send(new PutObjectCommand({
            Bucket: ATTENDANCE_BUCKET,
            Key: key,
            Body: buffer,
            ContentType: contentType,
            CacheControl: 'private, max-age=0, no-store',
        }));
        return key;
    }

    const uploadsRoot = path.join(__dirname, '../../uploads');
    const filePath = path.join(uploadsRoot, key);
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await fs.writeFile(filePath, buffer);

    return key;
}

export async function readAttendancePhoto(storageKey: string): Promise<Buffer> {
    if (s3Client && ATTENDANCE_BUCKET) {
        const response = await s3Client.send(new GetObjectCommand({
            Bucket: ATTENDANCE_BUCKET,
            Key: storageKey,
        }));

        const bytes = await response.Body?.transformToByteArray();
        if (!bytes) {
            throw new Error('Attendance photo object not found');
        }
        return Buffer.from(bytes);
    }

    const uploadsRoot = path.join(__dirname, '../../uploads');
    return fs.readFile(path.join(uploadsRoot, storageKey));
}
