import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveStudentAlertRecipients, sendStudentAlert, sendStudentAlertForStudent } from '../src/services/studentAlertRecipientService';

test('keeps primary and enabled custom phone recipients in normalized first-seen order', () => {
  assert.deepEqual(resolveStudentAlertRecipients({
    parentWhatsapp: '95579 40807',
    additionalData: { emergencyPhone: '+91 9557940807', secondGuardian: '9876543210', ignoredPhone: '9999999999' },
    registrationFields: [
      { id: 'emergencyPhone', type: 'tel', sendAlerts: true },
      { id: 'secondGuardian', type: 'tel', sendAlerts: true },
      { id: 'ignoredPhone', type: 'tel', sendAlerts: false },
    ],
  }), ['9557940807', '9876543210']);
});

test('ignores blank, malformed, non-phone, and disabled custom values', () => {
  assert.deepEqual(resolveStudentAlertRecipients({
    parentWhatsapp: '', additionalData: { short: '123', note: '9876543210', blank: '' },
    registrationFields: [
      { id: 'short', type: 'tel', sendAlerts: true },
      { id: 'note', type: 'text', sendAlerts: true },
      { id: 'blank', type: 'tel', sendAlerts: true },
    ],
  }), []);
});

test('attempts every recipient even when one sender rejects', async () => {
  const attempted: string[] = [];
  const result = await sendStudentAlert({
    parentWhatsapp: '9557940807', additionalData: { second: '9876543210' },
    registrationFields: [{ id: 'second', type: 'tel', sendAlerts: true }],
  }, async recipient => {
    attempted.push(recipient);
    if (recipient === '9557940807') throw new Error('provider unavailable');
    return true;
  });
  assert.deepEqual(attempted.sort(), ['9557940807', '9876543210']);
  assert.deepEqual(result, { attempted: 2, delivered: 1, failed: 1 });
});

test('loads a student configuration and fans out through the shared adapter', async () => {
  const recipients: string[] = [];
  const result = await sendStudentAlertForStudent('student-1', async recipient => { recipients.push(recipient); }, {
    student: { findFirst: async () => ({
      parentWhatsapp: '9557940807', additionalData: { second: '9876543210' },
      institute: { config: { registrationForm: { fields: [{ id: 'second', type: 'tel', sendAlerts: true }] } } },
    }) },
  });
  assert.deepEqual(recipients, ['9557940807', '9876543210']);
  assert.deepEqual(result, { attempted: 2, delivered: 2, failed: 0 });
});
