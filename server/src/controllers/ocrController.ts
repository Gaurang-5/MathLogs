import { Request, Response } from 'express';
import crypto from 'crypto';
import { processOCR } from '../utils/ocr';
import { processOCRTextract } from '../utils/ocrTextract';
import { checkOcrCache, setOcrCache } from '../utils/ocrCache';
import { secureLogger } from '../utils/secureLogger';


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
        const rawBuffer = req.file ? req.file.buffer : Buffer.from(imageBuffer.toString(), 'base64');
        const hash = crypto.createHash('sha256').update(rawBuffer).digest('hex');

        // Check DB-backed cache first (works across all server instances)
        const cached = await checkOcrCache(hash);
        if (cached) {
            secureLogger.info("♻️ Duplicate Scan — Returning DB-Cached Result");
            return res.json(cached);
        }

        // DUAL ENGINE: Textract + Gemini run in parallel
        // Parse maxMarks from form data (sent alongside the image)
        const maxMarks = req.body.maxMarks ? parseFloat(req.body.maxMarks) : undefined;
        if (maxMarks) secureLogger.info(`📏 MaxMarks constraint: ${maxMarks}`);

        const [geminiResult, textractResult] = await Promise.allSettled([
            processOCR(imageBuffer),
            processOCRTextract(imageBuffer, maxMarks).catch((err: any) => {
                secureLogger.warn("⚠️ Textract failed:", err.message);
                return { score: "TEXTRACT_ERROR", confidence: 0, raw: err.message, rawTexts: [] };
            })
        ]);

        const gemini = geminiResult.status === 'fulfilled'
            ? geminiResult.value
            : { score: "GEMINI_ERROR", confidence: 0, raw: (geminiResult as any).reason?.message || "Unknown error" };

        const textract = textractResult.status === 'fulfilled'
            ? textractResult.value
            : { score: "TEXTRACT_ERROR", confidence: 0, raw: (textractResult as any).reason?.message || "Unknown error", rawTexts: [] };

        const match = gemini.score === (textract as any).score;
        secureLogger.info(`✅ OCR | Gemini: "${gemini.score}" (${(gemini.confidence * 100).toFixed(0)}%) | Textract: "${(textract as any).score}" (${((textract as any).confidence * 100).toFixed(0)}%) | Match: ${match ? '✅' : '❌'}`);

        const geminiOk = gemini.score && !gemini.score.includes('ERROR');
        const textractOk = (textract as any).score && !(textract as any).score.includes('ERROR');
        let primary: { score: string; confidence: number; raw: string; source: string };

        if (geminiOk && textractOk && match) {
            primary = { score: gemini.score, confidence: Math.min(1, gemini.confidence + 0.1), raw: gemini.raw, source: 'both' };
        } else if (geminiOk) {
            primary = { score: gemini.score, confidence: gemini.confidence, raw: gemini.raw, source: 'gemini' };
        } else if (textractOk) {
            primary = { score: (textract as any).score, confidence: (textract as any).confidence, raw: (textract as any).raw, source: 'textract' };
        } else {
            primary = { score: "ERROR_UNCERTAIN", confidence: 0, raw: "Both engines failed", source: 'none' };
        }

        await setOcrCache(hash, primary);
        res.json({ score: primary.score, confidence: primary.confidence, raw: primary.raw, source: primary.source });

    } catch (error: any) {
        console.error("❌ OCR Proxy Error:", error);
        res.status(500).json({ error: "OCR Processing Failed", details: error.message });
    }
};
