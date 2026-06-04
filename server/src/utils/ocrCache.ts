import { prisma } from '../prisma';
import { secureLogger } from './secureLogger';


export const OCR_CACHE_TTL_SECONDS = 60;
let ocrCacheCleanupInterval: NodeJS.Timeout | null = null;

export async function checkOcrCache(hash: string): Promise<any | null> {
    try {
        const record = await prisma.ocrScanCache.findUnique({
            where: { imageHash: hash }
        });
        if (!record) return null;

        // Check TTL — if expired, treat as a cache miss
        const ageMs = Date.now() - new Date(record.createdAt).getTime();
        if (ageMs > OCR_CACHE_TTL_SECONDS * 1000) {
            return null;
        }

        return record.result;
    } catch {
        // If cache table doesn't exist yet (migration pending), degrade gracefully
        return null;
    }
}

export async function setOcrCache(hash: string, result: any): Promise<void> {
    try {
        await prisma.ocrScanCache.upsert({
            where: { imageHash: hash },
            create: { imageHash: hash, result, createdAt: new Date() },
            update: { result, createdAt: new Date() }
        });
    } catch {
        // Non-critical: if cache write fails, OCR still proceeds
    }
}

export function startOcrCacheCleanup(): void {
    if (ocrCacheCleanupInterval) {
        clearInterval(ocrCacheCleanupInterval);
    }
    
    ocrCacheCleanupInterval = setInterval(async () => {
        try {
            const cutoff = new Date(Date.now() - OCR_CACHE_TTL_SECONDS * 1000);
            await prisma.ocrScanCache.deleteMany({
                where: { createdAt: { lt: cutoff } }
            });
        } catch (err: any) {
            if (process.env.NODE_ENV !== 'production') {
                secureLogger.warn('[OcrScanCache] TTL cleanup failed (migration pending?):', err?.message);
            }
        }
    }, 5 * 60 * 1000);
    
    // Keep unref so it doesn't block graceful shutdown
    ocrCacheCleanupInterval.unref();
}

export function stopOcrCacheCleanup(): void {
    if (ocrCacheCleanupInterval) {
        clearInterval(ocrCacheCleanupInterval);
        ocrCacheCleanupInterval = null;
    }
}
