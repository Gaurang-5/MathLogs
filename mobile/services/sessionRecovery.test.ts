/// <reference types="node" />

import assert from 'node:assert/strict';
import test from 'node:test';
import {
  SessionRecoveryCoordinator,
  StaleSessionRecoveryError,
  isSessionRejection,
  type SessionRecoveryDependencies,
  type SessionTokenPair,
} from './sessionRecovery';

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, reject, resolve };
}

function createHarness(overrides: Partial<SessionRecoveryDependencies> = {}) {
  const applied: Array<string | null> = [];
  const notified: Array<string | null> = [];
  const persisted: SessionTokenPair[] = [];
  const discarded: SessionTokenPair[] = [];
  const cleared: Array<string | null> = [];
  let refreshRequests = 0;

  const dependencies: SessionRecoveryDependencies = {
    readRefreshToken: async () => 'stored-refresh',
    requestRefresh: async () => {
      refreshRequests += 1;
      return { token: 'rotated-access', refreshToken: 'rotated-refresh' };
    },
    persistTokens: async (tokens) => {
      persisted.push(tokens);
    },
    discardTokens: async (tokens) => {
      discarded.push(tokens);
    },
    clearPersistedSession: async (expectedAccessToken, isStillInvalidated) => {
      if (isStillInvalidated()) cleared.push(expectedAccessToken);
    },
    isDefiniteRefreshFailure: isSessionRejection,
    applySession: (token) => {
      applied.push(token);
    },
    notifySession: (token) => {
      notified.push(token);
    },
    ...overrides,
  };

  return {
    applied,
    cleared,
    coordinator: new SessionRecoveryCoordinator(dependencies),
    discarded,
    get refreshRequests() {
      return refreshRequests;
    },
    incrementRefreshRequests: () => {
      refreshRequests += 1;
    },
    notified,
    persisted,
  };
}

test('classifies only 401 and plain Forbidden 403 as session rejection', () => {
  assert.equal(isSessionRejection({ response: { status: 401, data: { error: 'anything' } } }), true);
  assert.equal(isSessionRejection({ response: { status: 403, data: 'Forbidden' } }), true);
  assert.equal(isSessionRejection({ response: { status: 403, data: 'Forbidden\n' } }), true);

  assert.equal(isSessionRejection({
    response: {
      status: 403,
      data: { error: 'ENTERPRISE_PLAN_REQUIRED', message: 'Upgrade required' },
    },
  }), false);
  assert.equal(isSessionRejection({
    response: { status: 403, data: { success: false, error: 'SUPERADMIN_REQUIRED' } },
  }), false);
  assert.equal(isSessionRejection({ response: { status: 500, data: 'Forbidden' } }), false);
});

test('deduplicates concurrent refreshes and notifies only after rotated tokens persist', async () => {
  const refresh = deferred<SessionTokenPair>();
  const harness = createHarness({
    requestRefresh: async () => {
      harness.incrementRefreshRequests();
      return refresh.promise;
    },
  });
  harness.coordinator.setSession('expired-access');
  const generation = harness.coordinator.sessionGeneration;

  const first = harness.coordinator.recover('expired-access', generation);
  const second = harness.coordinator.recover('expired-access', generation);
  await Promise.resolve();

  assert.equal(harness.refreshRequests, 1);
  refresh.resolve({ token: 'rotated-access', refreshToken: 'rotated-refresh' });
  assert.deepEqual(await Promise.all([first, second]), ['rotated-access', 'rotated-access']);
  assert.deepEqual(harness.persisted, [
    { token: 'rotated-access', refreshToken: 'rotated-refresh' },
  ]);
  assert.deepEqual(harness.applied, ['expired-access', 'rotated-access']);
  assert.deepEqual(harness.notified, ['rotated-access']);

  const lateFailureRecovery = await harness.coordinator.recover('expired-access', generation);
  assert.equal(lateFailureRecovery, 'rotated-access');
  assert.equal(harness.refreshRequests, 1);
});

test('retains the session and propagates network, server, and structured access failures', async (t) => {
  const failures = [
    { label: 'network', error: new Error('offline') },
    { label: 'server', error: { response: { status: 500, data: { error: 'temporary' } } } },
    {
      label: 'structured access',
      error: { response: { status: 403, data: { error: 'ACCOUNT_SUSPENDED' } } },
    },
  ];

  for (const { label, error } of failures) {
    await t.test(label, async () => {
      const harness = createHarness({
        requestRefresh: async () => {
          throw error;
        },
      });
      harness.coordinator.setSession('expired-access');
      const generation = harness.coordinator.sessionGeneration;

      await assert.rejects(
        harness.coordinator.recover('expired-access', generation),
        (received) => received === error,
      );
      assert.equal(harness.coordinator.token, 'expired-access');
      assert.deepEqual(harness.cleared, []);
      assert.deepEqual(harness.notified, []);
    });
  }
});

test('definite refresh rejection clears persisted session and emits null', async () => {
  const rejection = { response: { status: 401, data: { error: 'Invalid refresh token' } } };
  const harness = createHarness({
    requestRefresh: async () => {
      throw rejection;
    },
  });
  harness.coordinator.setSession('expired-access');
  const generation = harness.coordinator.sessionGeneration;

  await assert.rejects(
    harness.coordinator.recover('expired-access', generation),
    (received) => received === rejection,
  );
  assert.equal(harness.coordinator.token, null);
  assert.deepEqual(harness.cleared, ['expired-access']);
  assert.deepEqual(harness.notified, [null]);
});

test('does not replay an old account request after the session generation changes', async () => {
  const harness = createHarness();
  harness.coordinator.setSession('account-a-access');
  const accountAGeneration = harness.coordinator.sessionGeneration;
  harness.coordinator.setSession('account-b-access');

  await assert.rejects(
    harness.coordinator.recover('account-a-access', accountAGeneration),
    StaleSessionRecoveryError,
  );
  assert.equal(harness.coordinator.token, 'account-b-access');
  assert.equal(harness.refreshRequests, 0);
  assert.deepEqual(harness.notified, []);
});

test('a refresh resolving after logout cannot restore the old session', async () => {
  const refresh = deferred<SessionTokenPair>();
  const harness = createHarness({ requestRefresh: () => refresh.promise });
  harness.coordinator.setSession('expired-access');
  const generation = harness.coordinator.sessionGeneration;
  const recovery = harness.coordinator.recover('expired-access', generation);
  await Promise.resolve();

  harness.coordinator.setSession(null);
  refresh.resolve({ token: 'stale-access', refreshToken: 'stale-refresh' });

  await assert.rejects(recovery, StaleSessionRecoveryError);
  assert.equal(harness.coordinator.token, null);
  assert.deepEqual(harness.persisted, []);
  assert.deepEqual(harness.notified, []);
  assert.deepEqual(harness.applied, ['expired-access', null]);
});

test('tokens persisted while logout occurs are discarded before recovery can apply them', async () => {
  const persist = deferred<void>();
  let persistenceStarted = false;
  const harness = createHarness({
    persistTokens: async (tokens) => {
      harness.persisted.push(tokens);
      persistenceStarted = true;
      await persist.promise;
    },
  });
  harness.coordinator.setSession('expired-access');
  const generation = harness.coordinator.sessionGeneration;
  const recovery = harness.coordinator.recover('expired-access', generation);

  while (!persistenceStarted) await Promise.resolve();
  harness.coordinator.setSession(null);
  persist.resolve();

  await assert.rejects(recovery, StaleSessionRecoveryError);
  assert.deepEqual(harness.discarded, [
    { token: 'rotated-access', refreshToken: 'rotated-refresh' },
  ]);
  assert.equal(harness.coordinator.token, null);
  assert.deepEqual(harness.notified, []);
});
