export type OcrEngineResult = {
    score: string;
    confidence: number;
    raw: string;
};

export type OcrResponse = OcrEngineResult & {
    source: 'gemini' | 'none';
};

export function buildGeminiOcrResult(result: OcrEngineResult): OcrResponse {
    if (result.score && !result.score.includes('ERROR')) {
        return { ...result, source: 'gemini' };
    }

    return {
        score: 'ERROR_UNCERTAIN',
        confidence: 0,
        raw: result.raw,
        source: 'none',
    };
}
