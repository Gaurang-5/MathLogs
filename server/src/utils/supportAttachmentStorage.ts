import { randomUUID } from 'crypto';
import fs from 'fs/promises';
import path from 'path';
import { getR2ObjectStorage } from './r2ObjectStorage';
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
    await getR2ObjectStorage().putObject({ bucket: BUCKET, key, body: input.body, contentType: input.contentType });
    return key;
  } catch (error) {
    secureLogger.error('[Support attachments] R2 upload failed.', { error: error instanceof Error ? error.message : String(error) });
    if (process.env.NODE_ENV === 'production') throw error;
    return storeLocally(key, input.body);
  }
}

export async function readSupportAttachment(storageKey: string) {
  if (storageKey.startsWith('LOCAL:')) {
    try { return await fs.readFile(path.join(LOCAL_DIR, storageKey.slice(6))); } catch { return null; }
  }
  try {
    return await getR2ObjectStorage().getObject(BUCKET, storageKey);
  } catch (error) { throw error; }
}
