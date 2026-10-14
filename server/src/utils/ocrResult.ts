export type OcrEngineResult = {
    score: string;
    raw: string;
    reason?: 'timeout' | 'provider_error';
};

export type OcrResponse = OcrEngineResult & {
    status: 'read' | 'needs_review';
    source: 'gemini' | 'none';
};

/** A model reading is not a measured probability of correctness. */
export function buildGeminiOcrResult(result: OcrEngineResult): OcrResponse {
    const read = /^\d+(?:\.\d+)?(?:\/\d+(?:\.\d+)?)?$/.test(result.score);
    return {
        score: read ? result.score : 'ERROR_UNCERTAIN',
        status: read ? 'read' : 'needs_review',
        raw: result.raw,
        source: read ? 'gemini' : 'none',
        ...(result.reason ? { reason: result.reason } : {}),
    };
}
