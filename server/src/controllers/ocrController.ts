import { Request, Response } from 'express';
import crypto from 'crypto';
import { processOCR } from '../utils/ocr';
import { buildGeminiOcrResult } from '../utils/ocrResult';
import { checkOcrCache, setOcrCache } from '../utils/ocrCache';
import { secureLogger } from '../utils/secureLogger';
import { readOcrCacheFast } from '../utils/ocrTiming';


export const scanOcr = async (req: Request, res: Response) => {
    try {
        secureLogger.info("📥 Received OCR Request", req.user?.username);

        let imageBuffer: Buffer | string | undefined;

        if (req.file) {
            secureLogger.info(`📎 File received: ${req.file.originalname} (${req.file.size} bytes)`);
            imageBuffer = req.file.buffer;
        } else if (req.body.image) {
            // Fallback for JSON Base64 (Legacy/Dev)
            secureLogger.info("⚠️ Legacy Base64 JSON received");
            imageBuffer = req.body.image;
        }

        if (!imageBuffer) {
            console.error("❌ No image data found in request");
            return res.status(400).json({ error: "Missing image data" });
        }

        // Compute SHA-256 of raw image bytes for deduplication asynchronously to avoid blocking the event loop
        const rawBuffer = req.file ? req.file.buffer : Buffer.from(imageBuffer.toString().replace(/^data:image\/[^;]+;base64,/, ''), 'base64');
        const hash = crypto.createHash('sha256').update('sticker-single-box-v5-gemini35-38:').update(rawBuffer).digest('hex');

        // Check DB-backed cache first (works across all server instances)
        const cached = await readOcrCacheFast(() => checkOcrCache(hash));
        if (cached) {
            secureLogger.info("♻️ Duplicate Scan — Returning DB-Cached Result");
            return res.json(cached);
        }

        const gemini = await processOCR(imageBuffer, req.file?.mimetype).catch((error: any) => ({
            score: 'GEMINI_ERROR',
            raw: '',
            reason: 'provider_error' as const,
        }));
        const primary = buildGeminiOcrResult(gemini);
        secureLogger.info('OCR completed', { status: primary.status, source: primary.source });

        if (primary.status === 'read') void setOcrCache(hash, primary);
        res.json(primary);

    } catch (error: any) {
        console.error("❌ OCR Proxy Error:", error);
        res.status(500).json({ error: "OCR Processing Failed", details: error.message });
    }
};
