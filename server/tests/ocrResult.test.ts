import test from 'node:test';
import assert from 'node:assert/strict';
import { buildGeminiOcrResult } from '../src/utils/ocrResult';

test('buildGeminiOcrResult returns a successful Gemini scan as the OCR result', () => {
    assert.deepEqual(
        buildGeminiOcrResult({ score: '42', raw: 'detected 42' }),
        { score: '42', status: 'read', raw: 'detected 42', source: 'gemini' },
    );
});

test('buildGeminiOcrResult converts an unsuccessful Gemini scan into an uncertain result', () => {
    assert.deepEqual(
        buildGeminiOcrResult({ score: 'GEMINI_ERROR', raw: 'request failed' }),
        { score: 'ERROR_UNCERTAIN', status: 'needs_review', raw: 'request failed', source: 'none' },
    );
});


test('does not propagate unmeasured confidence, including legacy input', () => {
    const legacyResult = { score: '0', confidence: 0.95, raw: 'zero' };
    const result = buildGeminiOcrResult(legacyResult);
    assert.equal(result.status, 'read');
    assert.equal('confidence' in result, false);
});
