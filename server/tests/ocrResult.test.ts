import test from 'node:test';
import assert from 'node:assert/strict';
import { buildGeminiOcrResult } from '../src/utils/ocrResult';

test('buildGeminiOcrResult returns a successful Gemini scan as the OCR result', () => {
    assert.deepEqual(
        buildGeminiOcrResult({ score: '42', confidence: 0.87, raw: 'detected 42' }),
        { score: '42', confidence: 0.87, raw: 'detected 42', source: 'gemini' },
    );
});

test('buildGeminiOcrResult converts an unsuccessful Gemini scan into an uncertain result', () => {
    assert.deepEqual(
        buildGeminiOcrResult({ score: 'GEMINI_ERROR', confidence: 0, raw: 'request failed' }),
        { score: 'ERROR_UNCERTAIN', confidence: 0, raw: 'request failed', source: 'none' },
    );
});
