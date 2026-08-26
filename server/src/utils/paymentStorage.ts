import { randomUUID, createHmac, timingSafeEqual } from 'crypto';
import { requireEnv } from './env';
import { getR2ObjectStorage } from './r2ObjectStorage';

const BUCKET = process.env.PAYMENT_PHOTO_BUCKET || 'mathlogs-payment-receipts';
const SCREENSHOT_SIGNING_SECRET = requireEnv('PAYMENT_SCREENSHOT_SIGNING_SECRET', {
    fallbackEnv: 'JWT_SECRET',
    devDefault: 'dev-payment-screenshot-secret',
});

// In-memory concurrency queue to keep object-storage bursts bounded.
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

export const storePaymentScreenshotAsync = async ({ instituteId, studentId, buffer, contentType }: { instituteId: string, studentId: string, buffer: Buffer, contentType: string, recordId?: string }) => {
    const key = generateStorageKey(contentType, instituteId, studentId);

    return uploadQueue.add(async () => {
        try {
            await getR2ObjectStorage().putObject({ bucket: BUCKET, key, body: buffer, contentType });
            return key;
        } catch (e: any) {
            secureLogger.error('[Storage] R2 upload failed.', { error: e?.message || String(e) });
            if (process.env.NODE_ENV === 'production') throw e;

            secureLogger.info('[Storage] Using local development storage.');
            const localFileName = key.replace(/\//g, '_');
            await fs.mkdir(LOCAL_UPLOAD_DIR, { recursive: true });
            await fs.writeFile(path.join(LOCAL_UPLOAD_DIR, localFileName), buffer);
            return `LOCAL:${localFileName}`;
        }
    });
};

/**
 * Reads a payment screenshot from private object storage as a Buffer.
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
        return await getR2ObjectStorage().getObject(BUCKET, key);
    } catch (e: any) {
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
        await getR2ObjectStorage().deleteObject(BUCKET, key);
    } catch (e: any) {
        secureLogger.error('[paymentStorage] Failed to delete R2 object.', { key, error: e?.message || String(e) });
        if (process.env.NODE_ENV === 'production') throw e;
    }
};
