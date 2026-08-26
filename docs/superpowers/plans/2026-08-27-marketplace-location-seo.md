# Marketplace Location Integrity and SEO Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make every public marketplace listing reliably Muzaffarnagar-scoped and generate indexable, data-backed area/class/subject landing pages plus strong exact-name coaching profile signals.

**Architecture:** A server marketplace-location domain module enforces the canonical city and canonical facet paths. A reusable marketplace search service and SEO service become the single source for the API, server-rendered metadata, and sitemap; the React marketplace consumes one landing-page response and renders the same canonical model. All facet pages are derived only from active public listings, while database and API invariants prevent unsupported cities from being published.

**Tech Stack:** TypeScript, Node.js 22, Express 5, Prisma 5/PostgreSQL, React 19, React Router 7, Vitest, Node test runner, Vite, Heroku.

**Spec:** `docs/superpowers/specs/2026-08-27-marketplace-location-seo-design.md`

## Global Constraints

- The only supported marketplace city in this release is exactly `Muzaffarnagar`.
- A public listing must never have a missing or unsupported city; a private pre-setup listing may have `city = null`.
- Area, class, and subject values remain data-driven; no example locality, class, subject, or combination is hard-coded.
- A facet page is indexable and enters the sitemap only when at least one active public listing matches every facet.
- Facet canonical segment order is always `areas`, then `classes`, then `subjects`.
- `/coaching` remains the canonical all-Muzaffarnagar page; `/coaching/muzaffarnagar` redirects permanently to `/coaching`.
- Exact institute names, locations, classes, subjects, reviews, and Google links must be truthful listing data; never synthesize them for SEO.
- Ranking improvements are an objective, not a promise of first position.
- Preserve all unrelated uncommitted Graphify, brainstorming, questionnaire, and inspection-script files.
- Follow red-green-refactor for every behavior change and commit only task-scoped files.

---

## File Structure

### New server files

- `server/src/domain/marketplace/location.ts`: canonical city rules, facet normalization, slugging, path construction, and typed validation errors.
- `server/src/services/marketplaceSearchService.ts`: reusable public listing query, exact normalized filters, rating mapping, sorting, and pagination.
- `server/src/services/marketplaceSeoService.ts`: facet catalog, landing resolution, metadata, breadcrumbs, related links, and sitemap path enumeration.
- `server/src/scripts/backfillAdlMarketplaceCity.ts`: guarded one-time ADL production correction and audit write that is compiled into `dist/scripts`.
- `server/prisma/migrations/20260827010000_enforce_marketplace_public_city/migration.sql`: fail-safe preflight and public-city database constraint.
- `server/tests/marketplaceLocation.test.ts`: unit tests for city/facet/path rules.
- `server/tests/marketplaceSeoService.test.ts`: unit tests for data-backed landing pages and exact-name metadata.
- `server/tests/marketplaceSeo.integration.test.ts`: landing API, HTML metadata, redirect, and sitemap integration coverage.

### New client files

- `client/src/features/marketplace/location.ts`: client canonical-city option and landing-route parsing/building.
- `client/src/features/marketplace/location.test.ts`: route and city option tests.
- `client/src/features/marketplace/types.ts`: public landing-page response types shared by marketplace page components.
- `client/src/components/MarketplaceBreadcrumbs.tsx`: visible accessible marketplace breadcrumb links.

### Existing files to modify

- `server/src/controllers/marketplaceController.ts`: delegate search, add landing endpoint, enforce city in register/profile updates, and expose exact-name profile data.
- `server/src/routes/marketplaceRoutes.ts`: register `GET /landing` before profile routes.
- `server/src/controllers/inviteController.ts`: enforce canonical city when setup publishes a listing.
- `server/src/services/accountProvisioningService.ts`: provision new accounts privately until setup completes.
- `server/src/controllers/onboardingController.ts`: stop creating public incomplete listings and pass canonical marketplace data.
- `server/src/services/superAdminInstituteService.ts`: validate marketplace city/publication on preview, commit, and import.
- `server/src/controllers/marketplaceSuperAdminController.ts`: enforce city on listing publication/edit.
- `server/src/index.ts`: route redirect, server-rendered facet/profile metadata, structured data, and dynamic sitemap.
- `server/tests/marketplace.test.ts`: replace obsolete Jaipur assumptions and cover unsupported city registration.
- `server/tests/marketplaceSuperAdmin.test.ts`: update public fixtures and test publication validation.
- `server/tests/subscriptionOnboarding.test.ts`: assert new institutes remain private before setup.
- `server/tests/superAdminOnboarding.test.ts`: assert canonical city handling in preview/commit/import.
- `client/src/App.tsx`: register fixed-order facet routes before `/coaching/:slug`.
- `client/src/pages/MarketplaceHome.tsx`: consume route facets/landing model, keep Muzaffarnagar selected, remove All Cities, and render related links/breadcrumbs.
- `client/src/pages/CoachingProfile.tsx`: exact-name metadata, class/subject/location descriptions, and breadcrumbs.
- `client/src/pages/SetupAccount.tsx`: single-city selector and validation.
- `client/src/pages/MarketplaceSettings.tsx`: single-city selector without silent fallback.
- `client/src/pages/TeacherRegistration.tsx`: single-city selector using the shared constant.
- `client/src/features/superadmin-institutes/OnboardingWizard.tsx`: single-city selector and canonical initial value.
- `client/src/features/superadmin-marketplace/ListingEditorDrawer.tsx`: replace city free text with the single-city selector.
- `client/src/features/superadmin-marketplace/listingForm.ts`: normalize canonical city in outgoing listing updates.
- Existing client tests adjacent to those components: assert the single option and routed SEO state.

---

### Task 1: Canonical Marketplace Location Domain

**Files:**
- Create: `server/src/domain/marketplace/location.ts`
- Create: `server/tests/marketplaceLocation.test.ts`

**Interfaces:**
- Produces: `MARKETPLACE_CITY`, `MarketplaceCityValidationError`, `normalizeMarketplaceCity(value)`, `requireMarketplaceCity(value)`, `validateMarketplacePublication(input)`, `marketplaceFacetSlug(value)`, `canonicalMarketplaceFacetPath(facets)`.
- Consumes: no application services; this module must stay pure.

- [ ] **Step 1: Write failing city and facet tests**

```ts
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  MARKETPLACE_CITY, normalizeMarketplaceCity, requireMarketplaceCity,
  validateMarketplacePublication, marketplaceFacetSlug, canonicalMarketplaceFacetPath
} from '../src/domain/marketplace/location';

test('normalizes supported Muzaffarnagar spellings to one canonical city', () => {
  assert.equal(normalizeMarketplaceCity(' muzaffarnagar '), MARKETPLACE_CITY);
  assert.equal(normalizeMarketplaceCity('Muaffarnagar'), MARKETPLACE_CITY);
});

test('rejects unsupported cities and public listings without a city', () => {
  assert.throws(() => requireMarketplaceCity('Jaipur'), /Muzaffarnagar/);
  assert.throws(() => validateMarketplacePublication({ isPubliclyListed: true, city: null }), /city is required/i);
  assert.equal(validateMarketplacePublication({ isPubliclyListed: false, city: null }), null);
  assert.equal(validateMarketplacePublication({ isPubliclyListed: false, city: 'Jaipur' }), 'Jaipur');
});

test('builds one fixed-order canonical facet path', () => {
  assert.equal(marketplaceFacetSlug('  Class 9 / CBSE '), 'class-9-cbse');
  assert.equal(canonicalMarketplaceFacetPath({
    area: 'Gandhi Colony', className: 'Class 9', subject: 'Mathematics'
  }), '/coaching/muzaffarnagar/areas/gandhi-colony/classes/class-9/subjects/mathematics');
});
```

- [ ] **Step 2: Run the test and verify RED**

Run: `cd server && JWT_SECRET=test-secret NODE_ENV=test npx tsx --test tests/marketplaceLocation.test.ts`

Expected: FAIL because `src/domain/marketplace/location.ts` does not exist.

- [ ] **Step 3: Implement the pure location module**

```ts
export const MARKETPLACE_CITY = 'Muzaffarnagar' as const;
const LEGACY_CITY_KEYS = new Set(['muzaffarnagar', 'muaffarnagar']);

export type MarketplaceFacetSelection = { area?: string; className?: string; subject?: string };

export class MarketplaceCityValidationError extends Error {
  readonly code = 'UNSUPPORTED_MARKETPLACE_CITY';
}

export function normalizeMarketplaceCity(value: unknown): typeof MARKETPLACE_CITY | null {
  if (typeof value !== 'string' || !value.trim()) return null;
  const key = value.trim().toLowerCase().replace(/\s+/g, ' ');
  return LEGACY_CITY_KEYS.has(key) ? MARKETPLACE_CITY : null;
}

export function requireMarketplaceCity(value: unknown): typeof MARKETPLACE_CITY {
  const city = normalizeMarketplaceCity(value);
  if (!city) throw new MarketplaceCityValidationError('Marketplace city must be Muzaffarnagar');
  return city;
}

export function validateMarketplacePublication(input: { isPubliclyListed: boolean; city: unknown }) {
  if (!input.isPubliclyListed) {
    return typeof input.city === 'string' && input.city.trim() ? input.city.trim() : null;
  }
  return requireMarketplaceCity(input.city);
}

export function marketplaceFacetSlug(value: string): string {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

export function canonicalMarketplaceFacetPath(facets: MarketplaceFacetSelection): string {
  const parts = ['/coaching/muzaffarnagar'];
  if (facets.area) parts.push('areas', marketplaceFacetSlug(facets.area));
  if (facets.className) parts.push('classes', marketplaceFacetSlug(facets.className));
  if (facets.subject) parts.push('subjects', marketplaceFacetSlug(facets.subject));
  return parts.join('/');
}
```

- [ ] **Step 4: Run the test and verify GREEN**

Run: `cd server && JWT_SECRET=test-secret NODE_ENV=test npx tsx --test tests/marketplaceLocation.test.ts`

Expected: all location tests PASS.

- [ ] **Step 5: Commit the domain module**

```bash
git add server/src/domain/marketplace/location.ts server/tests/marketplaceLocation.test.ts
git commit -m "feat: define canonical marketplace location rules"
```

---

### Task 2: Enforce City Integrity Across Writes and Persistence

**Files:**
- Modify: `server/src/controllers/marketplaceController.ts`
- Modify: `server/src/controllers/inviteController.ts`
- Modify: `server/src/services/accountProvisioningService.ts`
- Modify: `server/src/controllers/onboardingController.ts`
- Modify: `server/src/services/superAdminInstituteService.ts`
- Modify: `server/src/controllers/marketplaceSuperAdminController.ts`
- Modify: `server/tests/marketplace.test.ts`
- Modify: `server/tests/marketplaceSuperAdmin.test.ts`
- Modify: `server/tests/subscriptionOnboarding.test.ts`
- Modify: `server/tests/superAdminOnboarding.test.ts`
- Create: `server/prisma/migrations/20260827010000_enforce_marketplace_public_city/migration.sql`

**Interfaces:**
- Consumes: `requireMarketplaceCity` and `validateMarketplacePublication` from Task 1.
- Produces: every public marketplace mutation stores `city = 'Muzaffarnagar'`; new unconfigured institutes are private.

- [ ] **Step 1: Change integration fixtures and add failing mutation tests**

In `server/tests/marketplace.test.ts`, make the public fixture canonical and add:

```ts
test('POST /api/marketplace/register-teacher rejects unsupported marketplace cities', async () => {
  const response = await fetch(`${baseUrl}/api/marketplace/register-teacher`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      coachingName: 'Outside City Academy', teacherName: 'Teacher',
      username: `outside-${Date.now()}`, password: 'password123',
      phoneNumber: '9123456789', city: 'Jaipur',
      subjectsOffered: ['Mathematics'], classesOffered: ['Class 9']
    })
  });
  assert.equal(response.status, 400);
  assert.match(((await response.json()) as any).message, /Muzaffarnagar/);
});
```

In `server/tests/marketplaceSuperAdmin.test.ts`, set the public fixture city to `Muzaffarnagar` and assert a PATCH that publishes a null/Jaipur city returns `400`. In onboarding tests, assert newly provisioned institutes have `isPubliclyListed === false` until setup and that setup with public listing stores `Muzaffarnagar`.

- [ ] **Step 2: Run focused tests and verify RED**

Run: `cd server && JWT_SECRET=test-secret NODE_ENV=test npx tsx --test tests/marketplace.test.ts tests/marketplaceSuperAdmin.test.ts tests/subscriptionOnboarding.test.ts tests/superAdminOnboarding.test.ts`

Expected: unsupported city requests succeed or new institutes are public, causing the new assertions to FAIL.

- [ ] **Step 3: Enforce canonical city in every write path**

Use this pattern at each boundary:

```ts
const nextIsPublic = isPubliclyListed !== undefined
  ? Boolean(isPubliclyListed)
  : currentInstitute.isPubliclyListed;
const nextCity = city !== undefined ? city : currentInstitute.city;
updateData.city = validateMarketplacePublication({ isPubliclyListed: nextIsPublic, city: nextCity });
```

For public external registration, call `requireMarketplaceCity(city)` before the transaction and persist its return value. Catch `MarketplaceCityValidationError` and return `400` with its message.

In `accountProvisioningService.ts`, create pre-setup institutes with:

```ts
isPubliclyListed: false,
city: input.marketplace?.city ? requireMarketplaceCity(input.marketplace.city) : null,
```

In setup, publish only after validating the submitted city. Superadmin onboarding/import may create private records with no city, but a public marketplace request must validate and normalize the city.

- [ ] **Step 4: Add the fail-safe database constraint migration**

```sql
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM "Institute"
    WHERE "isPubliclyListed" = true
      AND "city" IS DISTINCT FROM 'Muzaffarnagar'
  ) THEN
    RAISE EXCEPTION 'Public marketplace listings must be backfilled to Muzaffarnagar before this migration';
  END IF;
END $$;

ALTER TABLE "Institute"
  ADD CONSTRAINT "Institute_public_marketplace_city"
  CHECK ("isPubliclyListed" = false OR ("city" IS NOT NULL AND "city" = 'Muzaffarnagar'));
```

- [ ] **Step 5: Run focused tests and build**

Run: `cd server && JWT_SECRET=test-secret NODE_ENV=test npx tsx --test tests/marketplace.test.ts tests/marketplaceSuperAdmin.test.ts tests/subscriptionOnboarding.test.ts tests/superAdminOnboarding.test.ts tests/marketplaceLocation.test.ts`

Run: `cd server && npm run build`

Expected: all focused tests PASS and TypeScript exits `0`.

- [ ] **Step 6: Commit city enforcement**

```bash
git add server/src/controllers/marketplaceController.ts server/src/controllers/inviteController.ts server/src/services/accountProvisioningService.ts server/src/controllers/onboardingController.ts server/src/services/superAdminInstituteService.ts server/src/controllers/marketplaceSuperAdminController.ts server/tests/marketplace.test.ts server/tests/marketplaceSuperAdmin.test.ts server/tests/subscriptionOnboarding.test.ts server/tests/superAdminOnboarding.test.ts server/prisma/migrations/20260827010000_enforce_marketplace_public_city/migration.sql
git commit -m "fix: enforce Muzaffarnagar marketplace listings"
```

---

### Task 3: Single-City Controls in Every Client Surface

**Files:**
- Create: `client/src/features/marketplace/location.ts`
- Create: `client/src/features/marketplace/location.test.ts`
- Modify: `client/src/pages/SetupAccount.tsx`
- Modify: `client/src/pages/MarketplaceSettings.tsx`
- Modify: `client/src/pages/TeacherRegistration.tsx`
- Modify: `client/src/features/superadmin-institutes/OnboardingWizard.tsx`
- Modify: `client/src/features/superadmin-institutes/OnboardingWizard.test.tsx`
- Modify: `client/src/features/superadmin-marketplace/ListingEditorDrawer.tsx`
- Modify: `client/src/features/superadmin-marketplace/ListingEditorDrawer.test.tsx`
- Modify: `client/src/features/superadmin-marketplace/listingForm.ts`
- Modify: `client/src/features/superadmin-marketplace/listingForm.test.ts`

**Interfaces:**
- Produces: `MARKETPLACE_CITY`, `MARKETPLACE_CITY_OPTIONS`, `normalizeMarketplaceCitySelection`.
- Consumes: no server imports; the server remains authoritative.

- [ ] **Step 1: Write failing shared-option and form tests**

```ts
import { describe, expect, it } from 'vitest';
import { MARKETPLACE_CITY, MARKETPLACE_CITY_OPTIONS, normalizeMarketplaceCitySelection } from './location';

describe('marketplace city controls', () => {
  it('offers only canonical Muzaffarnagar', () => {
    expect(MARKETPLACE_CITY_OPTIONS).toEqual([{ value: 'Muzaffarnagar', label: 'Muzaffarnagar' }]);
    expect(normalizeMarketplaceCitySelection('muaffarnagar')).toBe(MARKETPLACE_CITY);
    expect(() => normalizeMarketplaceCitySelection('Jaipur')).toThrow(/Muzaffarnagar/);
  });
});
```

Extend component tests to assert `select[name="marketplace-city"]` has one option and its value is `Muzaffarnagar`.

- [ ] **Step 2: Run client tests and verify RED**

Run: `cd client && npm run test:run -- src/features/marketplace/location.test.ts src/features/superadmin-institutes/OnboardingWizard.test.tsx src/features/superadmin-marketplace/ListingEditorDrawer.test.tsx src/features/superadmin-marketplace/listingForm.test.ts`

Expected: FAIL because the shared location module and named one-option controls do not exist.

- [ ] **Step 3: Add the shared client city model**

```ts
export const MARKETPLACE_CITY = 'Muzaffarnagar' as const;
export const MARKETPLACE_CITY_OPTIONS = [{ value: MARKETPLACE_CITY, label: MARKETPLACE_CITY }] as const;

export function normalizeMarketplaceCitySelection(value: string): typeof MARKETPLACE_CITY {
  const key = value.trim().toLowerCase();
  if (key === 'muzaffarnagar' || key === 'muaffarnagar') return MARKETPLACE_CITY;
  throw new Error('Marketplace city must be Muzaffarnagar');
}
```

- [ ] **Step 4: Replace all city inputs with the canonical selector**

Every form uses this shape, preserving its existing styling:

```tsx
<select
  name="marketplace-city"
  value={MARKETPLACE_CITY}
  onChange={() => setCity(MARKETPLACE_CITY)}
>
  {MARKETPLACE_CITY_OPTIONS.map(option => (
    <option key={option.value} value={option.value}>{option.label}</option>
  ))}
</select>
```

Initialize marketplace form state to `MARKETPLACE_CITY`. Do not silently turn unsupported loaded values into public data: display Muzaffarnagar in the selector, but let the next explicit save send the canonical value.

- [ ] **Step 5: Run tests and client build**

Run: `cd client && npm run test:run -- src/features/marketplace/location.test.ts src/features/superadmin-institutes/OnboardingWizard.test.tsx src/features/superadmin-marketplace/ListingEditorDrawer.test.tsx src/features/superadmin-marketplace/listingForm.test.ts`

Run: `cd client && npm run build`

Expected: tests PASS and Vite build exits `0`.

- [ ] **Step 6: Commit client city controls**

```bash
git add client/src/features/marketplace/location.ts client/src/features/marketplace/location.test.ts client/src/pages/SetupAccount.tsx client/src/pages/MarketplaceSettings.tsx client/src/pages/TeacherRegistration.tsx client/src/features/superadmin-institutes/OnboardingWizard.tsx client/src/features/superadmin-institutes/OnboardingWizard.test.tsx client/src/features/superadmin-marketplace/ListingEditorDrawer.tsx client/src/features/superadmin-marketplace/ListingEditorDrawer.test.tsx client/src/features/superadmin-marketplace/listingForm.ts client/src/features/superadmin-marketplace/listingForm.test.ts
git commit -m "feat: limit marketplace city controls to Muzaffarnagar"
```

---

### Task 4: Reusable Marketplace Search Service

**Files:**
- Create: `server/src/services/marketplaceSearchService.ts`
- Modify: `server/src/controllers/marketplaceController.ts`
- Modify: `server/tests/marketplace.test.ts`

**Interfaces:**
- Produces: `MarketplaceSearchFilters`, `MarketplaceCard`, `MarketplaceSearchResult`, `searchMarketplaceListings(filters)`.
- Consumes: Prisma and Task 1 city normalization.

- [ ] **Step 1: Add failing exact facet-filter tests**

Create active public Muzaffarnagar fixtures that deliberately overlap:

```ts
// Apex: Gandhi Colony, Class 9, Mathematics
// Scholar: Gandhi Colony, Class 10, Science
// Commerce: Civil Lines, Class 11, Accountancy
```

Assert that `area=Gandhi Colony&classGrade=Class 9&subject=Mathematics` returns only Apex, that comparisons are case-insensitive, and that inactive/private/delisted records never appear.

- [ ] **Step 2: Run the marketplace integration test and verify RED**

Run: `cd server && JWT_SECRET=test-secret NODE_ENV=test npx tsx --test tests/marketplace.test.ts`

Expected: FAIL because current JSON facet filtering uses broad substring rules and controller-local query logic.

- [ ] **Step 3: Extract search into a focused service**

```ts
export type MarketplaceSearchFilters = {
  q?: string; city?: string; area?: string; className?: string; subject?: string;
  sortBy?: 'rating' | 'reviews' | 'newest'; page?: number; limit?: number;
};

export type MarketplaceSearchResult = {
  items: MarketplaceCard[];
  total: number;
  page: number;
  limit: number;
  availableFilters: { cities: string[]; areas: string[]; classes: string[]; subjects: string[] };
};

export async function searchMarketplaceListings(filters: MarketplaceSearchFilters): Promise<MarketplaceSearchResult>;
```

Use normalized exact equality for canonical `area`, `className`, and `subject` filters. Keep `q` as a case-insensitive contains search over name, teacher, tagline, area, and city. Preserve rating mapping, phone privacy choices, pagination, and existing response fields.

- [ ] **Step 4: Make the controller a request/response adapter**

Parse query values, call `searchMarketplaceListings`, and return:

```ts
return res.json({
  success: true,
  data: result.items,
  pagination: { page: result.page, limit: result.limit, total: result.total,
    totalPages: Math.ceil(result.total / result.limit) },
  availableFilters: result.availableFilters,
});
```

- [ ] **Step 5: Run marketplace tests and server build**

Run: `cd server && JWT_SECRET=test-secret NODE_ENV=test npx tsx --test tests/marketplace.test.ts`

Run: `cd server && npm run build`

Expected: all marketplace tests PASS; response compatibility remains intact.

- [ ] **Step 6: Commit the search service**

```bash
git add server/src/services/marketplaceSearchService.ts server/src/controllers/marketplaceController.ts server/tests/marketplace.test.ts
git commit -m "refactor: centralize marketplace listing search"
```

---

### Task 5: Data-Backed Landing Page and SEO Service

**Files:**
- Create: `server/src/services/marketplaceSeoService.ts`
- Create: `server/tests/marketplaceSeoService.test.ts`
- Modify: `server/src/controllers/marketplaceController.ts`
- Modify: `server/src/routes/marketplaceRoutes.ts`

**Interfaces:**
- Produces: `MarketplaceFacetSource`, `MarketplaceFacetCatalog`, `MarketplaceLandingRequest`, `MarketplaceLandingPage`, `MarketplaceProfileSeoInput`, `buildMarketplaceFacetCatalog(listings)`, `resolveMarketplaceLandingFromCatalog(catalog, request)`, `enumerateMarketplaceLandingPathsFromListings(listings)`, `resolveMarketplaceLanding(request)`, `enumerateMarketplaceLandingPaths()` and `getMarketplaceProfileSeo(profile)`.
- Consumes: Task 1 path utilities and Task 4 `searchMarketplaceListings`.

- [ ] **Step 1: Write failing pure SEO service tests**

```ts
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
```

- [ ] **Step 2: Run tests and verify RED**

Run: `cd server && JWT_SECRET=test-secret NODE_ENV=test npx tsx --test tests/marketplaceSeoService.test.ts`

Expected: FAIL because the service exports do not exist.

- [ ] **Step 3: Implement catalog, resolution, metadata, and enumeration**

Define the page contract exactly:

```ts
export type MarketplaceFacetSource = {
  id: string; name: string; slug: string; area: string | null;
  classesOffered: string[]; subjectsOffered: string[];
};
export type MarketplaceFacetCatalog = {
  listings: MarketplaceFacetSource[];
  areasBySlug: Map<string, string[]>;
  classesBySlug: Map<string, string[]>;
  subjectsBySlug: Map<string, string[]>;
};
export type MarketplaceProfileSeoInput = {
  name: string; slug: string; teacherName: string; city: string; area?: string | null;
  classesOffered: string[]; subjectsOffered: string[]; duplicateName: boolean;
};
export type MarketplaceLandingRequest = { areaSlug?: string; classSlug?: string; subjectSlug?: string };
export type MarketplaceLandingPage = {
  valid: boolean;
  indexable: boolean;
  canonicalPath: string;
  title: string;
  description: string;
  heading: string;
  introduction: string;
  filters: { city: 'Muzaffarnagar'; area?: string; className?: string; subject?: string };
  breadcrumbs: Array<{ name: string; path: string }>;
  relatedLinks: Array<{ label: string; path: string }>;
  items: MarketplaceCard[];
  total: number;
};
```

Build all seven non-empty combinations of `area`, `className`, and `subject` for each listing, deduplicate by canonical path, and include a path only when that same listing supplies every facet in the combination. Reject ambiguous slugs instead of guessing.

- [ ] **Step 4: Add the landing API adapter**

Register before `/coaching/:slug`:

```ts
router.get('/landing', getMarketplaceLanding);
```

Read `areaSlug`, `classSlug`, and `subjectSlug`, call `resolveMarketplaceLanding`, and return `{ success: true, data: page }`. Invalid and empty combinations return HTTP `200` with `valid/indexable: false`, enabling a helpful UI while server HTML emits `noindex`.

- [ ] **Step 5: Run SEO service tests and build**

Run: `cd server && JWT_SECRET=test-secret NODE_ENV=test npx tsx --test tests/marketplaceSeoService.test.ts tests/marketplace.test.ts`

Run: `cd server && npm run build`

Expected: tests PASS and TypeScript exits `0`.

- [ ] **Step 6: Commit the SEO service and endpoint**

```bash
git add server/src/services/marketplaceSeoService.ts server/tests/marketplaceSeoService.test.ts server/src/controllers/marketplaceController.ts server/src/routes/marketplaceRoutes.ts
git commit -m "feat: add data-backed marketplace SEO pages"
```

---

### Task 6: Routed Marketplace Landing UI

**Files:**
- Modify: `client/src/features/marketplace/location.ts`
- Modify: `client/src/features/marketplace/location.test.ts`
- Create: `client/src/features/marketplace/types.ts`
- Create: `client/src/components/MarketplaceBreadcrumbs.tsx`
- Modify: `client/src/App.tsx`
- Modify: `client/src/pages/MarketplaceHome.tsx`
- Create: `client/src/pages/MarketplaceHome.test.tsx`

**Interfaces:**
- Consumes: Task 5 `MarketplaceLandingPage` JSON shape.
- Produces: `parseMarketplaceLandingParams(params)`, `buildMarketplaceLandingPath(filters)`, routed marketplace page UI.

- [ ] **Step 1: Write failing route and page-state tests**

```ts
expect(buildMarketplaceLandingPath({
  area: 'Gandhi Colony', className: 'Class 9', subject: 'Mathematics'
})).toBe('/coaching/muzaffarnagar/areas/gandhi-colony/classes/class-9/subjects/mathematics');

expect(parseMarketplaceLandingParams({
  areaSlug: 'gandhi-colony', classSlug: 'class-9', subjectSlug: 'mathematics'
})).toEqual({ areaSlug: 'gandhi-colony', classSlug: 'class-9', subjectSlug: 'mathematics' });
```

In `MarketplaceHome.test.tsx`, mock `/api/marketplace/landing` with an indexable page and assert the unique heading, breadcrumb links, active chips, and exact coaching card render. Mock a non-indexable page and assert the broad-marketplace recovery link renders.

- [ ] **Step 2: Run route/page tests and verify RED**

Run: `cd client && npm run test:run -- src/features/marketplace/location.test.ts src/pages/MarketplaceHome.test.tsx`

Expected: FAIL because route builders, landing types, and routed UI do not exist.

- [ ] **Step 3: Register every fixed-order route before the profile route**

```tsx
<Route path="/coaching/muzaffarnagar" element={<Navigate to="/coaching" replace />} />
<Route path="/coaching/muzaffarnagar/areas/:areaSlug" element={<MarketplaceHome />} />
<Route path="/coaching/muzaffarnagar/classes/:classSlug" element={<MarketplaceHome />} />
<Route path="/coaching/muzaffarnagar/subjects/:subjectSlug" element={<MarketplaceHome />} />
<Route path="/coaching/muzaffarnagar/areas/:areaSlug/classes/:classSlug" element={<MarketplaceHome />} />
<Route path="/coaching/muzaffarnagar/areas/:areaSlug/subjects/:subjectSlug" element={<MarketplaceHome />} />
<Route path="/coaching/muzaffarnagar/classes/:classSlug/subjects/:subjectSlug" element={<MarketplaceHome />} />
<Route path="/coaching/muzaffarnagar/areas/:areaSlug/classes/:classSlug/subjects/:subjectSlug" element={<MarketplaceHome />} />
<Route path="/coaching/:slug" element={<CoachingProfile />} />
```

- [ ] **Step 4: Render the authoritative landing model**

When route facets exist, request:

```ts
const params = new URLSearchParams({
  ...(areaSlug && { areaSlug }), ...(classSlug && { classSlug }), ...(subjectSlug && { subjectSlug })
});
const response = await fetch(`/api/marketplace/landing?${params}`);
```

Use `data.heading`, `data.introduction`, `data.canonicalPath`, breadcrumbs, related links, filters, and items. For `/coaching`, preserve the interactive search endpoint but keep city fixed to `Muzaffarnagar`. Remove `All Cities`; `clearFilters()` must set city back to `MARKETPLACE_CITY`.

- [ ] **Step 5: Add accessible breadcrumbs and related links**

`MarketplaceBreadcrumbs` renders `<nav aria-label="Breadcrumb">` with exact anchor labels and paths. Related pages render as ordinary `<Link>` elements so crawlers and users can traverse real area/class/subject pages without JavaScript-generated click handlers.

- [ ] **Step 6: Run tests and build**

Run: `cd client && npm run test:run -- src/features/marketplace/location.test.ts src/pages/MarketplaceHome.test.tsx`

Run: `cd client && npm run build`

Expected: tests PASS and Vite build exits `0`.

- [ ] **Step 7: Commit routed landing UI**

```bash
git add client/src/features/marketplace/location.ts client/src/features/marketplace/location.test.ts client/src/features/marketplace/types.ts client/src/components/MarketplaceBreadcrumbs.tsx client/src/App.tsx client/src/pages/MarketplaceHome.tsx client/src/pages/MarketplaceHome.test.tsx
git commit -m "feat: render routed marketplace landing pages"
```

---

### Task 7: Server-Rendered Metadata, Sitemap, and Exact-Name Profiles

**Files:**
- Modify: `server/src/index.ts`
- Modify: `server/src/services/marketplaceSeoService.ts`
- Create: `server/tests/marketplaceSeo.integration.test.ts`
- Modify: `client/src/pages/CoachingProfile.tsx`
- Create or modify: `client/src/pages/CoachingProfile.test.tsx`

**Interfaces:**
- Consumes: Task 5 landing/profile SEO builders and path enumeration.
- Produces: crawler-visible canonical facet HTML, exact-name profile HTML, JSON-LD, breadcrumbs, redirects, and sitemap URLs.

- [ ] **Step 1: Write failing HTTP SEO integration tests**

With an active public Muzaffarnagar fixture, assert:

```ts
const valid = await fetch(`${baseUrl}/coaching/muzaffarnagar/areas/gandhi-colony/classes/class-9`);
const html = await valid.text();
assert.match(html, /<title>Class 9.*Gandhi Colony.*Muzaffarnagar/);
assert.match(html, /rel="canonical" href="https:\/\/mathlogs\.app\/coaching\/muzaffarnagar\/areas\/gandhi-colony\/classes\/class-9"/);
assert.match(html, /BreadcrumbList/);

const empty = await fetch(`${baseUrl}/coaching/muzaffarnagar/areas/unknown/classes/class-9`);
assert.match(await empty.text(), /name="robots" content="noindex, follow"/);

const redirect = await fetch(`${baseUrl}/coaching/muzaffarnagar`, { redirect: 'manual' });
assert.equal(redirect.status, 301);
assert.equal(redirect.headers.get('location'), '/coaching');
```

For an exact-name profile fixture, assert the `<title>` begins with its exact name, canonical URL uses its stable slug, description contains actual locality/class/subject, and JSON-LD contains its exact name.

Create a second public fixture with the same name and assert each page is distinguished by its own locality and teacher. Patch the original listing name through the existing superadmin endpoint and assert its canonical `slug` is unchanged after the rename.

- [ ] **Step 2: Run the SEO integration test and verify RED**

Run: `cd server && JWT_SECRET=test-secret NODE_ENV=test npx tsx --test tests/marketplaceSeo.integration.test.ts`

Expected: FAIL because facet HTML routes redirect/fall through and metadata is not facet-aware.

- [ ] **Step 3: Replace the broad city redirect with canonical handling**

Keep a specific permanent redirect for `/coaching/muzaffarnagar`. Let valid deeper facet routes reach the catch-all HTML handler, which parses the fixed-order path and calls `resolveMarketplaceLanding`.

For valid pages, use returned title, description, canonical path, robots, and JSON-LD. For invalid/empty pages, emit `noindex, follow` with no ItemList claiming matches. For profile pages, query the count of active public institutes with the same case-insensitive name and pass `duplicateName: count > 1` to `getMarketplaceProfileSeo`.

- [ ] **Step 4: Generate truthful structured data**

Valid landing HTML includes an array containing:

```ts
[
  { '@context': 'https://schema.org', '@type': 'CollectionPage', name: page.heading,
    url: `${PUBLIC_SITE_URL}${page.canonicalPath}`, description: page.description },
  { '@context': 'https://schema.org', '@type': 'ItemList', itemListElement: page.items.map((item, index) => ({
    '@type': 'ListItem', position: index + 1,
    name: item.name, url: `${PUBLIC_SITE_URL}/coaching/${item.slug}`
  })) },
  { '@context': 'https://schema.org', '@type': 'BreadcrumbList', itemListElement: page.breadcrumbs.map((item, index) => ({
    '@type': 'ListItem', position: index + 1, name: item.name,
    item: `${PUBLIC_SITE_URL}${item.path}`
  })) }
]
```

Profile JSON-LD uses the exact stored name and real data. Omit aggregate rating unless both rating and review count are positive. Never emit a Google `sameAs` URL when none is connected.

- [ ] **Step 5: Extend the dynamic sitemap**

Select public listing `slug`, `updatedAt`, `area`, `classesOffered`, and `subjectsOffered`. Keep profile `<lastmod>`. Add each deduplicated path from `enumerateMarketplaceLandingPaths()`, XML-escape it, and never add invalid/empty combinations.

- [ ] **Step 6: Align client profile metadata and visible breadcrumbs**

Use the exact profile-name-first title and natural description from the same field ordering:

```ts
`${profile.name} in ${profile.area ? `${profile.area}, ` : ''}${profile.city} | Classes & Contact`
```

Render a visible breadcrumb and ensure the profile `h1` is the exact name. Add related real area/class/subject links only when their paths exist in the landing model or can be generated from the profile's own real values.

- [ ] **Step 7: Run integration/client tests and builds**

Run: `cd server && JWT_SECRET=test-secret NODE_ENV=test npx tsx --test tests/marketplaceSeoService.test.ts tests/marketplaceSeo.integration.test.ts tests/marketplace.test.ts`

Run: `cd client && npm run test:run -- src/pages/MarketplaceHome.test.tsx src/pages/CoachingProfile.test.tsx`

Run: `cd server && npm run build`

Run: `cd client && npm run build`

Expected: all tests PASS and both builds exit `0`.

- [ ] **Step 8: Commit crawler-visible SEO**

```bash
git add server/src/index.ts server/src/services/marketplaceSeoService.ts server/tests/marketplaceSeo.integration.test.ts client/src/pages/CoachingProfile.tsx client/src/pages/CoachingProfile.test.tsx
git commit -m "feat: publish marketplace facet and exact-name SEO"
```

---

### Task 8: Guarded ADL Backfill and Full Regression Verification

**Files:**
- Create: `server/src/scripts/backfillAdlMarketplaceCity.ts`
- Test: all focused server/client suites from Tasks 1-7.

**Interfaces:**
- Consumes: production Prisma connection and exact ADL identity from the approved spec.
- Produces: ADL city `Muzaffarnagar` plus one immutable audit row; safe failure if the target is not exact.

- [ ] **Step 1: Write the guarded backfill script**

```ts
const ADL_ID = 'a47ee396-1e04-4fbe-8dd4-1217604f519c';
const ADL_NAME = 'ADL Accountancy Classes';

await prisma.$transaction(async tx => {
  const before = await tx.institute.findUnique({ where: { id: ADL_ID } });
  if (!before || before.name !== ADL_NAME) throw new Error('ADL target validation failed');
  if (before.city === MARKETPLACE_CITY) return;
  if (before.city !== null) throw new Error(`Unexpected ADL city: ${before.city}`);
  const after = await tx.institute.update({ where: { id: ADL_ID }, data: { city: MARKETPLACE_CITY } });
  await writeMarketplaceAudit(tx, {
    action: 'LISTING_UPDATED', entityType: 'Institute', entityId: ADL_ID, instituteId: ADL_ID,
    before: { city: before.city }, after: { city: after.city },
    metadata: { changedFields: ['city'], source: 'marketplace-location-seo-backfill' }
  });
});
```

The script must be idempotent: an already canonical ADL exits successfully without a duplicate audit row.

- [ ] **Step 2: Run all focused tests**

Run: `cd server && JWT_SECRET=test-secret NODE_ENV=test npx tsx --test tests/marketplaceLocation.test.ts tests/marketplaceSeoService.test.ts tests/marketplaceSeo.integration.test.ts tests/marketplace.test.ts tests/marketplaceSuperAdmin.test.ts tests/subscriptionOnboarding.test.ts tests/superAdminOnboarding.test.ts`

Run: `cd client && npm run test:run -- src/features/marketplace/location.test.ts src/pages/MarketplaceHome.test.tsx src/pages/CoachingProfile.test.tsx src/features/superadmin-institutes/OnboardingWizard.test.tsx src/features/superadmin-marketplace/ListingEditorDrawer.test.tsx src/features/superadmin-marketplace/listingForm.test.ts`

Expected: all focused tests PASS.

- [ ] **Step 3: Run repository-level verification**

Run: `cd server && npm run build`

Run: `cd client && npm run build`

Run: `git diff --check`

Run: `rg -n "<option value=\"(Meerut|Saharanpur|Delhi NCR|Pune|Other)\"|label=\"City\".*<Input" client/src server/src --glob '!**/dist/**'`

Expected: builds and diff check pass; the city scan returns no unsupported marketplace options/free-text marketplace city input.

- [ ] **Step 4: Commit the backfill utility**

```bash
git add server/src/scripts/backfillAdlMarketplaceCity.ts
git commit -m "ops: add guarded ADL marketplace city backfill"
```

---

### Task 9: Production Backfill, Deploy, and Search Verification

**Files:**
- No new source files.
- Deployment targets: Heroku app `pacific-bayou-07588`, GitHub `origin/main`, Cloudflare-served `https://mathlogs.app`.

**Interfaces:**
- Consumes: completed commits and Heroku production config.
- Produces: corrected production data, applied constraint, deployed marketplace behavior, synchronized GitHub main, and verified crawlable output.

- [ ] **Step 1: Confirm the deployment preconditions read-only**

Run production queries that print only:

- current public listing IDs, names, city, and status;
- ADL exact ID/name/city;
- count of all public listings whose city is not exactly `Muzaffarnagar`.

Expected: ADL is the sole public listing, its city is `null`, and violating count is `1`.

- [ ] **Step 2: Run the guarded ADL backfill before deploying the constraint**

Run `heroku run --no-tty --app pacific-bayou-07588 "cd server && node dist/scripts/backfillAdlMarketplaceCity.js"`. Verify ADL now has city `Muzaffarnagar` and exactly one audit row with source `marketplace-location-seo-backfill`.

- [ ] **Step 3: Deploy main to Heroku**

```bash
git push heroku main
```

Expected: build succeeds, Prisma release command applies `20260827010000_enforce_marketplace_public_city`, and the web dyno reaches `up`.

- [ ] **Step 4: Verify production health and marketplace behavior**

Check:

```text
GET https://mathlogs.app/health
GET https://mathlogs.app/api/marketplace/search?city=Muzaffarnagar
GET https://mathlogs.app/coaching
GET https://mathlogs.app/coaching/adl-accountancy-classes-s71y
GET https://mathlogs.app/coaching/muzaffarnagar/areas/gandhi-colony
GET https://mathlogs.app/coaching/muzaffarnagar/classes/class-11
GET https://mathlogs.app/coaching/muzaffarnagar/subjects/accountancy
GET https://mathlogs.app/coaching/muzaffarnagar/areas/gandhi-colony/classes/class-9
GET https://mathlogs.app/sitemap.xml
```

Expected:

- health is `200`;
- search returns ADL;
- ADL profile title starts with `ADL Accountancy Classes`;
- Gandhi Colony, Class 11, and Accountancy pages are indexable and contain ADL;
- the Gandhi Colony + Class 9 example is `noindex` and absent from the sitemap because ADL does not offer Class 9;
- sitemap contains only the valid ADL-backed facet URLs and profile URL.

- [ ] **Step 5: Validate structured data and canonical consistency**

Use Google's Rich Results Test on the ADL profile and one valid facet page. Compare response HTML canonical URLs, titles, robots directives, JSON-LD, visible headings, and sitemap URLs. Any mismatch blocks completion.

- [ ] **Step 6: Push the verified main branch to GitHub**

```bash
git push origin main
```

Expected: `main`, `origin/main`, and the Heroku deployed commit resolve to the same SHA. Confirm unrelated uncommitted files remain untracked/unstaged.

- [ ] **Step 7: Submit the sitemap through Search Console with action-time confirmation**

If the user is authenticated to the `mathlogs.app` Search Console property, open the Sitemaps page, prepare `https://mathlogs.app/sitemap.xml`, and pause before the final Submit action for confirmation. After submission, request indexing for `/coaching`, the ADL profile, and one representative valid facet page. If Search Console access is unavailable, provide the exact URLs and steps without claiming submission.

- [ ] **Step 8: Record the final evidence**

Report commit SHA, Heroku release, production health result, ADL API presence, valid/invalid facet checks, sitemap checks, structured-data result, GitHub synchronization, and Search Console submission state. Explicitly state that search position is not guaranteed and normally takes time to change.
