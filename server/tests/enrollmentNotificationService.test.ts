import test from 'node:test';
import assert from 'node:assert/strict';
import { createEnrollmentNotificationService } from '../src/services/enrollmentNotificationService';

function fixture(options: { failCreate?: boolean } = {}) {
  const rows: any[] = [];
  const service = createEnrollmentNotificationService({
    async loadEnrollment(id) {
      return {
        id, instituteId: 'i1', studentName: 'Riya', recipient: '9876543210', batchName: 'Class 10',
        startedAt: new Date('2026-08-27T00:00:00Z'), endedAt: new Date('2026-09-01T00:00:00Z'),
        endReason: 'Moved away', feeSummary: 'Fees start August 2026', instituteName: 'MathLogs Academy',
      };
    },
    async findJob(eventKey) { return rows.find(row => row.eventKey === eventKey) || null; },
    async createJob(row) {
      if (options.failCreate) throw new Error('queue down');
      const saved = { id: `j${rows.length + 1}`, status: 'PENDING', ...row };
      rows.push(saved); return saved;
    },
    async requeueJob(id) {
      const row = rows.find(item => item.id === id); if (!row) return false;
      row.status = 'PENDING'; return true;
    },
  });
  return { service, rows };
}

test('retry-safe enqueue creates exactly one lifecycle job', async () => {
  const state = fixture();
  const event = { enrollmentId: 'e2', type: 'READDED' as const, eventKey: 'enrollment:e2:READDED' };
  assert.equal((await state.service.enqueue(event)).status, 'QUEUED');
  assert.equal((await state.service.enqueue(event)).status, 'ALREADY_QUEUED');
  assert.equal(state.rows.length, 1);
});

test('queue failure is returned as retryable instead of throwing', async () => {
  const state = fixture({ failCreate: true });
  const result = await state.service.enqueue({ enrollmentId: 'e2', type: 'READDED', eventKey: 'enrollment:e2:READDED' });
  assert.equal(result.status, 'FAILED_RETRYABLE');
});

test('explicit resend uses its own idempotent event key', async () => {
  const state = fixture();
  await state.service.resend({ enrollmentId: 'e2', idempotencyKey: 'teacher-resend-1' });
  await state.service.resend({ enrollmentId: 'e2', idempotencyKey: 'teacher-resend-1' });
  assert.equal(state.rows.filter(row => row.eventKey === 'enrollment:e2:RESEND:teacher-resend-1').length, 1);
});
