import test from 'node:test';
import assert from 'node:assert/strict';
import type { Block } from '@aws-sdk/client-textract';
import { extractScoreFromBlocks } from '../src/utils/ocrTextract';

function makeWord(text: string, left: number, width = 0.1, confidence = 98): Block {
    return {
        BlockType: 'WORD',
        Text: text,
        Confidence: confidence,
        Geometry: {
            BoundingBox: {
                Left: left,
                Top: 0.28,
                Width: width,
                Height: 0.24,
            },
        },
    };
}

test('extractScoreFromBlocks combines handwritten digits from left to right', () => {
    const result = extractScoreFromBlocks([
        makeWord('7', 0.12),
        makeWord('0', 0.46),
    ]);

    assert.equal(result.score, '70');
    assert.equal(result.rawTexts.length, 2);
});

test('extractScoreFromBlocks trims noisy leading digits when they exceed max marks', () => {
    const result = extractScoreFromBlocks([
        makeWord('8', 0.1),
        makeWord('5', 0.48),
    ], 20);

    assert.equal(result.score, '5');
});

test('extractScoreFromBlocks prefers the strongest candidate inside each sticker box', () => {
    const result = extractScoreFromBlocks([
        makeWord('7', 0.12, 0.08, 97),
        makeWord('1', 0.2, 0.05, 45),
        makeWord('4', 0.48, 0.08, 96),
    ], 99);

    assert.equal(result.score, '74');
});

test('extractScoreFromBlocks does not invent a middle zero for two-digit tests', () => {
    const result = extractScoreFromBlocks([
        makeWord('1', 0.12),
        makeWord('5', 0.79),
    ], 20);

    assert.equal(result.score, '15');
});
