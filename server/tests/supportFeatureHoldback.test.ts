import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { createApp } from '../src/index';
import { isSupportFeatureEnabled } from '../src/config/featureFlags';

let server: Server;
let baseUrl: string;
const originalSupportFlag = process.env.SUPPORT_FEATURE_ENABLED;

before(async () => {
  const app = createApp();
  await new Promise<void>((resolve) => {
    server = app.listen(0, resolve);
  });
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

after(async () => {
  if (originalSupportFlag === undefined) delete process.env.SUPPORT_FEATURE_ENABLED;
  else process.env.SUPPORT_FEATURE_ENABLED = originalSupportFlag;
  await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
});

test('Support feature parsing defaults closed and accepts only normalized true', () => {
  assert.equal(isSupportFeatureEnabled(undefined), false);
  assert.equal(isSupportFeatureEnabled('false'), false);
  assert.equal(isSupportFeatureEnabled('1'), false);
  assert.equal(isSupportFeatureEnabled(' TRUE '), true);
});

test('disabled Support endpoints are hidden before auth while communication consent remains live', async () => {
  process.env.SUPPORT_FEATURE_ENABLED = 'false';

  const responses = await Promise.all([
    fetch(`${baseUrl}/api/support/tickets`),
    fetch(`${baseUrl}/api/support/attachments/missing`),
    fetch(`${baseUrl}/api/super-admin/support/tickets`),
    fetch(`${baseUrl}/api/super-admin/support/cases`),
    fetch(`${baseUrl}/api/super-admin/support-sessions`, { method: 'POST' })
  ]);

  for (const response of responses) {
    assert.equal(response.status, 404);
    assert.deepEqual(await response.json(), { success: false, error: 'NOT_FOUND' });
  }

  assert.equal((await fetch(`${baseUrl}/api/communication-preferences`)).status, 401);
});

test('explicit enablement restores existing Support authentication boundaries', async () => {
  process.env.SUPPORT_FEATURE_ENABLED = 'true';

  assert.equal((await fetch(`${baseUrl}/api/support/tickets`)).status, 401);
  assert.equal((await fetch(`${baseUrl}/api/super-admin/support/tickets`)).status, 401);
});
