import test, { afterEach } from 'node:test';
import assert from 'node:assert/strict';
import type { Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { prisma } from '../src/prisma';
import * as portalController from '../src/controllers/studentPortalController';

const restores: Array<() => void> = [];

function replaceMethod<T extends object, K extends keyof T>(target: T, key: K, replacement: T[K]) {
  const original = target[key];
  target[key] = replacement;
  restores.push(() => { target[key] = original; });
}

function responseHarness() {
  let statusCode = 200;
  let body: any;
  const response = {
    status(code: number) { statusCode = code; return this; },
    json(value: unknown) { body = value; return this; },
  } as unknown as Response;
  return { response, result: () => ({ statusCode, body }) };
}

afterEach(() => {
  while (restores.length) restores.pop()?.();
});

test('OTP verification returns a selector instead of choosing the first shared-phone profile', async () => {
  replaceMethod(prisma.institute, 'findUnique', (async () => ({ id: 'i1', name: 'MathLogs Academy' }) as never) as typeof prisma.institute.findUnique);
  replaceMethod(prisma.otpToken, 'findUnique', (async () => ({
    otp: '123456', expiresAt: new Date(Date.now() + 60_000), verified: false,
  }) as never) as typeof prisma.otpToken.findUnique);
  replaceMethod(prisma.otpToken, 'deleteMany', (async () => ({count:1}) as never) as typeof prisma.otpToken.deleteMany);
  replaceMethod(prisma.student, 'findMany', (async () => ([
    { id: 's1', humanId: 'ML-001', name: 'Riya', enrollments: [{ batch: { name: 'Class 10 Boys' } }] },
    { id: 's2', humanId: 'ML-002', name: 'Siya', enrollments: [{ batch: { name: 'Class 8 Girls' } }] },
  ]) as never) as typeof prisma.student.findMany);
  const { response, result } = responseHarness();

  await portalController.verifyStudentLoginOtp({ body: {
    instituteSlug: 'mathlogs', mobileNumber: '9876543210', otp: '123456',
  } } as Request, response);

  assert.equal(result().statusCode, 200);
  assert.equal('token' in result().body, false);
  assert.deepEqual(result().body.students, [
    { id: 's1', humanId: 'ML-001', name: 'Riya', activeBatchNames: ['Class 10 Boys'] },
    { id: 's2', humanId: 'ML-002', name: 'Siya', activeBatchNames: ['Class 8 Girls'] },
  ]);
  const claims = jwt.verify(result().body.selectionToken, 'test-secret') as any;
  assert.equal(claims.purpose, 'STUDENT_ACCOUNT_SELECTION');
  assert.deepEqual(claims.studentIds, ['s1', 's2']);
});

test('selection token cannot authorize a student outside its signed profile list', async () => {
  const selectStudentAccount = (portalController as any).selectStudentAccount;
  assert.equal(typeof selectStudentAccount, 'function');
  const selectionToken = jwt.sign({
    purpose: 'STUDENT_ACCOUNT_SELECTION', instituteId: 'i1', normalizedPhone: '9876543210', studentIds: ['s1', 's2'],
  }, 'test-secret', { expiresIn: '5m' });
  const { response, result } = responseHarness();

  await selectStudentAccount({ body: { selectionToken, studentId: 'outside' } } as Request, response);

  assert.equal(result().statusCode, 403);
  assert.deepEqual(result().body, { error: 'Student is not available for this login' });
});

test('valid account selection returns a token scoped to the chosen student', async () => {
  const selectStudentAccount = (portalController as any).selectStudentAccount;
  assert.equal(typeof selectStudentAccount, 'function');
  replaceMethod(prisma.student, 'findFirst', (async () => ({
    id: 's2', humanId: 'ML-002', name: 'Siya', enrollments: [{ batch: { name: 'Class 8 Girls' } }],
  }) as never) as typeof prisma.student.findFirst);
  const selectionToken = jwt.sign({
    purpose: 'STUDENT_ACCOUNT_SELECTION', instituteId: 'i1', normalizedPhone: '9876543210', studentIds: ['s1', 's2'],
  }, 'test-secret', { expiresIn: '5m' });
  const { response, result } = responseHarness();

  await selectStudentAccount({ body: { selectionToken, studentId: 's2' } } as Request, response);

  assert.equal(result().statusCode, 200);
  const claims = jwt.verify(result().body.token, 'test-secret') as any;
  assert.equal(claims.studentId, 's2');
  assert.equal(claims.instituteId, 'i1');
});
