# Marketplace Location Integrity and Data-Backed SEO Design

Date: 2026-08-27
Status: Approved design, awaiting specification review

## Objective

Make Muzaffarnagar the only marketplace city for the current launch, prevent incomplete or unsupported city data from hiding valid listings, create scalable search-engine landing pages for real combinations of locality, class, and subject, and maximize truthful exact-name discoverability for every public coaching profile.

The system must never create an indexable landing page unless at least one active, publicly listed coaching institute genuinely matches every facet in that page.

## Current problem

The public marketplace defaults to a `Muzaffarnagar` city filter. ADL Accountancy Classes is active and public, but its production `city` value is `null`; only its `area` value, `gandhi colony`, is present. The public search API therefore excludes ADL when the default city filter is applied.

The wider data flow permits the same defect to recur:

- initial public onboarding creates institutes without collecting city data;
- setup offers several unsupported cities;
- server write paths accept arbitrary or blank city strings;
- superadmin tools use free-text city fields;
- the public UI contains an `All Cities` state even though the marketplace currently serves one city.

The current SEO implementation gives `/coaching` and individual coaching profiles server-rendered metadata and sitemap entries. Area, class, and subject filtering is client state on the same canonical page, so search engines cannot discover a distinct, canonical result page for a real query such as a class or subject in a particular Muzaffarnagar locality.

## Scope

### Included

- Muzaffarnagar-only city selection in all marketplace-related teacher and administrator forms.
- Server-side normalization and validation of marketplace city writes.
- Prevention of incomplete institutes becoming public before setup is complete.
- Production correction of ADL's city with an immutable marketplace audit entry.
- Data-backed, crawlable pages for area, class, subject, and all useful combinations of those facets.
- Unique metadata, canonical URLs, visible headings/copy, breadcrumbs, structured data, internal links, and sitemap entries for valid landing pages.
- `noindex` behavior for invalid or empty facet combinations.
- Improved coaching-profile metadata using real location, subject, and class data.
- Exact coaching-name SEO signals for public profiles, including duplicate-name disambiguation.
- Automated tests and production verification.

### Excluded

- Supporting cities other than Muzaffarnagar in this release.
- Creating fixed pages for example values such as Gandhi Colony or Class 9.
- Creating pages for searches that have no matching public coaching.
- Guaranteeing a particular Google ranking position.
- Fabricating reviews, locations, subjects, classes, or descriptive content.
- Paid advertisements, backlink campaigns, or changes to third-party Google Business Profiles without separate authorization.

## Domain rules

### Supported city

The canonical marketplace city is `Muzaffarnagar`.

A shared server domain helper will:

- trim and compare city values case-insensitively;
- recognize only explicit legacy spelling variants already used by MathLogs and normalize them to `Muzaffarnagar`;
- reject unsupported city values;
- require the canonical city whenever `isPubliclyListed` is true;
- allow `null` only while a listing is private or awaiting setup.

Client applications will use a single-option city selector rather than a free-text field. The server remains authoritative even if a client is bypassed.

### Publication lifecycle

Newly provisioned institutes will remain private until account setup is submitted. During setup, a teacher who enables the public directory must explicitly keep/select `Muzaffarnagar` and provide the other required marketplace fields. The completed setup can then publish the listing.

Editing an existing listing follows the same invariant: a listing cannot transition to public unless its city normalizes to `Muzaffarnagar`.

### Facet normalization

Area, class, and subject values remain flexible listing data. Each value will be normalized for comparison and converted to a stable URL slug:

- surrounding whitespace is removed;
- comparison is case-insensitive;
- repeated whitespace and punctuation are normalized for slugs;
- the displayed label remains the canonical label stored on a matching listing;
- slug resolution must map back to a real value present on at least one active public listing.

Canonical display labels will be chosen deterministically after case and whitespace normalization. If two genuinely distinct labels still collapse to the same URL slug, that slug is ambiguous and remains non-indexable until the listing data is corrected.

## Public URL model

`/coaching` remains the canonical marketplace page for all Muzaffarnagar listings. `/coaching/muzaffarnagar` will permanently redirect to `/coaching` to avoid a duplicate city page.

Facet pages use a fixed segment order so every filter set has exactly one canonical URL:

- `/coaching/muzaffarnagar/areas/:areaSlug`
- `/coaching/muzaffarnagar/classes/:classSlug`
- `/coaching/muzaffarnagar/subjects/:subjectSlug`
- `/coaching/muzaffarnagar/areas/:areaSlug/classes/:classSlug`
- `/coaching/muzaffarnagar/areas/:areaSlug/subjects/:subjectSlug`
- `/coaching/muzaffarnagar/classes/:classSlug/subjects/:subjectSlug`
- `/coaching/muzaffarnagar/areas/:areaSlug/classes/:classSlug/subjects/:subjectSlug`

Alternate segment orders, unsupported cities, malformed slugs, ambiguous slugs, and combinations with no matches will not be canonical pages. They will either redirect to the canonical ordering when resolution is safe or return a non-indexable marketplace state.

## Server architecture

### Marketplace location module

A focused marketplace location module will own:

- the supported city constant;
- city normalization and validation;
- facet label normalization and slug generation;
- canonical facet-path construction and parsing.

All marketplace write paths will call this module, including public onboarding/setup, external teacher registration, teacher marketplace settings, superadmin onboarding, and superadmin listing edits.

### Marketplace landing-page service

A service will query active, publicly listed Muzaffarnagar institutes and build a facet catalog from their actual `area`, `classesOffered`, and `subjectsOffered` values. It will expose pure/testable operations to:

- resolve incoming facet slugs to canonical labels;
- determine whether a complete facet combination has at least one match;
- return the exact API filters for that combination;
- generate its canonical path, title, description, heading, intro text, and breadcrumbs;
- enumerate unique valid facet URLs for the sitemap.

The existing marketplace query logic will be extracted from the controller into a reusable search service. The current search endpoint will continue to serve interactive filtering and will use exact normalized facet matching for canonical landing pages. Free-text marketplace search remains non-indexed UI state.

A public `GET /api/marketplace/landing` endpoint will accept `areaSlug`, `classSlug`, and `subjectSlug`. It will call the landing-page and search services and return one page model containing:

- whether the combination is valid and indexable;
- resolved canonical facet labels and filter values;
- matching coaching cards and result count;
- title, description, heading, introduction, and canonical path;
- breadcrumbs and related valid landing-page links.

This gives the React route a single authoritative response. The server-side HTML metadata handler will call the same service directly, not make an HTTP request to itself.

The server-side HTML metadata handler and sitemap generator will both use the same landing-page service so canonical URLs and indexability cannot drift between layers.

### Persistence enforcement

Server validation is the primary enforcement layer. A database check constraint will additionally prevent an institute from being publicly listed with a missing or unsupported city. Private legacy/test records may retain other city values, but they cannot be published until corrected.

The migration order is:

1. correct ADL to `Muzaffarnagar` and write a marketplace audit record;
2. verify no other public record violates the new invariant;
3. install the publication/city constraint;
4. deploy application enforcement.

The production data correction must target ADL's exact institute ID and validate its name before updating it.

## Client behavior

### City selection

The following interfaces will show a dropdown with only `Muzaffarnagar`:

- account setup public-directory section;
- teacher marketplace settings;
- external teacher registration, even if the route is not currently linked;
- superadmin institute onboarding;
- superadmin marketplace listing editor.

The marketplace results page will remain scoped to Muzaffarnagar. It will not offer `All Cities`, and clearing filters will clear search, subject, class, and area while retaining Muzaffarnagar.

### Routed landing pages

The marketplace React page will read route facets, request their resolved landing-page state, and render:

- a unique visible `h1` and explanatory introduction;
- the matching coaching cards;
- active facet chips;
- links to related valid area, class, and subject pages;
- a breadcrumb trail back to the Muzaffarnagar marketplace;
- a clear non-indexable empty/invalid state when the server rejects a combination.

Interactive filtering can navigate to a canonical landing URL when the selected filters correspond to a real indexable combination. Free-text queries and sort changes remain query/UI state and must canonicalize to the underlying facet page rather than producing new indexable URLs.

## SEO output

### Valid landing pages

Every valid page will receive server-rendered and client-consistent:

- a unique descriptive `<title>`;
- a natural meta description based on its actual facets and result count;
- a self-referencing canonical URL;
- `index, follow, max-image-preview:large` robots metadata;
- a visible heading and useful copy matching the metadata;
- `CollectionPage`, `ItemList`, and `BreadcrumbList` JSON-LD describing only visible matching listings;
- internal links from the marketplace and related facet pages;
- inclusion in the dynamic XML sitemap.

### Invalid or empty pages

An invalid or currently empty combination will:

- return no coaching results;
- use `noindex, follow`;
- be excluded from the sitemap and related-page links;
- avoid structured data that claims matching businesses exist;
- offer a route back to the broader Muzaffarnagar marketplace.

### Coaching profiles

Individual coaching profile metadata will include the canonical city, locality, real subjects, and real classes without keyword stuffing. Structured data will describe the institute as an educational/local business only where the visible profile supports those facts. Breadcrumb markup will connect the profile to `/coaching` and to applicable real facet pages.

### Exact coaching-name discovery

Every active public profile will be optimized as the authoritative MathLogs page for its exact institute name:

- the exact stored coaching name leads the server-rendered title and visible `h1`;
- the canonical profile URL uses the stable name-derived slug assigned when the listing is created;
- the exact name appears in `EducationalOrganization`/`LocalBusiness` structured data, breadcrumbs, marketplace cards, and internal-link anchor text;
- profile descriptions naturally include the name, locality, city, real subjects, and real classes;
- profile sitemap entries include `lastmod` so material listing updates can be recrawled;
- a connected Google Maps or Business Profile URL is included as `sameAs` only when it genuinely belongs to that coaching;
- renamed institutes retain a stable canonical URL unless a separately designed redirect migration changes it, preventing broken indexed links.

If multiple institutes have the same name, MathLogs will not merge or fabricate identity signals. Titles and descriptions will distinguish them with locality and, when necessary, teacher name. Each listing keeps its own canonical profile and structured-data entity.

Teachers should be advised to set their MathLogs profile URL as the website link in their verified Google Business Profile when appropriate. That external account change is operational work and requires the teacher's authorization; MathLogs will not perform it automatically.

## Sitemap strategy

The dynamic sitemap will continue to include static pages and active public coaching profiles. It will additionally enumerate deduplicated facet URLs derived from public listing data.

For each listing, the generator may emit its individual area, class, and subject pages and combinations supported by that listing. A URL is included once even when multiple listings support it. The sitemap will contain only canonical absolute URLs.

The current one-hour cache remains acceptable. Publishing or editing a listing may invalidate the in-process marketplace SEO cache so new facets do not wait for the full cache duration. If the generated sitemap approaches Google's 50,000 URL limit, it must be split into a sitemap index before adding further combinations.

## Error handling and security

- Unsupported city writes return a clear `400` validation error.
- Attempts to publish without the canonical city return a clear `400` error.
- Landing-page parsing treats route input as untrusted and never interpolates it into raw SQL.
- Prisma queries remain institute-status and public-listing scoped.
- JSON-LD values are serialized through the existing safe JSON-LD helper.
- Private, inactive, or delisted institutes never contribute facet values, landing pages, result cards, or sitemap entries.
- Existing ownership and authentication rules for teacher and superadmin mutations remain unchanged.

## Testing strategy

Implementation follows test-driven development.

### Server unit tests

- canonical and legacy spelling inputs normalize to `Muzaffarnagar`;
- blank or unsupported cities are rejected for public listings;
- private listings may remain unpublished with no city;
- facet values produce stable slugs and canonical fixed-order paths;
- only real, non-empty facet combinations are enumerated;
- invalid, ambiguous, or empty combinations are non-indexable;
- SEO titles, descriptions, breadcrumbs, and canonical paths reflect resolved facets.

### Server integration tests

- marketplace registration rejects unsupported cities;
- setup/profile/superadmin publication rejects missing or unsupported city data;
- the Muzaffarnagar search includes ADL-like records with canonical city data;
- area, class, subject, and combined filters return only exact matching public records;
- private, inactive, and delisted records do not generate facets;
- sitemap output contains valid facet URLs and excludes empty combinations;
- server-rendered facet HTML contains the expected canonical URL, robots value, and structured data.
- server-rendered coaching profiles lead with the exact institute name and disambiguate duplicate names using real location or teacher data;
- profile sitemap entries expose the listing's current `updatedAt` value as `lastmod`.

Existing marketplace tests that use Jaipur as a valid public city will be rewritten to use Muzaffarnagar because multi-city support is explicitly out of scope.

### Client tests

- every marketplace city control offers only Muzaffarnagar;
- clearing marketplace filters retains Muzaffarnagar;
- route parsing produces the expected active area/class/subject state;
- valid landing state renders the matching heading, chips, breadcrumbs, and results;
- invalid landing state renders the non-indexable empty experience;
- interactive facet selection navigates to the canonical fixed-order URL.

### Production verification

- confirm ADL is the only currently public listing and has city `Muzaffarnagar`;
- confirm `/api/marketplace/search?city=Muzaffarnagar` returns ADL;
- confirm the marketplace UI shows ADL with the city filter active;
- verify representative valid and invalid facet pages by HTTP response and rendered metadata;
- validate representative JSON-LD with Google's Rich Results Test;
- verify the production sitemap contains only real facet pages;
- submit or resubmit the sitemap in Google Search Console and request indexing for the base marketplace, ADL profile, and representative landing pages when Search Console access is available.

## Rollout

1. Add failing tests for city invariants and facet SEO behavior.
2. Implement the marketplace location and landing-page modules.
3. Update all server write paths and client city controls.
4. Add routed marketplace landing-page rendering and server metadata.
5. Extend sitemap generation and internal links.
6. Build and run focused and regression tests.
7. Apply the guarded ADL data correction and database constraint.
8. Deploy to Heroku, verify health and production behavior, then push the same commit to GitHub.
9. Complete Search Console validation/submission as a separate authenticated operational step.

## Success criteria

- ADL appears when the Muzaffarnagar marketplace filter is active.
- No public listing can have a missing, misspelled, or unsupported city.
- Teachers and administrators can select only Muzaffarnagar in marketplace city controls.
- An exact coaching-name query has a dedicated, indexable profile whose title, heading, canonical URL, structured data, internal links, and sitemap entry consistently identify that coaching.
- Every indexable facet URL corresponds to at least one active public matching coaching.
- Empty combinations are not indexed or included in the sitemap.
- Metadata, visible content, canonical links, structured data, API filters, and sitemap entries agree on the same facets.
- The deployed application passes local and production verification without changing or publishing unrelated working-tree files.

## Ranking expectations

This work improves crawlability, relevance signals, data consistency, and eligibility for enhanced search presentation. It cannot guarantee first position. Actual ranking will also depend on indexing time, content quality, competition, proximity, verified Google Business Profiles, genuine reviews, external references, and user behavior.
