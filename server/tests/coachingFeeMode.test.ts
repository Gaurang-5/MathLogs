import test from 'node:test';
import assert from 'node:assert/strict';
import { requireCoachingFeeMode } from '../src/middleware/requireCoachingFeeMode';

function response() {
  return {
    statusCode: 200,
    body: undefined as unknown,
    status(code: number) { this.statusCode = code; return this; },
    json(body: unknown) { this.body = body; return this; },
  };
}

test('legacy guard rejects a month coverage institute', async () => {
  const req = { user: { instituteId: 'inst-1' } } as never;
  const res = response();
  const next = () => assert.fail('next must not run');

  await requireCoachingFeeMode('CURRENT_DUE_BASED', async () => 'MONTH_COVERAGE')(req, res as never, next);

  assert.equal(res.statusCode, 409);
  assert.deepEqual(res.body, {
    error: 'FEE_MODE_MISMATCH',
    expected: 'CURRENT_DUE_BASED',
    actual: 'MONTH_COVERAGE',
  });
});

test('month coverage guard accepts a month coverage institute', async () => {
  const req = { user: { instituteId: 'inst-1' } } as never;
  const res = response();
  let nextCalls = 0;

  await requireCoachingFeeMode('MONTH_COVERAGE', async () => 'MONTH_COVERAGE')(
    req,
    res as never,
    () => { nextCalls += 1; },
  );

  assert.equal(nextCalls, 1);
  assert.equal(res.statusCode, 200);
  assert.equal(res.body, undefined);
});

test('guard rejects requests without institute context', async () => {
  const req = { user: {} } as never;
  const res = response();

  await requireCoachingFeeMode('CURRENT_DUE_BASED', async () => assert.fail('loader must not run'))(
    req,
    res as never,
    () => assert.fail('next must not run'),
  );

  assert.equal(res.statusCode, 401);
  assert.deepEqual(res.body, { error: 'Missing institute context' });
});
