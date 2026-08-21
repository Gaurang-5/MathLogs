import test, { afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { prisma } from '../src/prisma';
import { setupAccount } from '../src/controllers/inviteController';
import { requireCoachingFeeMode } from '../src/middleware/requireCoachingFeeMode';

function response() {
  return {
    statusCode: 200,
    body: undefined as unknown,
    status(code: number) { this.statusCode = code; return this; },
    json(body: unknown) { this.body = body; return this; },
  };
}

const restores: Array<() => void> = [];

function replaceMethod<T extends object, K extends keyof T>(target: T, key: K, replacement: T[K]) {
  const original = target[key];
  target[key] = replacement;
  restores.push(() => { target[key] = original; });
}

afterEach(() => {
  while (restores.length > 0) restores.pop()?.();
});

const testNow = new Date();

function usedInvite(
  coachingFeeMode: 'CURRENT_DUE_BASED' | 'MONTH_COVERAGE',
  coachingFeeModeSelectedAt = new Date(testNow.getTime() - 60_000),
) {
  return {
    id: 'invite-1',
    instituteId: 'inst-1',
    isUsed: true,
    expiresAt: new Date('2026-12-01T00:00:00.000Z'),
    institute: {
      coachingFeeMode,
      coachingFeeModeSelectedAt,
      plan: 'MARKETPLACE',
    },
  } as never;
}

const reusableAdmin = {
  id: 'admin-1',
  username: 'teacher',
  passwordVersion: 0,
  instituteId: 'inst-1',
  role: 'INSTITUTE_ADMIN',
} as never;

const replayRequest = {
  body: {
    token: 'invite-token',
    username: 'teacher',
    password: 'secret123',
    city: 'Pune',
    area: 'Kothrud',
    subjectsOffered: ['Mathematics'],
    allowedClasses: ['10'],
    requiresGrades: true,
    googleMapsUrl: 'https://maps.example.test/place',
    isPubliclyListed: true,
    tagline: 'Exam prep',
    description: 'Coaching for board exams',
    coachingFeeMode: 'MONTH_COVERAGE',
  },
} as never;

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

test('month coverage guard rejects a current due-based institute', async () => {
  const req = { user: { instituteId: 'inst-1' } } as never;
  const res = response();

  await requireCoachingFeeMode('MONTH_COVERAGE', async () => 'CURRENT_DUE_BASED')(
    req,
    res as never,
    () => assert.fail('next must not run'),
  );

  assert.equal(res.statusCode, 409);
  assert.deepEqual(res.body, {
    error: 'FEE_MODE_MISMATCH',
    expected: 'MONTH_COVERAGE',
    actual: 'CURRENT_DUE_BASED',
  });
});

test('legacy guard accepts a current due-based institute', async () => {
  const req = { user: { instituteId: 'inst-1' } } as never;
  const res = response();
  let nextCalls = 0;

  await requireCoachingFeeMode('CURRENT_DUE_BASED', async () => 'CURRENT_DUE_BASED')(
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

test('used invite with the selected mode returns a reusable login without rewriting mode', async () => {
  replaceMethod(prisma.inviteToken, 'findUnique', (async () => usedInvite('MONTH_COVERAGE')) as typeof prisma.inviteToken.findUnique);
  replaceMethod(prisma.admin, 'findFirst', (async () => reusableAdmin) as typeof prisma.admin.findFirst);
  let transactionCalls = 0;
  replaceMethod(prisma, '$transaction', (async () => {
    transactionCalls += 1;
    assert.fail('a used invite replay must not rewrite setup data');
  }) as typeof prisma.$transaction);
  const res = response();

  await setupAccount(replayRequest, res as never);

  assert.equal(res.statusCode, 200);
  assert.deepEqual({
    ...(res.body as Record<string, unknown>),
    token: typeof (res.body as Record<string, unknown>).token,
  }, {
    success: true,
    token: 'string',
    adminId: 'admin-1',
    isQuizOnly: false,
  });
  assert.equal(transactionCalls, 0);
});

test('used invite replay after five minutes is rejected without issuing a token', async () => {
  replaceMethod(
    prisma.inviteToken,
    'findUnique',
    (async () => usedInvite('MONTH_COVERAGE', new Date(testNow.getTime() - 5 * 60_000 - 1))) as typeof prisma.inviteToken.findUnique,
  );
  replaceMethod(prisma.admin, 'findFirst', (async () => assert.fail('expired replay must not load an admin')) as typeof prisma.admin.findFirst);
  replaceMethod(prisma, '$transaction', (async () => assert.fail('expired replay must not rewrite setup data')) as typeof prisma.$transaction);
  const res = response();

  await setupAccount(replayRequest, res as never);

  assert.equal(res.statusCode, 400);
  assert.deepEqual(res.body, { error: 'Invalid or expired token' });
});

test('used invite with a conflicting selected mode returns 409 without attempting a rewrite', async () => {
  replaceMethod(prisma.inviteToken, 'findUnique', (async () => usedInvite('CURRENT_DUE_BASED')) as typeof prisma.inviteToken.findUnique);
  replaceMethod(prisma.admin, 'findFirst', (async () => assert.fail('conflicting replay must not load an admin')) as typeof prisma.admin.findFirst);
  replaceMethod(prisma, '$transaction', (async () => assert.fail('conflicting replay must not rewrite setup data')) as typeof prisma.$transaction);
  const res = response();

  await setupAccount(replayRequest, res as never);

  assert.equal(res.statusCode, 409);
  assert.deepEqual(res.body, { error: 'Coaching fee mode has already been selected' });
});

test('unknown and expired setup tokens remain rejected', async () => {
  const cases = [
    null,
    { ...usedInvite('MONTH_COVERAGE'), isUsed: false, expiresAt: new Date('2026-08-01T00:00:00.000Z') },
  ];

  for (const invite of cases) {
    replaceMethod(prisma.inviteToken, 'findUnique', (async () => invite) as typeof prisma.inviteToken.findUnique);
    const res = response();

    await setupAccount(replayRequest, res as never);

    assert.equal(res.statusCode, 400);
    assert.deepEqual(res.body, { error: 'Invalid or expired token' });
    restores.pop()?.();
  }
});
