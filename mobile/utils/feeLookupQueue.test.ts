/// <reference types="node" />
import assert from 'node:assert/strict';
import test from 'node:test';
import { QueriesObserver, QueryClient } from '@tanstack/query-core';
import { createFeeLookupQueue } from './feeLookupQueue';

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(done => { resolve = done; });
  return { promise, resolve };
}

test('a completed student query publishes while another student lookup is still pending', async () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  const queue = createFeeLookupQueue(2, 1000);
  const slow = deferred<string>();
  const visible = deferred<void>();
  const observer = new QueriesObserver(client, [
    { queryKey: ['fee', 'slow'], queryFn: ({ signal }) => queue.run(() => slow.promise, signal) },
    { queryKey: ['fee', 'ready'], queryFn: ({ signal }) => queue.run(async () => '₹600 pending', signal) },
  ]);
  const stop = observer.subscribe(results => {
    if (results[1].data === '₹600 pending') {
      assert.equal(results[0].fetchStatus, 'fetching');
      visible.resolve();
    }
  });
  try {
    await visible.promise;
    assert.equal(observer.getCurrentResult()[1].data, '₹600 pending');
  } finally {
    stop(); client.clear(); slow.resolve('late result');
  }
});

test('queue bounds requests and releases the next lookup when a slot completes', async () => {
  const queue = createFeeLookupQueue(1, 1000);
  const first = deferred<number>();
  const controller = new AbortController();
  let secondStarted = false;
  const a = queue.run(() => first.promise, controller.signal);
  const b = queue.run(async () => { secondStarted = true; return 2; }, controller.signal);
  await Promise.resolve();
  assert.equal(secondStarted, false);
  first.resolve(1);
  assert.deepEqual(await Promise.all([a, b]), [1, 2]);
  assert.equal(secondStarted, true);
});

test('a stalled request and queued requests have a finite deadline', async () => {
  const queue = createFeeLookupQueue(1, 30);
  let requestSignal: AbortSignal | undefined;
  const controller = new AbortController();
  const a = queue.run(signal => { requestSignal = signal; return new Promise(() => {}); }, controller.signal);
  const b = queue.run(() => new Promise(() => {}), controller.signal);
  const results = await Promise.allSettled([a, b]);
  assert.equal(results[0].status, 'rejected');
  assert.equal(results[1].status, 'rejected');
  assert.equal(requestSignal?.aborted, true);
  assert.equal(await queue.run(async () => 'retry succeeded', controller.signal), 'retry succeeded');
});

test('leaving an account cancels active and queued work without publishing a late result', async () => {
  const queue = createFeeLookupQueue(1, 1000);
  const controller = new AbortController();
  const old = deferred<string>();
  let queuedStarted = false;
  const a = queue.run(() => old.promise, controller.signal);
  const b = queue.run(async () => { queuedStarted = true; return 'old account'; }, controller.signal);
  const outcome = Promise.allSettled([a, b]);
  await Promise.resolve();
  controller.abort();
  old.resolve('late old account result');
  assert.deepEqual((await outcome).map(result => result.status), ['rejected', 'rejected']);
  assert.equal(queuedStarted, false);
  assert.equal(await queue.run(async () => 'new account', new AbortController().signal), 'new account');
});
