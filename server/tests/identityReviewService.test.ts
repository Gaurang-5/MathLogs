import test from 'node:test';
import assert from 'node:assert/strict';
import { createIdentityReviewService } from '../src/services/identityReviewService';
import { readFileSync } from 'node:fs';
import path from 'node:path';

function fixture() {
  const reviews: any[] = [];
  let enrollmentCalls = 0;
  const service = createIdentityReviewService({
    async findCandidates() { return [{ id: 's1' }]; },
    async findPendingReview() { return null; },
    async createReview(input) { const row = { id: 'r1', ...input, status: 'PENDING' as const }; reviews.push(row); return row; },
    async findReview() { return { id: 'r1', instituteId: 'i1', batchId: 'b1', status: 'PENDING', submittedData: {} }; },
    async findStudent(id, instituteId) { return id === 's1' && instituteId === 'i1' ? { id } : null; },
    async markResolved() {},
    async enrollExisting(command) { enrollmentCalls++; return { outcome: 'REENROLLED', enrollmentId: 'e1', notificationEventKey: 'event' }; },
  });
  return { service, reviews, get enrollmentCalls() { return enrollmentCalls; } };
}

test('public registration with a credible match creates a review instead of a student', async () => {
  const state = fixture();
  const result = await state.service.reviewPublicRegistration({
    instituteId: 'i1', batchId: 'b1', submittedData: { name: 'Riya', parentName: 'Asha', parentWhatsapp: '9876543210' },
  });
  assert.deepEqual(result, { code: 'IDENTITY_REVIEW_REQUIRED', reviewId: 'r1' });
  assert.deepEqual(state.reviews[0].candidateStudentIds, ['s1']);
});

test('teacher resolves a review to an existing tenant profile without student approval', async () => {
  const state = fixture();
  const result = await state.service.resolveWithExisting({
    instituteId: 'i1', reviewId: 'r1', studentId: 's1', actorId: 'a1', startedAt: new Date(),
    fee: { mode: 'CURRENT_DUE_BASED', installmentIds: [] }, idempotencyKey: 'review-resolution-1',
  });
  assert.equal(result.outcome, 'REENROLLED');
  assert.equal(state.enrollmentCalls, 1);
});

test('review resolution rejects a student from another institute', async () => {
  const state = fixture();
  await assert.rejects(() => state.service.resolveWithExisting({
    instituteId: 'i2', reviewId: 'r1', studentId: 's1', actorId: 'a1', startedAt: new Date(),
    fee: { mode: 'CURRENT_DUE_BASED', installmentIds: [] }, idempotencyKey: 'review-resolution-2',
  }), /IDENTITY_REVIEW_NOT_FOUND/);
});

test('public registration and teacher review routes use the identity review workflow', () => {
  const routes = readFileSync(path.join(process.cwd(), 'src/routes/api.ts'), 'utf8');
  const registration = readFileSync(path.join(process.cwd(), 'src/controllers/studentController.ts'), 'utf8');
  const invitations = readFileSync(path.join(process.cwd(), 'src/controllers/batchController.ts'), 'utf8');
  assert.match(routes, /GET|identity-reviews/);
  assert.match(routes, /\/identity-reviews\/:id\/resolve/);
  assert.match(registration, /IDENTITY_REVIEW_REQUIRED/);
  assert.match(invitations, /enrollmentIntent/);
  assert.match(invitations, /nonce/);
});
