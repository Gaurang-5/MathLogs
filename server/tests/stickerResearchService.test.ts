import assert from 'node:assert/strict';
import test from 'node:test';
import { normalizeCaptureSource, normalizeClientPlatform, stickerResearchEnabled } from '../src/services/stickerResearchService';

test('research collection is opt-in', () => {
  const previous = process.env.STICKER_RESEARCH_COLLECTION_ENABLED;
  delete process.env.STICKER_RESEARCH_COLLECTION_ENABLED;
  assert.equal(stickerResearchEnabled(), false);
  process.env.STICKER_RESEARCH_COLLECTION_ENABLED = 'true';
  assert.equal(stickerResearchEnabled(), true);
  if (previous === undefined) delete process.env.STICKER_RESEARCH_COLLECTION_ENABLED;
  else process.env.STICKER_RESEARCH_COLLECTION_ENABLED = previous;
});

test('capture metadata only accepts bounded categories', () => {
  assert.equal(normalizeCaptureSource('phone_camera'), 'phone_camera');
  assert.equal(normalizeCaptureSource('uploaded_file'), 'unknown');
  assert.equal(normalizeClientPlatform('ios'), 'ios');
  assert.equal(normalizeClientPlatform('macOS 27; secret'), 'unknown');
});
