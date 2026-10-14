import test from 'node:test';
import assert from 'node:assert/strict';
import type { Request, Response } from 'express';
import { addStudentManually, archiveStudent } from '../src/controllers/studentController';

function responseHarness() {
  let statusCode = 200;
  let body: unknown;
  const response = {
    status(code: number) {
      statusCode = code;
      return this;
    },
    json(value: unknown) {
      body = value;
      return this;
    },
  } as unknown as Response;

  return {
    response,
    result: () => ({ statusCode, body }),
  };
}

test('legacy manual-add endpoint cannot bypass identity and fee selection', async () => {
  const { response, result } = responseHarness();

  await addStudentManually({ body: {} } as Request, response);

  assert.deepEqual(result(), {
    statusCode: 410,
    body: {
      error: 'USE_ENROLLMENT_CREATE_ENDPOINT',
      message: 'Use the batch enrollment flow to select a profile and fee start point.',
    },
  });
});

test('legacy archive endpoint cannot remove a student profile or unrelated enrollments', async () => {
  const { response, result } = responseHarness();

  await archiveStudent({ params: { id: 'student-1' }, body: { leaveReason: 'Moved' } } as unknown as Request, response);

  assert.deepEqual(result(), {
    statusCode: 410,
    body: {
      error: 'USE_ENROLLMENT_END_ENDPOINT',
      message: 'End the student enrollment from the selected batch instead.',
    },
  });
});
