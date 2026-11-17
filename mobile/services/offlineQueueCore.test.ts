/// <reference types="node" />

import assert from 'node:assert/strict';
import test from 'node:test';
import {
  parseStoredQueue,
  reconcileQueuedActions,
  type QueuedAction,
} from './offlineQueueCore';

function action(id: string, overrides: Partial<QueuedAction> = {}): QueuedAction {
  return {
    id,
    accountScope: 'institute-a:user-a',
    method: 'POST',
    url: '/tests',
    data: { name: id },
    headers: { 'Idempotency-Key': `mobile:${id}` },
    timestamp: 1_700_000_000_000,
    retryCount: 0,
    ...overrides,
  };
}

test('stored queues are account scoped and reject malformed actions', () => {
  const valid = action('valid');
  const otherAccount = action('other', { accountScope: 'institute-b:user-b' });
  const missingMethod = { ...action('broken'), method: undefined };
  const parsed = parseStoredQueue(
    JSON.stringify([valid, otherAccount, missingMethod, null, 'invalid']),
    'institute-a:user-a',
  );

  assert.deepEqual(parsed, [valid]);
  assert.deepEqual(parseStoredQueue('{not-json', 'institute-a:user-a'), []);
  assert.deepEqual(parseStoredQueue(JSON.stringify({ action: valid }), 'institute-a:user-a'), []);
});

test('successful actions are removed while failed actions remain for retry', () => {
  const completed = action('completed');
  const failed = action('failed', { retryCount: 2 });
  const next = reconcileQueuedActions(
    [completed, failed],
    [
      { id: completed.id, status: 'processed' },
      { id: failed.id, status: 'failed' },
    ],
  );

  assert.deepEqual(next, [{ ...failed, retryCount: 3 }]);
  assert.equal(next[0].headers?.['Idempotency-Key'], 'mobile:failed');
});

test('an action added during sync is preserved when the snapshot is reconciled', () => {
  const snapshotAction = action('snapshot');
  const addedDuringSync = action('newer', { timestamp: snapshotAction.timestamp + 1 });
  const next = reconcileQueuedActions(
    [snapshotAction, addedDuringSync],
    [{ id: snapshotAction.id, status: 'processed' }],
  );

  assert.deepEqual(next, [addedDuringSync]);
});

test('actions without an outcome remain unchanged after an account switch interrupts sync', () => {
  const completed = action('completed');
  const notAttempted = action('not-attempted');
  const next = reconcileQueuedActions(
    [completed, notAttempted],
    [{ id: completed.id, status: 'processed' }],
  );

  assert.deepEqual(next, [notAttempted]);
  assert.equal(next[0].retryCount, 0);
});
