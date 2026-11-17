import test from 'node:test';
import assert from 'node:assert/strict';

process.env.NODE_ENV = 'test';

test('research capture context accepts only the documented categories', async () => {
  const { normalizeCaptureSource, normalizeClientPlatform } = await import('../src/services/stickerResearchService');
  assert.equal(normalizeCaptureSource('web_camera'), 'web_camera');
  assert.equal(normalizeCaptureSource('phone_camera'), 'phone_camera');
  assert.equal(normalizeCaptureSource('mobile_camera'), 'mobile_camera');
  assert.equal(normalizeCaptureSource('student-name'), 'unknown');
  assert.equal(normalizeClientPlatform('web'), 'web');
  assert.equal(normalizeClientPlatform('ios'), 'ios');
  assert.equal(normalizeClientPlatform('android'), 'android');
  assert.equal(normalizeClientPlatform('full-user-agent'), 'unknown');
});
