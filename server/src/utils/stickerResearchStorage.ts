import { randomUUID } from 'crypto';
import fs from 'fs/promises';
import path from 'path';
import { getR2ObjectStorage } from './r2ObjectStorage';
import { secureLogger } from './secureLogger';

const BUCKET = process.env.STICKER_RESEARCH_BUCKET || 'mathlogs-sticker-research';
const LOCAL_DIR = path.join(__dirname, '../../var/sticker-research');

const extensionFor = (contentType: string) => contentType === 'image/png' ? 'png' : contentType === 'image/webp' ? 'webp' : 'jpg';

export async function storeStickerResearchImage(input: { body: Buffer; contentType: string; capturedAt?: Date }) {
  const capturedAt = input.capturedAt ?? new Date();
  const day = capturedAt.toISOString().slice(0, 10);
  const key = `sticker-research/${day}/${randomUUID()}.${extensionFor(input.contentType)}`;
  if (process.env.NODE_ENV === 'test') {
    await fs.mkdir(LOCAL_DIR, { recursive: true });
    const name = key.replace(/\//g, '_');
    await fs.writeFile(path.join(LOCAL_DIR, name), input.body, { mode: 0o600 });
    return `LOCAL:${name}`;
  }
  try {
    await getR2ObjectStorage().putObject({ bucket: BUCKET, key, body: input.body, contentType: input.contentType });
    return key;
  } catch (error) {
    secureLogger.error('[Sticker research] Private image upload failed.', { error: error instanceof Error ? error.message : String(error) });
    if (process.env.NODE_ENV === 'production') throw error;
    await fs.mkdir(LOCAL_DIR, { recursive: true });
    const name = key.replace(/\//g, '_');
    await fs.writeFile(path.join(LOCAL_DIR, name), input.body, { mode: 0o600 });
    return `LOCAL:${name}`;
  }
}

export async function deleteStickerResearchImage(storageKey: string) {
  if (storageKey.startsWith('LOCAL:')) {
    await fs.unlink(path.join(LOCAL_DIR, storageKey.slice(6))).catch(() => undefined);
    return;
  }
  await getR2ObjectStorage().deleteObject(BUCKET, storageKey);
}
