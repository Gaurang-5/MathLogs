/// <reference types="node" />
import assert from 'node:assert/strict';
import test from 'node:test';
import { validateMark } from './marks';

test('accepts zero, whole, and decimal marks at or below the maximum', () => {
  assert.deepEqual(validateMark('0', 50), { ok: true, score: 0 });
  assert.deepEqual(validateMark('49.5', 50), { ok: true, score: 49.5 });
  assert.deepEqual(validateMark('50', 50), { ok: true, score: 50 });
});

test('rejects empty, malformed, negative, and over-maximum marks', () => {
  for (const value of ['', '.', '1.2.3', '-1', 'five']) assert.equal(validateMark(value, 50).ok, false);
  assert.deepEqual(validateMark('50.1', 50), { ok: false, message: 'Marks cannot exceed 50.' });
});
