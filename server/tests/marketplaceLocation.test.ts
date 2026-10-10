import test from 'node:test';
import assert from 'node:assert/strict';
import {
  MARKETPLACE_CITY,
  normalizeMarketplaceCity,
  requireMarketplaceCity,
  validateMarketplacePublication,
  marketplaceFacetSlug,
  canonicalMarketplaceFacetPath,
} from '../src/domain/marketplace/location';

test('normalizes supported Muzaffarnagar spellings to one canonical city', () => {
  assert.equal(normalizeMarketplaceCity(' muzaffarnagar '), MARKETPLACE_CITY);
  assert.equal(normalizeMarketplaceCity('Muaffarnagar'), MARKETPLACE_CITY);
});

test('rejects unsupported cities and public listings without a city', () => {
  assert.throws(() => requireMarketplaceCity('Jaipur'), /Muzaffarnagar/);
  assert.throws(
    () => validateMarketplacePublication({ isPubliclyListed: true, city: null }),
    /city is required/i,
  );
  assert.equal(validateMarketplacePublication({ isPubliclyListed: false, city: null }), null);
  assert.equal(validateMarketplacePublication({ isPubliclyListed: false, city: 'Jaipur' }), 'Jaipur');
});

test('builds one fixed-order canonical facet path', () => {
  assert.equal(marketplaceFacetSlug('  Class 9 / CBSE '), 'class-9-cbse');
  assert.equal(
    canonicalMarketplaceFacetPath({
      area: 'Gandhi Colony',
      className: 'Class 9',
      subject: 'Mathematics',
    }),
    '/coaching/muzaffarnagar/areas/gandhi-colony/classes/class-9/subjects/mathematics',
  );
});
