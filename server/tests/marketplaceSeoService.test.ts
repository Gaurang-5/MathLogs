import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildMarketplaceFacetCatalog,
  enumerateMarketplaceLandingPathsFromListings,
  getMarketplaceProfileSeo,
  resolveMarketplaceLandingFromCatalog,
} from '../src/services/marketplaceSeoService';

test('resolves only facet combinations backed by one complete listing', () => {
  const catalog = buildMarketplaceFacetCatalog([
    { id: 'a', name: 'Apex Academy', slug: 'apex', area: 'Gandhi Colony', classesOffered: ['Class 9'], subjectsOffered: ['Mathematics'] },
    { id: 'b', name: 'Commerce Point', slug: 'commerce', area: 'Civil Lines', classesOffered: ['Class 11'], subjectsOffered: ['Accountancy'] },
  ]);
  assert.equal(resolveMarketplaceLandingFromCatalog(catalog, {
    areaSlug: 'gandhi-colony', classSlug: 'class-9', subjectSlug: 'mathematics'
  }).indexable, true);
  assert.equal(resolveMarketplaceLandingFromCatalog(catalog, {
    areaSlug: 'gandhi-colony', subjectSlug: 'accountancy'
  }).indexable, false);
});

test('builds fixed-order unique paths for every supported real combination', () => {
  const fixture = {
    id: 'a', name: 'Apex Academy', slug: 'apex', area: 'Gandhi Colony',
    classesOffered: ['Class 9'], subjectsOffered: ['Mathematics']
  };
  const paths = enumerateMarketplaceLandingPathsFromListings([fixture]);
  assert.ok(paths.includes('/coaching/muzaffarnagar/areas/gandhi-colony'));
  assert.ok(paths.includes('/coaching/muzaffarnagar/classes/class-9'));
  assert.ok(paths.includes('/coaching/muzaffarnagar/areas/gandhi-colony/classes/class-9/subjects/mathematics'));
  assert.equal(paths.length, new Set(paths).size);
});

test('exact-name profile SEO leads with the institute name', () => {
  const seo = getMarketplaceProfileSeo({
    name: 'Manoj Bhatia Coaching Classes', slug: 'manoj-bhatia-coaching-classes',
    teacherName: 'Manoj Bhatia', city: 'Muzaffarnagar', area: 'Civil Lines',
    classesOffered: ['Class 9'], subjectsOffered: ['Mathematics'], duplicateName: false
  });
  assert.match(seo.title, /^Manoj Bhatia Coaching Classes/);
  assert.match(seo.description, /Civil Lines.*Class 9.*Mathematics/);
});

test('duplicate coaching names are disambiguated with real teacher data', () => {
  const seo = getMarketplaceProfileSeo({
    name: 'Apex Academy', slug: 'apex-academy-civil-lines', teacherName: 'Riya Sharma',
    city: 'Muzaffarnagar', area: 'Civil Lines', classesOffered: ['Class 10'],
    subjectsOffered: ['Science'], duplicateName: true
  });
  assert.match(seo.title, /^Apex Academy.*Civil Lines.*Riya Sharma/);
});
