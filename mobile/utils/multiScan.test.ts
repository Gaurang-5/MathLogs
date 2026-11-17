/// <reference types="node" />
import assert from 'node:assert/strict';
import test from 'node:test';
import { upsertQueuedMark, validateQueuedMarks, type QueuedMark } from './multiScan';

const queued = (studentId: string, score: string): QueuedMark => ({
  studentId,
  studentName: `Student ${studentId}`,
  humanId: null,
  batchName: 'Batch A',
  score,
  existingMark: null,
  researchCaptureId: `capture-${studentId}`,
});

test('queues different students in capture order', () => {
  const first = upsertQueuedMark([], queued('one', '12'));
  const second = upsertQueuedMark(first.queue, queued('two', '18'));
  assert.deepEqual(second.queue.map(item => item.studentId), ['one', 'two']);
  assert.equal(second.replaced, null);
});

test('replaces a duplicate student instead of creating a duplicate save', () => {
  const original = queued('one', '12');
  const replacement = queued('one', '19');
  const result = upsertQueuedMark([original, queued('two', '18')], replacement);
  assert.equal(result.queue.length, 2);
  assert.equal(result.queue.at(-1)?.score, '19');
  assert.equal(result.replaced?.researchCaptureId, 'capture-one');
});

test('validates every queued score against the selected test maximum', () => {
  const result = validateQueuedMarks([queued('one', '20'), queued('two', '20.5')], 20);
  assert.equal(result[0].validation.ok, true);
  assert.deepEqual(result[1].validation, { ok: false, message: 'Marks cannot exceed 20.' });
});
