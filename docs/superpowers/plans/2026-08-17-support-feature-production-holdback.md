# Support Feature Production Holdback Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship every completed MathLogs feature except ticket-based Support, while preserving Support code/data and keeping operational communication consent available in Settings.

**Architecture:** Add exact-string server and client feature flags that default to disabled. Enforce the server flag before authentication, upload parsing, reauthentication, and Support controllers; use the client flag to omit Support routes/navigation/metrics and redirect dormant URLs. Keep the shared Support schema untouched and extract communication preferences into a reusable Settings card.

**Tech Stack:** TypeScript, Express, React 19, React Router, Prisma/PostgreSQL, Node test runner, Vitest, Vite, Heroku.

## Global Constraints

- `SUPPORT_FEATURE_ENABLED` and `VITE_SUPPORT_FEATURE_ENABLED` enable Support only when their normalized value is the exact string `true`.
- Both flags default to disabled, including production.
- The server is the authoritative security boundary; client hiding never grants API access.
- Do not change Prisma schema or migrations and do not delete, backfill, reset, truncate, or rewrite Support data.
- Keep operational communications, lifecycle reminders, email/WhatsApp delivery, and communication-preference APIs enabled.
- Disabled Support endpoints return the ordinary JSON not-found response before authentication, upload parsing, reauthentication, or controller execution.
- Preserve existing Support behavior when both flags are explicitly enabled.
- Work on `main`, preserve unrelated changes, use test-driven development, and commit each independently verified task.

---

## File structure

- `server/src/config/featureFlags.ts` — pure exact-string server flag parsing.
- `server/src/middleware/supportFeatureGate.ts` — Express not-found gate for dormant Support routes.
- `server/tests/supportFeatureHoldback.test.ts` — disabled-default and explicitly-enabled API boundary tests.
- `server/src/routes/api.ts` and `server/src/routes/superAdminRoutes.ts` — install the gate before Support middleware/controllers.
- `server/src/services/superAdminHomeService.ts` and `server/src/services/superAdminSystemService.ts` — omit disabled Support queries and aggregates.
- Existing Support/Home/System server tests — explicitly enable Support only where legacy behavior is under test.
- `client/src/config/featureFlags.ts` — pure client flag parsing and current build-time flag.
- `client/src/features/superadmin-shell/navigation.ts` — produce gated Superadmin navigation.
- `client/src/components/Layout.tsx` — omit institute Support navigation in all layouts.
- `client/src/App.tsx` — redirect dormant Support URLs and avoid rendering Support pages.
- `client/src/features/superadmin-shell/SuperAdminShell.tsx`, `client/src/pages/superadmin/SuperAdminHome.tsx`, and `client/src/pages/superadmin/SuperAdminSystem.tsx` — consume the gated navigation/indicator contract.
- `client/src/features/superadmin-communications/OperationalCommunicationPreferences.tsx` — reusable operational-consent card.
- `client/src/pages/Settings.tsx` and `client/src/pages/Support.tsx` — render the extracted preference card without duplicating state.
- Focused Vitest files alongside the client units above.
- `server/.env.example` and `README.md` — document the dormant flag contract and later re-enable procedure.

---

### Task 1: Enforce the server Support gate

**Files:**
- Create: `server/src/config/featureFlags.ts`
- Create: `server/src/middleware/supportFeatureGate.ts`
- Create: `server/tests/supportFeatureHoldback.test.ts`
- Modify: `server/src/routes/api.ts`
- Modify: `server/src/routes/superAdminRoutes.ts`
- Modify: `server/tests/superAdminSupport.test.ts`
- Modify: `server/tests/superAdminSupportSession.test.ts`

**Interfaces:**
- Produces: `isSupportFeatureEnabled(value?: string): boolean`.
- Produces: `requireSupportFeature(req: Request, res: Response, next: NextFunction): Response | void`.
- The route gate reads `process.env.SUPPORT_FEATURE_ENABLED` per request so tests and a restarted production process use the current environment deterministically.

- [ ] **Step 1: Write failing flag and route-boundary tests**

Add pure assertions and an app-level test that exercises representative endpoints without credentials:

```ts
assert.equal(isSupportFeatureEnabled(undefined), false);
assert.equal(isSupportFeatureEnabled('false'), false);
assert.equal(isSupportFeatureEnabled(' TRUE '), true);

process.env.SUPPORT_FEATURE_ENABLED = 'false';
assert.equal((await fetch(`${baseUrl}/api/support/tickets`)).status, 404);
assert.equal((await fetch(`${baseUrl}/api/support/attachments/missing`)).status, 404);
assert.equal((await fetch(`${baseUrl}/api/super-admin/support/tickets`)).status, 404);
assert.equal((await fetch(`${baseUrl}/api/super-admin/support/cases`)).status, 404);
assert.equal((await fetch(`${baseUrl}/api/super-admin/support-sessions`, { method: 'POST' })).status, 404);

// Communication consent is deliberately outside the holdback and reaches auth.
assert.equal((await fetch(`${baseUrl}/api/communication-preferences`)).status, 401);

process.env.SUPPORT_FEATURE_ENABLED = 'true';
assert.equal((await fetch(`${baseUrl}/api/support/tickets`)).status, 401);
assert.equal((await fetch(`${baseUrl}/api/super-admin/support/tickets`)).status, 401);
```

Restore the original environment value in `after()` so the suite is order-independent. Update existing Support behavior tests to set the flag to `true` in `before()` and restore it in `after()`.

- [ ] **Step 2: Run the test to verify RED**

Run:

```bash
cd server
npx tsx --test --test-force-exit tests/supportFeatureHoldback.test.ts
```

Expected: FAIL because `featureFlags.ts` and the server gate do not exist and Support currently reaches authentication/controllers by default.

- [ ] **Step 3: Implement exact-string parsing and the not-found middleware**

Create:

```ts
// server/src/config/featureFlags.ts
export function isSupportFeatureEnabled(value = process.env.SUPPORT_FEATURE_ENABLED): boolean {
  return value?.trim().toLowerCase() === 'true';
}
```

Create:

```ts
// server/src/middleware/supportFeatureGate.ts
import type { NextFunction, Request, Response } from 'express';
import { isSupportFeatureEnabled } from '../config/featureFlags';

export function requireSupportFeature(_req: Request, res: Response, next: NextFunction): Response | void {
  if (!isSupportFeatureEnabled()) {
    return res.status(404).json({ success: false, error: 'NOT_FOUND' });
  }
  next();
}
```

In `server/src/routes/api.ts`, install `router.use('/support', requireSupportFeature)` immediately before the first `/support/*` route and before `authenticateToken` or `parseSupportAttachments`.

In `server/src/routes/superAdminRoutes.ts`, install `router.use(['/support', '/support-sessions'], requireSupportFeature)` before the router-wide Superadmin authentication middleware and before every Support controller route. If the file currently authenticates globally first, move only the gate above authentication; keep all non-Support authorization order unchanged.

- [ ] **Step 4: Run focused server GREEN tests**

Run:

```bash
cd server
npx tsx --test --test-force-exit tests/supportFeatureHoldback.test.ts tests/superAdminSupport.test.ts tests/superAdminSupportSession.test.ts
npx tsc --noEmit
```

Expected: all tests PASS and TypeScript exits 0.

- [ ] **Step 5: Commit server gate**

```bash
git add server/src/config/featureFlags.ts server/src/middleware/supportFeatureGate.ts server/src/routes/api.ts server/src/routes/superAdminRoutes.ts server/tests/supportFeatureHoldback.test.ts server/tests/superAdminSupport.test.ts server/tests/superAdminSupportSession.test.ts
git commit -m "feat: hold back support API by default"
```

---

### Task 2: Remove dormant Support from server aggregates

**Files:**
- Modify: `server/src/services/superAdminHomeService.ts`
- Modify: `server/src/services/superAdminSystemService.ts`
- Modify: `server/tests/superAdminHome.test.ts`
- Modify: `server/tests/superAdminSystem.test.ts`

**Interfaces:**
- Consumes: `isSupportFeatureEnabled()` from Task 1.
- Produces: Home responses with `openSupportTickets: 0` and no `kind: 'SUPPORT'` attention items while disabled.
- Produces: System responses with `security.activeSupportSessions: 0` while disabled, retaining the response property for backward-compatible typing.

- [ ] **Step 1: Add failing disabled/enabled aggregate assertions**

In the existing integration tests, preserve the current Support-enabled assertions under `SUPPORT_FEATURE_ENABLED=true`, then add disabled calls:

```ts
process.env.SUPPORT_FEATURE_ENABLED = 'false';
const disabledHome = await getSuperAdminHome();
assert.equal(disabledHome.metrics.openSupportTickets, 0);
assert.equal(disabledHome.attention.some(item => item.kind === 'SUPPORT'), false);

const disabledSystem = await getSystemOverview();
assert.equal(disabledSystem.security.activeSupportSessions, 0);
```

Restore environment state after each test to prevent cross-file leakage.

- [ ] **Step 2: Run aggregate tests to verify RED**

Run:

```bash
cd server
npx tsx --test --test-force-exit tests/superAdminHome.test.ts tests/superAdminSystem.test.ts
```

Expected: FAIL because both services still query and expose Support state while disabled.

- [ ] **Step 3: Make Support queries conditional**

Read the flag once at the start of each service call:

```ts
const supportEnabled = isSupportFeatureEnabled();
```

In Home, replace Support count/list promise entries with disabled-safe promises:

```ts
supportEnabled
  ? prisma.supportTicket.count({ where: { status: { not: 'CLOSED' } } })
  : Promise.resolve(0),
supportEnabled
  ? prisma.supportTicket.findMany({
      where: { status: { not: 'CLOSED' } },
      select: {
        id: true,
        reference: true,
        instituteId: true,
        subject: true,
        priority: true,
        status: true,
        createdAt: true,
        institute: { select: { name: true } }
      },
      orderBy: [{ priority: 'desc' }, { createdAt: 'asc' }],
      take: 30
    })
  : Promise.resolve([]),
```

The existing `supportTickets.map(...)` then naturally emits no Support attention items.

In System, replace the active Support session count promise with:

```ts
supportEnabled
  ? prisma.superAdminSupportSession.count({ where: { endedAt: null, expiresAt: { gt: new Date() } } })
  : Promise.resolve(0),
```

- [ ] **Step 4: Run aggregate and complete focused Support tests**

Run:

```bash
cd server
npx tsx --test --test-force-exit tests/superAdminHome.test.ts tests/superAdminSystem.test.ts tests/supportFeatureHoldback.test.ts tests/superAdminSupport.test.ts tests/superAdminSupportSession.test.ts
npm run build
```

Expected: all tests PASS and the server build exits 0.

- [ ] **Step 5: Commit aggregate holdback**

```bash
git add server/src/services/superAdminHomeService.ts server/src/services/superAdminSystemService.ts server/tests/superAdminHome.test.ts server/tests/superAdminSystem.test.ts
git commit -m "feat: omit dormant support operations"
```

---

### Task 3: Hide Support navigation, routes, and indicators in the web client

**Files:**
- Create: `client/src/config/featureFlags.ts`
- Create: `client/src/config/featureFlags.test.ts`
- Modify: `client/src/App.tsx`
- Create: `client/src/App.supportRoutes.test.tsx`
- Modify: `client/src/components/Layout.tsx`
- Create: `client/src/components/Layout.support.test.tsx`
- Modify: `client/src/features/superadmin-shell/navigation.ts`
- Modify: `client/src/features/superadmin-shell/SuperAdminShell.tsx`
- Modify: `client/src/features/superadmin-shell/SuperAdminShell.test.tsx`
- Modify: `client/src/pages/superadmin/SuperAdminHome.tsx`
- Modify: `client/src/pages/superadmin/SuperAdminSystem.tsx`
- Create: `client/src/pages/superadmin/supportIndicators.test.tsx`
- Modify: `client/src/features/superadmin-shell/supportSession.ts`

**Interfaces:**
- Produces: `parseSupportFeatureFlag(value?: string): boolean` and `supportFeatureEnabled: boolean`.
- Produces: `getSuperAdminNavigation(supportEnabled = supportFeatureEnabled)` returning the existing navigation array minus Support when disabled.
- Produces: `SuperAdminShell({ navigation = getSuperAdminNavigation(), ... })` so enabled behavior is directly testable without mutating Vite globals.
- Produces: `buildHomeMetrics(data, supportEnabled)` and `visibleHomeAttention(items, supportEnabled)` for deterministic indicator filtering.
- Produces: `buildSystemMetrics(overview, supportEnabled)` for deterministic system-card filtering.
- Produces: `clearSupportSession()` reuse for stale dormant sessions.

- [ ] **Step 1: Write failing pure, navigation, route, and indicator tests**

Add exact-string parser tests:

```ts
expect(parseSupportFeatureFlag(undefined)).toBe(false);
expect(parseSupportFeatureFlag('false')).toBe(false);
expect(parseSupportFeatureFlag(' TRUE ')).toBe(true);
```

Update `SuperAdminShell.test.tsx` to assert the default render excludes `Support` but includes `Communications`. Add an optional `navigation` prop to `SuperAdminShell`, then render `<SuperAdminShell navigation={getSuperAdminNavigation(true)}>` and assert Support is present when explicitly enabled.

Add route tests around an exported `SupportRouteBoundary`:

```tsx
root.render(
  <MemoryRouter initialEntries={['/support']}>
    <Routes>
      <Route path="/support" element={<SupportRouteBoundary enabled={false} scope="institute"><div>Support page</div></SupportRouteBoundary>} />
      <Route path="/settings" element={<div>Settings page</div>} />
    </Routes>
  </MemoryRouter>
);
expect(container.textContent).toContain('Settings page');
expect(container.textContent).not.toContain('Support page');
```

Cover Superadmin redirect to `/super-admin` and all institute Layout variants omitting Support. Test `buildHomeMetrics`/`visibleHomeAttention` with a Support metric/item and assert both are absent while disabled. Test `buildSystemMetrics` with `activeSupportSessions: 2` and assert the corresponding card is absent while disabled. Put a `superAdminSupportSession` value in `sessionStorage`, render disabled `Layout`, and assert it is cleared and the banner is absent.

- [ ] **Step 2: Run client tests to verify RED**

Run:

```bash
cd client
npx vitest run src/config/featureFlags.test.ts src/features/superadmin-shell/SuperAdminShell.test.tsx src/App.supportRoutes.test.tsx src/components/Layout.support.test.tsx src/pages/superadmin/supportIndicators.test.tsx
```

Expected: FAIL because the client feature contract and boundaries do not exist and Support is currently rendered.

- [ ] **Step 3: Implement the client flag and route boundary**

Create:

```ts
// client/src/config/featureFlags.ts
export function parseSupportFeatureFlag(value?: string): boolean {
  return value?.trim().toLowerCase() === 'true';
}

export const supportFeatureEnabled = parseSupportFeatureFlag(import.meta.env.VITE_SUPPORT_FEATURE_ENABLED);
```

Export a focused boundary from `App.tsx`:

```tsx
export function SupportRouteBoundary({ enabled, scope, children }: {
  enabled: boolean;
  scope: 'institute' | 'superadmin';
  children: ReactNode;
}) {
  if (!enabled) return <Navigate to={scope === 'superadmin' ? '/super-admin' : '/settings'} replace />;
  return children;
}
```

Wrap the institute and both Superadmin Support route elements with this boundary. Keep lazy declarations safe: a disabled route must render the redirect without rendering the lazy Support component.

- [ ] **Step 4: Gate all Support navigation and indicators**

Change `navigation.ts` to export:

```ts
export function getSuperAdminNavigation(supportEnabled = supportFeatureEnabled) {
  return baseNavigation.filter(item => supportEnabled || item.id !== 'support');
}
```

Have `SuperAdminShell` accept `navigation = getSuperAdminNavigation()` and use that exact array for titles and every navigation group.

In `Layout.tsx`, filter each desktop/mobile navigation collection and the direct Support footer/link using `supportFeatureEnabled`. Remove `/support` from `showMobileNav` when disabled. On disabled mount, call `clearSupportSession()`, and render `<SupportSessionBanner />` only when Support is enabled.

In `SuperAdminHome.tsx`, export `buildHomeMetrics(data, supportEnabled)` and `visibleHomeAttention(items, supportEnabled)`, then use them so the `Open support` metric and `item.kind === 'SUPPORT'` entries are absent while disabled. In `SuperAdminSystem.tsx`, export and consume `buildSystemMetrics(overview, supportEnabled)` so `Active support sessions` is absent while disabled.

- [ ] **Step 5: Run focused client GREEN tests and lint**

Run:

```bash
cd client
npx vitest run src/config/featureFlags.test.ts src/features/superadmin-shell/SuperAdminShell.test.tsx src/App.supportRoutes.test.tsx src/components/Layout.support.test.tsx src/pages/superadmin/supportIndicators.test.tsx
npx eslint src/App.tsx src/config/featureFlags.ts src/components/Layout.tsx src/features/superadmin-shell/navigation.ts src/features/superadmin-shell/SuperAdminShell.tsx src/pages/superadmin/SuperAdminHome.tsx src/pages/superadmin/SuperAdminSystem.tsx
npm run build
```

Expected: tests PASS, ESLint exits without errors, and the production client build exits 0.

- [ ] **Step 6: Commit client holdback**

```bash
git add client/src/App.tsx client/src/App.supportRoutes.test.tsx client/src/config/featureFlags.ts client/src/config/featureFlags.test.ts client/src/components/Layout.tsx client/src/components/Layout.support.test.tsx client/src/features/superadmin-shell/navigation.ts client/src/features/superadmin-shell/SuperAdminShell.tsx client/src/features/superadmin-shell/SuperAdminShell.test.tsx client/src/features/superadmin-shell/supportSession.ts client/src/pages/superadmin/SuperAdminHome.tsx client/src/pages/superadmin/SuperAdminSystem.tsx client/src/pages/superadmin/supportIndicators.test.tsx
git commit -m "feat: hide support UI by default"
```

---

### Task 4: Preserve communication consent in Settings

**Files:**
- Create: `client/src/features/superadmin-communications/OperationalCommunicationPreferences.tsx`
- Create: `client/src/features/superadmin-communications/OperationalCommunicationPreferences.test.tsx`
- Modify: `client/src/pages/Settings.tsx`
- Modify: `client/src/pages/Support.tsx`

**Interfaces:**
- Consumes: `instituteCommunicationApi.get()` and `instituteCommunicationApi.update({ emailOperational, whatsappOperational })`.
- Produces: `OperationalCommunicationPreferences` with self-contained loading, error, save, and accessible checkbox state.

- [ ] **Step 1: Write the failing preference component test**

Mock the API, render the component with the repository's existing `createRoot`/`act` pattern, and assert load/save behavior without adding a testing-library dependency:

```tsx
vi.mock('./api', () => ({
  instituteCommunicationApi: {
    get: vi.fn().mockResolvedValue({ emailOperational: true, whatsappOperational: false }),
    update: vi.fn().mockResolvedValue({ emailOperational: true, whatsappOperational: true })
  }
}));

await act(async () => { root.render(<OperationalCommunicationPreferences />); });
const inputs = Array.from(container.querySelectorAll<HTMLInputElement>('input[type="checkbox"]'));
expect(inputs).toHaveLength(2);
expect(inputs[0].checked).toBe(true);
await act(async () => { inputs[1].click(); });
expect(instituteCommunicationApi.update).toHaveBeenCalledWith({
  emailOperational: true,
  whatsappOperational: true
});
```

Also assert an API rejection renders a concise inline error without removing the rest of Settings.

- [ ] **Step 2: Run the test to verify RED**

Run:

```bash
cd client
npx vitest run src/features/superadmin-communications/OperationalCommunicationPreferences.test.tsx
```

Expected: FAIL because the component does not exist.

- [ ] **Step 3: Extract and render the preference card**

Move the existing preference load/update state and copy out of `Support.tsx` into the new component. Use labelled native checkboxes, disable both controls while a save is pending, optimistically avoid no state changes, and show `toast.success('Communication preferences updated')` after the persisted response replaces local state.

Render the component in `Settings.tsx` immediately after `ProfileSection`, for every institute plan including Quiz-only accounts:

```tsx
<ProfileSection />
<OperationalCommunicationPreferences />
```

Replace the duplicated preference block in `Support.tsx` with the same component so explicit later enablement retains the existing experience.

- [ ] **Step 4: Run focused and surrounding client tests**

Run:

```bash
cd client
npx vitest run src/features/superadmin-communications/OperationalCommunicationPreferences.test.tsx src/features/superadmin-shell/SuperAdminShell.test.tsx src/App.supportRoutes.test.tsx src/components/Layout.support.test.tsx src/pages/superadmin/supportIndicators.test.tsx
npx eslint src/features/superadmin-communications/OperationalCommunicationPreferences.tsx src/pages/Settings.tsx src/pages/Support.tsx
npm run build
```

Expected: tests PASS, ESLint exits without errors, and the client build exits 0.

- [ ] **Step 5: Commit Settings consent**

```bash
git add client/src/features/superadmin-communications/OperationalCommunicationPreferences.tsx client/src/features/superadmin-communications/OperationalCommunicationPreferences.test.tsx client/src/pages/Settings.tsx client/src/pages/Support.tsx
git commit -m "feat: move communication consent to settings"
```

---

### Task 5: Document, verify, push, deploy, and smoke-test production

**Files:**
- Modify: `server/.env.example`
- Modify: `README.md`
- Verify only: `server/prisma/schema.prisma`
- Verify only: `server/prisma/migrations/`

**Interfaces:**
- Documents: `SUPPORT_FEATURE_ENABLED=false` and `VITE_SUPPORT_FEATURE_ENABLED=false` as the production holdback defaults.
- Produces: a clean, committed `main` pushed to `origin/main` and deployed through the established Heroku integration.

- [ ] **Step 1: Add flag documentation**

Add to `server/.env.example`:

```env
# Ticket-based institute/Superadmin Support. Keep false until the feature is launched.
SUPPORT_FEATURE_ENABLED=false
```

Add both flags to the README environment tables and state that a later Support launch requires `SUPPORT_FEATURE_ENABLED=true` on the server and `VITE_SUPPORT_FEATURE_ENABLED=true` at client build time. Clarify that communication preferences and lifecycle messages remain active while Support is disabled.

- [ ] **Step 2: Run complete release verification**

Run:

```bash
cd server
npx prisma format
npx prisma validate
npx prisma generate
npx tsc --noEmit
npm test -- --test-force-exit
npm run build

cd ../client
npm run test:run
npm run lint
npm run build

cd ..
npm run build
git diff --check
git status --short
```

Expected: Prisma, TypeScript, complete server/client tests, lint, and all builds PASS; diff check is clean. If a known baseline failure appears, reproduce it independently, document the exact failing assertion, and do not describe the release as fully verified until it is resolved or explicitly accepted by the user.

- [ ] **Step 3: Prove there is no schema/data mutation in this holdback**

Run:

```bash
git diff 7ace7fc -- server/prisma/schema.prisma server/prisma/migrations
```

Expected: empty output. Do not run `db push`, reset, backfill, delete, or truncate.

- [ ] **Step 4: Commit documentation and final verified state**

```bash
git add server/.env.example README.md
git commit -m "docs: document support feature holdback"
git status --short
```

Expected: clean worktree.

- [ ] **Step 5: Inspect production delivery wiring without mutation**

Run:

```bash
git remote -v
git branch -vv
heroku apps:info --app mathlogs
heroku config:get SUPPORT_FEATURE_ENABLED --app mathlogs
heroku releases --app mathlogs --num 5
```

Expected: confirm whether GitHub `main` auto-deploys or a Heroku Git/API deploy is required, and confirm the server Support flag is absent/false. Never print secrets or use `heroku config` without a key.

- [ ] **Step 6: Push and deploy the authorized production release**

Push the verified commit series:

```bash
git push origin main
```

If Heroku is connected to `origin/main`, monitor the resulting build/release. Otherwise deploy the exact verified `main` commit through the configured Heroku remote/provider workflow. Do not use `--force` and do not change production configuration unless Support is unexpectedly enabled; if it is enabled, set only these two non-secret flags to false before release:

```bash
heroku config:set SUPPORT_FEATURE_ENABLED=false VITE_SUPPORT_FEATURE_ENABLED=false --app mathlogs
```

- [ ] **Step 7: Verify production health and dormant Support behavior**

Check the release status/logs and smoke-test the public production origin:

```bash
heroku releases --app mathlogs --num 3
heroku logs --app mathlogs --tail
```

Use bounded log observation, then verify:

- Health endpoint returns success.
- Login and Superadmin Home load.
- Plans show Marketplace ₹99, Quiz ₹249/₹2499, and Enterprise ₹499/₹4999.
- Billing, quiz, fees, Marketplace, and communications load without client console/API errors.
- Settings loads and saves email/WhatsApp operational consent.
- `/support`, `/super-admin/support`, and representative `/api/support/*` and `/api/super-admin/support/*` URLs do not expose Support.
- No Support link, Support metric, Support attention item, or active-support-session card is visible.

Stop and roll back the application release if core smoke tests fail. Do not alter customer or Support data during rollback.
