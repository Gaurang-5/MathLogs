import test, { afterEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  sendClaimApprovalNotification,
  sendClaimRejectionNotification,
  sendLeadNotification
} from '../src/services/marketplaceNotificationService';

const envKeys = [
  'WHATSAPP_TEMPLATE_MARKETPLACE_CLAIM_APPROVED',
  'WHATSAPP_TEMPLATE_MARKETPLACE_CLAIM_REJECTED',
  'WHATSAPP_TEMPLATE_MARKETPLACE_LEAD'
] as const;

afterEach(() => {
  for (const key of envKeys) delete process.env[key];
});

test('claim approval queues the configured template with ordered parameters', async () => {
  process.env.WHATSAPP_TEMPLATE_MARKETPLACE_CLAIM_APPROVED = 'claim-approved';
  const calls: unknown[][] = [];
  const result = await sendClaimApprovalNotification({
    phone: '9876543210', claimantName: 'Riya', instituteName: 'Apex',
    loginUrl: 'https://mathlogs.app/login', instituteId: 'inst-1'
  }, async (...args: unknown[]) => {
    calls.push(args);
    return { queued: true, jobId: 'job-1' };
  });

  assert.deepEqual(result, { queued: true, jobId: 'job-1' });
  assert.deepEqual(calls, [[
    '9876543210', 'claim-approved',
    ['Riya', 'Apex', 'https://mathlogs.app/login'], 'inst-1'
  ]]);
});

test('missing claim approval template reports a configuration failure without enqueueing', async () => {
  let called = false;
  const result = await sendClaimApprovalNotification({
    phone: '9876543210', claimantName: 'Riya', instituteName: 'Apex',
    loginUrl: 'https://mathlogs.app/login', instituteId: 'inst-1'
  }, async () => {
    called = true;
    return { queued: true, jobId: 'unexpected' };
  });

  assert.deepEqual(result, { queued: false, error: 'CLAIM_APPROVAL_TEMPLATE_NOT_CONFIGURED' });
  assert.equal(called, false);
});

test('rejection and lead notifications use their complete ordered template inputs', async () => {
  process.env.WHATSAPP_TEMPLATE_MARKETPLACE_CLAIM_REJECTED = 'claim-rejected';
  process.env.WHATSAPP_TEMPLATE_MARKETPLACE_LEAD = 'marketplace-lead';
  const calls: unknown[][] = [];
  const enqueue = async (...args: unknown[]) => {
    calls.push(args);
    return { queued: true, jobId: `job-${calls.length}` };
  };

  await sendClaimRejectionNotification({
    phone: '9876543210', claimantName: 'Riya', instituteName: 'Apex',
    rejectionReason: 'Details did not match', supportUrl: 'https://mathlogs.app/support', instituteId: 'inst-1'
  }, enqueue);
  await sendLeadNotification({
    phone: '9876543210', ownerName: 'Riya', instituteName: 'Apex', studentName: 'Aman',
    classSubjectSummary: 'Class 10 · Mathematics', settingsUrl: 'https://mathlogs.app/marketplace-settings',
    instituteId: 'inst-1'
  }, enqueue);

  assert.deepEqual(calls, [
    ['9876543210', 'claim-rejected', ['Riya', 'Apex', 'Details did not match', 'https://mathlogs.app/support'], 'inst-1'],
    ['9876543210', 'marketplace-lead', ['Riya', 'Apex', 'Aman', 'Class 10 · Mathematics', 'https://mathlogs.app/marketplace-settings'], 'inst-1']
  ]);
});
