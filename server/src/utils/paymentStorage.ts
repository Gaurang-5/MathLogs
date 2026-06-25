import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand, CreateBucketCommand } from '@aws-sdk/client-s3';
import { randomUUID, createHmac, timingSafeEqual } from 'crypto';

export const s3 = new S3Client({
    region: process.env.AWS_REGION || 'ap-south-1',
    credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID || '',
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || ''
    },
    maxAttempts: 5 // Exponential backoff for throttling S3 rate limits
});

const BUCKET = process.env.PAYMENT_PHOTO_BUCKET || 'mathlogs-payment-receipts';
const SCREENSHOT_SIGNING_SECRET = process.env.PAYMENT_SCREENSHOT_SIGNING_SECRET || process.env.JWT_SECRET || 'change-me-in-production';

// In-memory concurrency queue to prevent S3 throttling during bursts
class ConcurrencyQueue {
    private concurrency: number;
    private running: number = 0;
    private queue: (() => Promise<void>)[] = [];

    constructor(concurrency: number) {
        this.concurrency = concurrency;
    }

    async add<T>(fn: () => Promise<T>): Promise<T> {
        if (this.running >= this.concurrency) {
            await new Promise<void>(resolve => this.queue.push(resolve as unknown as () => Promise<void>));
        }
        this.running++;
        try {
            return await fn();
        } finally {
            this.running--;
            if (this.queue.length > 0) {
                const next = this.queue.shift();
                if (next) next();
            }
        }
    }
}

import fs from 'fs/promises';
import path from 'path';
import { secureLogger } from './secureLogger';


const LOCAL_UPLOAD_DIR = path.join(__dirname, '../../public/uploads');
// Fire-and-forget: Ensure the local fallback directory exists
fs.mkdir(LOCAL_UPLOAD_DIR, { recursive: true }).catch(() => {});

const uploadQueue = new ConcurrencyQueue(20);

const normalizeExtension = (value: string | undefined): string => {
    if (!value) return 'jpeg';
    const lower = value.toLowerCase();
    if (lower === 'image/png' || lower.endsWith('.png')) return 'png';
    if (lower === 'image/webp' || lower.endsWith('.webp')) return 'webp';
    if (lower === 'image/jpeg' || lower === 'image/jpg' || lower.endsWith('.jpg') || lower.endsWith('.jpeg')) return 'jpg';
    return 'jpeg';
};

export const generateStorageKey = (originalNameOrMime?: string, instituteId: string = 'unknown', studentId: string = 'unknown'): string => {
    const extension = normalizeExtension(originalNameOrMime);
    return `payments/${instituteId}/${studentId}/${Date.now()}-${randomUUID()}.${extension}`;
};

export const encodePaymentScreenshotKey = (storageKey: string): string => {
    return Buffer.from(storageKey, 'utf8').toString('base64url');
};

const getScreenshotSignaturePayload = (storageKey: string, exp: number): string => {
    return `${storageKey}:${exp}`;
};

export const signPaymentScreenshotKey = (storageKey: string, exp: number): string => {
    return createHmac('sha256', SCREENSHOT_SIGNING_SECRET)
        .update(getScreenshotSignaturePayload(storageKey, exp))
        .digest('hex');
};

export const verifyPaymentScreenshotSignature = (storageKey: string, exp: number, signature: string): boolean => {
    if (!Number.isFinite(exp) || exp <= 0) return false;
    if (!/^[a-f0-9]{64}$/i.test(signature)) return false;
    const expected = signPaymentScreenshotKey(storageKey, exp);
    const expectedBuf = Buffer.from(expected, 'utf8');
    const actualBuf = Buffer.from(signature, 'utf8');
    if (expectedBuf.length !== actualBuf.length) return false;
    return timingSafeEqual(expectedBuf, actualBuf);
};

export const storePaymentScreenshotAsync = async ({ instituteId, studentId, buffer, contentType, recordId }: { instituteId: string, studentId: string, buffer: Buffer, contentType: string, recordId: string }) => {
    const key = generateStorageKey(contentType, instituteId, studentId);

    // Fire and forget - do not return the promise!
    uploadQueue.add(async () => {
        try {
            await s3.send(new PutObjectCommand({
                Bucket: BUCKET,
                Key: key,
                Body: buffer,
                ContentType: contentType
            }));
        } catch (e: any) {
            let s3Success = false;
            if (e.name === 'NoSuchBucket' || e.Code === 'NoSuchBucket') {
                secureLogger.info(`[Storage] Bucket ${BUCKET} not found. Attempting to create it...`);
                try {
                    const region = process.env.AWS_REGION || 'ap-south-1';
                    await s3.send(new CreateBucketCommand({
                        Bucket: BUCKET,
                        ...(region !== 'us-east-1' ? { CreateBucketConfiguration: { LocationConstraint: region as any } } : {})
                    }));
                    await s3.send(new PutObjectCommand({ Bucket: BUCKET, Key: key, Body: buffer, ContentType: contentType }));
                    s3Success = true;
                } catch (createErr: any) {
                    console.error("[Storage] Failed to auto-create S3 bucket.", createErr.message || createErr);
                }
            } else {
                console.error("[Storage] S3 Upload Failed.", e.message || e);
            }

            // --- LOCAL FALLBACK ---
            if (!s3Success) {
                secureLogger.info("[Storage] Falling back to LOCAL disk storage...");
                const localFileName = key.replace(/\//g, '_');
                await fs.mkdir(LOCAL_UPLOAD_DIR, { recursive: true }).catch(() => {});
                await fs.writeFile(path.join(LOCAL_UPLOAD_DIR, localFileName), buffer);
                const localKey = `LOCAL:${localFileName}`;
                
                // Update DB with local key since S3 failed
                const { prisma } = require('../prisma');
                await prisma.upiPaymentVerification.update({
                    where: { id: recordId },
                    data: { storageKey: localKey }
                }).catch((err: any) => console.error("[Storage] Failed to update DB with local fallback key", err));
            }
        }
    });

    return key; // return the optimistic S3 key immediately
};

/**
 * Reads a payment screenshot from S3 as a Buffer.
 */
export const readPaymentScreenshot = async (key: string): Promise<Buffer | null> => {
    if (key.startsWith('LOCAL:')) {
        try {
            return await fs.readFile(path.join(LOCAL_UPLOAD_DIR, key.replace('LOCAL:', '')));
        } catch {
            return null;
        }
    }

    try {
        const response = await s3.send(new GetObjectCommand({
            Bucket: BUCKET,
            Key: key
        }));
        
        if (!response.Body) return null;
        
        const chunks: any[] = [];
        for await (const chunk of response.Body as any) {
            chunks.push(chunk);
        }
        return Buffer.concat(chunks);
    } catch (e: any) {
        if (e.name === 'NoSuchKey' || e.$metadata?.httpStatusCode === 404) {
            return null;
        }
        throw e;
    }
};

/**
 * Deletes a payment screenshot.
 */
export const deletePaymentScreenshot = async (key: string): Promise<void> => {
    if (key.startsWith('LOCAL:')) {
        try {
            await fs.unlink(path.join(LOCAL_UPLOAD_DIR, key.replace('LOCAL:', '')));
        } catch (e) {
            console.error(`[paymentStorage] Failed to delete local file: ${key}`);
        }
        return;
    }

    try {
        await s3.send(new DeleteObjectCommand({
            Bucket: BUCKET,
            Key: key
        }));
    } catch (e: any) {
        console.error(`[paymentStorage] Failed to delete S3 file at key: ${key}`, e.message || e);
    }
};
