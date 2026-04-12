import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { randomUUID } from 'crypto';

export const s3 = new S3Client({
    region: process.env.AWS_REGION || 'ap-south-1',
    credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID || '',
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || ''
    },
    maxAttempts: 5 // Exponential backoff for throttling S3 rate limits
});

const BUCKET = process.env.PAYMENT_PHOTO_BUCKET || 'mathlogs-payment-receipts';

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

const uploadQueue = new ConcurrencyQueue(20);

/**
 * Stores a payment screenshot to S3 using the concurrency queue.
 */
export const storePaymentScreenshot = async ({ instituteId, studentId, buffer, contentType }: { instituteId: string, studentId: string, buffer: Buffer, contentType: string }) => {
    let extension = 'jpeg';
    if (contentType === 'image/png') extension = 'png';
    else if (contentType === 'image/webp') extension = 'webp';

    const key = `payments/${instituteId}/${studentId}/${Date.now()}-${randomUUID()}.${extension}`;

    await uploadQueue.add(async () => {
        await s3.send(new PutObjectCommand({
            Bucket: BUCKET,
            Key: key,
            Body: buffer,
            ContentType: contentType
        }));
    });

    return key;
};

/**
 * Reads a payment screenshot from S3 as a Buffer.
 * Returns null if the file does not exist.
 */
export const readPaymentScreenshot = async (key: string): Promise<Buffer | null> => {
    try {
        const response = await s3.send(new GetObjectCommand({
            Bucket: BUCKET,
            Key: key
        }));
        
        if (!response.Body) return null;
        
        // Convert stream to buffer
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
 * Deletes a payment screenshot from S3.
 */
export const deletePaymentScreenshot = async (key: string): Promise<void> => {
    try {
        await s3.send(new DeleteObjectCommand({
            Bucket: BUCKET,
            Key: key
        }));
    } catch (e: any) {
        // Log but do not block if delete fails
        console.error(`[paymentStorage] Failed to delete file at key: ${key}`, e);
    }
};
