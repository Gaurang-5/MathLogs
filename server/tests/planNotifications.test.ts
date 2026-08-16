import test from 'node:test';
import assert from 'node:assert/strict';
import { PLAN_NOTIFICATION_TEMPLATES, lifecycleReminderSchedule } from '../src/services/planNotificationService';

test('defines the seven approved paired lifecycle templates', () => {
  assert.deepEqual(Object.keys(PLAN_NOTIFICATION_TEMPLATES), [
    'TRIAL_STARTED', 'PLAN_ACTIVATED', 'EXPIRY_APPROACHING', 'PAYMENT_DUE',
    'PAYMENT_FAILED', 'PAYMENT_SUCCEEDED', 'MARKETPLACE_FALLBACK'
  ]);
  assert.ok(Object.values(PLAN_NOTIFICATION_TEMPLATES).every(template => template.subject && template.whatsappEnvironmentKey));
});

test('schedules renewal reminders 7, 3, and 1 days before/due and 1, 3, and 7 days overdue', () => {
  const expiry = new Date('2026-09-30T00:00:00.000Z');
  assert.deepEqual(lifecycleReminderSchedule(expiry).map(item => item.scheduledAt.toISOString().slice(0, 10)), [
    '2026-09-23', '2026-09-27', '2026-09-29', '2026-09-30', '2026-10-01', '2026-10-03', '2026-10-07'
  ]);
});
