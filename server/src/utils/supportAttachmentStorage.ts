import { GetObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3';
import { randomUUID } from 'crypto';
import fs from 'fs/promises';
import path from 'path';
import { s3 } from './paymentStorage';
import { secureLogger } from './secureLogger';

const BUCKET = process.env.SUPPORT_ATTACHMENT_BUCKET || 'mathlogs-support-attachments';
const LOCAL_DIR = path.join(__dirname, '../../var/support-attachments');

const extensionFor = (contentType: string) => contentType === 'image/png' ? 'png' : contentType === 'image/webp' ? 'webp' : 'jpg';

async function storeLocally(key: string, body: Buffer) {
  await fs.mkdir(LOCAL_DIR, { recursive: true });
  const fileName = key.replace(/\//g, '_');
  await fs.writeFile(path.join(LOCAL_DIR, fileName), body, { mode: 0o600 });
  return `LOCAL:${fileName}`;
}

export async function storeSupportAttachment(input: { instituteId: string; ticketId: string; body: Buffer; contentType: string }) {
  const key = `support/${input.instituteId}/${input.ticketId}/${Date.now()}-${randomUUID()}.${extensionFor(input.contentType)}`;
  if (process.env.NODE_ENV === 'test') return storeLocally(key, input.body);
  try {
    await s3.send(new PutObjectCommand({ Bucket: BUCKET, Key: key, Body: input.body, ContentType: input.contentType }));
    return key;
  } catch (error) {
    secureLogger.warn('[Support attachments] Private object storage unavailable; using private local storage.', { error: error instanceof Error ? error.message : String(error) });
    return storeLocally(key, input.body);
  }
}

export async function readSupportAttachment(storageKey: string) {
  if (storageKey.startsWith('LOCAL:')) {
    try { return await fs.readFile(path.join(LOCAL_DIR, storageKey.slice(6))); } catch { return null; }
  }
  try {
    const response = await s3.send(new GetObjectCommand({ Bucket: BUCKET, Key: storageKey }));
    if (!response.Body) return null;
    const chunks: Buffer[] = [];
    for await (const chunk of response.Body as AsyncIterable<Uint8Array>) chunks.push(Buffer.from(chunk));
    return Buffer.concat(chunks);
  } catch (error: any) {
    if (error?.name === 'NoSuchKey' || error?.$metadata?.httpStatusCode === 404) return null;
    throw error;
  }
}
