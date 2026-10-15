import test from 'node:test';
import assert from 'node:assert/strict';
import { GoogleGenerativeAI } from '@google/generative-ai';

process.env.GEMINI_API_KEY = 'test-key-no-network';

test('OCR preserves original image bytes and MIME type, with the single-box prompt', async () => {
    const { processOCR, STICKER_OCR_PROMPT, cleanExtractedScore } = await import('../src/utils/ocr');
    const original = GoogleGenerativeAI.prototype.getGenerativeModel;
    const calls: any[] = [];
    GoogleGenerativeAI.prototype.getGenerativeModel = ((config: any) => {
        assert.equal(config.model, 'gemini-3.5-flash-lite');
        assert.deepEqual(config.generationConfig.thinkingConfig, { thinkingLevel: 'minimal' });
        assert.equal(config.generationConfig.temperature, undefined);
        assert.equal(config.generationConfig.maxOutputTokens, 1024);
        return { generateContent: async (parts: any[], options: any) => {
            calls.push(parts);
            assert.ok(options.signal instanceof AbortSignal);
            return { response: { text: () => '{"score":"0"}' } };
        },
    }; }) as any;
    try {
        const bytes = Buffer.from('original image bytes');
        const result = await processOCR(bytes, 'image/png');
        assert.equal(result.score, '0');
        assert.equal('confidence' in result, false);
        assert.deepEqual(calls[0][1], { inlineData: { data: bytes.toString('base64'), mimeType: 'image/png' } });
        assert.equal(calls[0][0], STICKER_OCR_PROMPT);
        assert.match(STICKER_OCR_PROMPT, /ONE large/);
        await processOCR(`data:image/webp;base64,${bytes.toString('base64')}`);
        assert.deepEqual(calls[1][1], { inlineData: { data: bytes.toString('base64'), mimeType: 'image/webp' } });
        for (const value of ['0', '70', '7.5', '45/50']) assert.equal(cleanExtractedScore(value), value);
        for (const value of ['ERROR_UNCERTAIN', 'student 123 score 45', '7 0', '', 42]) assert.equal(cleanExtractedScore(value), '');
    } finally {
        GoogleGenerativeAI.prototype.getGenerativeModel = original;
    }
});

test('falls back from 3.5 Flash-Lite to 3.8 Flash with its supported thinking level', async () => {
    const { processOCR } = await import('../src/utils/ocr');
    const original = GoogleGenerativeAI.prototype.getGenerativeModel;
    const calls: string[] = [];
    GoogleGenerativeAI.prototype.getGenerativeModel = ((config: any) => ({ generateContent: async () => {
        calls.push(config.model);
        if (config.model === 'gemini-3.5-flash-lite') throw new Error('Provider unavailable');
        assert.equal(config.model, 'gemini-3.8-flash');
        assert.deepEqual(config.generationConfig.thinkingConfig, { thinkingLevel: 'low' });
        assert.equal(config.generationConfig.temperature, undefined);
        return { response: { text: () => '{"score":"4"}' } };
    } })) as any;
    try {
        assert.equal((await processOCR(Buffer.from('photo'))).score, '4');
        assert.deepEqual(calls, ['gemini-3.5-flash-lite', 'gemini-3.8-flash']);
    } finally { GoogleGenerativeAI.prototype.getGenerativeModel = original; }
});

test('does not ask a second model to guess after an explicit uncertain result', async () => {
    const { processOCR } = await import('../src/utils/ocr');
    const original = GoogleGenerativeAI.prototype.getGenerativeModel;
    let calls = 0;
    GoogleGenerativeAI.prototype.getGenerativeModel = (() => ({ generateContent: async () => {
        calls++;
        return { response: { text: () => '{"score":"ERROR_UNCERTAIN"}' } };
    } })) as any;
    try {
        assert.equal((await processOCR(Buffer.from('photo'))).score, 'ERROR_UNCERTAIN');
        assert.equal(calls, 1);
        const controller = new AbortController(); controller.abort();
        await processOCR(Buffer.from('photo'), 'image/jpeg', { signal: controller.signal });
        assert.equal(calls, 1);
    } finally { GoogleGenerativeAI.prototype.getGenerativeModel = original; }
});


test('bounds a stalled provider and distinguishes failure from illegible handwriting', async () => {
    const { processOCR } = await import('../src/utils/ocr');
    const original = GoogleGenerativeAI.prototype.getGenerativeModel;
    let requestSignal: AbortSignal | undefined;
    GoogleGenerativeAI.prototype.getGenerativeModel = (() => ({ generateContent: (_: unknown, options: any) => {
        requestSignal = options.signal;
        return new Promise(() => {});
    } })) as any;
    try {
        const started = Date.now();
        const result = await processOCR(Buffer.from('photo'), 'image/png', { timeoutMs: 25 });
        assert.equal(result.reason, 'timeout');
        assert.equal(result.score, 'GEMINI_ERROR');
        assert.equal(requestSignal?.aborted, true);
        assert.ok(Date.now() - started < 500);
    } finally { GoogleGenerativeAI.prototype.getGenerativeModel = original; }
});

test('provider outages do not become an uncertain handwriting result', async () => {
    const { processOCR } = await import('../src/utils/ocr');
    const original = GoogleGenerativeAI.prototype.getGenerativeModel;
    GoogleGenerativeAI.prototype.getGenerativeModel = (() => ({ generateContent: async () => { throw new Error('Unavailable'); } })) as any;
    try {
        assert.equal((await processOCR(Buffer.from('photo'))).reason, 'provider_error');
    } finally { GoogleGenerativeAI.prototype.getGenerativeModel = original; }
});

test('starts fallback for a slow primary and cancels the losing request after a reading', async () => {
    const { processOCR } = await import('../src/utils/ocr');
    const original = GoogleGenerativeAI.prototype.getGenerativeModel;
    const calls: string[] = []; let primarySignal: AbortSignal | undefined;
    GoogleGenerativeAI.prototype.getGenerativeModel = ((config: any) => ({ generateContent: async (_: any, options: any) => {
        calls.push(config.model);
        if (config.model === 'gemini-3.5-flash-lite') { primarySignal = options.signal; return new Promise(() => {}); }
        return { response: { text: () => '{"score":"4"}' } };
    } })) as any;
    try {
        assert.equal((await processOCR(Buffer.from('large original photo'), 'image/png', { timeoutMs: 500, fallbackDelayMs: 10 })).score, '4');
        assert.deepEqual(calls, ['gemini-3.5-flash-lite', 'gemini-3.8-flash']);
        assert.equal(primarySignal?.aborted, true);
    } finally { GoogleGenerativeAI.prototype.getGenerativeModel = original; }
});

test('a healthy slow primary can still succeed after the fallback becomes unavailable', async () => {
    const { processOCR } = await import('../src/utils/ocr');
    const original = GoogleGenerativeAI.prototype.getGenerativeModel;
    GoogleGenerativeAI.prototype.getGenerativeModel = ((config: any) => ({ generateContent: async () => {
        if (config.model === 'gemini-3.8-flash') throw Object.assign(new Error('Unavailable'), { status: 503 });
        await new Promise(resolve => setTimeout(resolve, 30));
        return { response: { text: () => '{"score":"12"}' } };
    } })) as any;
    try {
        assert.equal((await processOCR(Buffer.from('photo'), 'image/png', { timeoutMs: 500, fallbackDelayMs: 5 })).score, '12');
    } finally { GoogleGenerativeAI.prototype.getGenerativeModel = original; }
});
