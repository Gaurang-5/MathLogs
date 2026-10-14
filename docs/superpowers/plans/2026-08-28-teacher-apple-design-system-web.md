# Teacher Apple-Inspired Design System — Web Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Apply one accessible, responsive, Apple-inspired MathLogs design system to every authenticated teacher route in the React web application.

**Architecture:** Semantic CSS tokens and a small `teacher-ui` component boundary provide the visual and interaction vocabulary. The existing `Layout` remains the authenticated shell, while teacher pages migrate incrementally to shared page, surface, action, feedback, and overlay conventions without changing their data logic.

**Tech Stack:** React 19, TypeScript 5.9, Tailwind CSS 4, Framer Motion 12, React Router 7, Vitest 3, Testing Library via the existing React test setup.

**Spec:** `docs/superpowers/specs/2026-08-28-teacher-apple-design-system-design.md`

## Global Constraints

- Preserve the MathLogs neutral black, graphite, gray, and white identity.
- Do not change server schemas, APIs, authorization, fee calculations, student lifecycles, or teacher workflow behavior.
- Preserve all existing worktree edits, especially fee-coverage changes in `Layout`, dashboard, billing, batch details, student profiles, and fee dialogs.
- Limit the rollout to authenticated institute routes; do not intentionally restyle public, onboarding, student, or super-admin areas.
- Default motion is critically damped and non-bouncy with a 0.3–0.4 second response; bounce is reserved for gesture momentum.
- Interactive targets are at least 44 by 44 CSS pixels or use an equivalent expanded hit area.
- Every icon-only action has an accessible name and visible keyboard focus.
- Respect reduced motion, reduced transparency, increased contrast, and scalable type.
- Translucent surfaces require an opaque fallback.
- Run `git diff --check` before every commit and stage only the files named by the current task.

## File Structure

- `client/src/index.css`: semantic teacher tokens, material/focus/press utilities, accessibility media queries, and responsive shell variables.
- `client/src/utils/appleDesign.ts`: shared Framer Motion transitions and variants with reduced-motion-safe selection.
- `client/src/components/teacher-ui/TeacherPage.tsx`: page title, actions, readable content width, and section spacing.
- `client/src/components/teacher-ui/TeacherSurface.tsx`: static and interactive surface variants.
- `client/src/components/teacher-ui/TeacherButton.tsx`: primary, secondary, quiet, and destructive actions with icon-only support.
- `client/src/components/teacher-ui/TeacherFeedback.tsx`: loading, empty, error, success, warning, and status patterns.
- `client/src/components/teacher-ui/index.ts`: the public teacher UI entry point.
- `client/src/components/Layout.tsx`: authenticated responsive shell only; page-specific styling stays outside it.
- `client/src/components/layoutNavigation.ts`: the single route-to-navigation model.
- `docs/guides/teacher-ui-standard.md`: durable repository-specific teacher UI rules.
- `AGENTS.md`: short root pointer requiring future teacher UI work to follow the guide.

---

### Task 1: Web Tokens and Motion Contract

**Files:**
- Modify: `client/src/index.css`
- Modify: `client/src/utils/appleDesign.ts`
- Create: `client/src/utils/appleDesign.test.ts`

**Interfaces:**
- Consumes: Framer Motion `Transition` and `Variants` types.
- Produces: `appleSpringDefault`, `appleSpringMomentum`, `appleSpringSnappy`, `applePageFade`, `appleItemReveal`, `appleStaggerContainer`, and `getApplePageTransition(reduceMotion: boolean): Transition`.

- [ ] **Step 1: Write the failing motion-contract tests**

```ts
import { describe, expect, it } from 'vitest';
import { appleSpringDefault, appleSpringMomentum, getApplePageTransition } from './appleDesign';

describe('teacher motion contract', () => {
  it('uses a non-bouncy spring by default', () => {
    expect(appleSpringDefault.type).toBe('spring');
    expect(appleSpringDefault.damping).toBeGreaterThanOrEqual(30);
  });

  it('reserves the softer damping for momentum interactions', () => {
    expect(appleSpringMomentum.type).toBe('spring');
    expect(appleSpringMomentum.damping).toBeLessThan(appleSpringDefault.damping as number);
  });

  it('cross-fades when reduced motion is requested', () => {
    expect(getApplePageTransition(true)).toEqual({ duration: 0.16, ease: 'easeOut' });
    expect(getApplePageTransition(false)).toBe(appleSpringDefault);
  });
});
```

- [ ] **Step 2: Run the test and confirm the missing export fails**

Run: `cd client && npm run test:run -- src/utils/appleDesign.test.ts`

Expected: FAIL because `getApplePageTransition` is not exported.

- [ ] **Step 3: Add the reduced-motion selector and semantic CSS foundations**

Add to `appleDesign.ts`:

```ts
export function getApplePageTransition(reduceMotion: boolean): Transition {
  return reduceMotion ? { duration: 0.16, ease: 'easeOut' } : appleSpringDefault;
}
```

Extend `index.css` with these named roles and utilities, mapping them through `@theme` where Tailwind utilities are needed:

```css
:root {
  --teacher-content-max: 96rem;
  --teacher-gutter: clamp(1rem, 2.4vw, 2rem);
  --teacher-control-height: 2.75rem;
  --teacher-radius-control: 0.875rem;
  --teacher-radius-card: 1.25rem;
  --teacher-radius-sheet: 1.75rem;
  --teacher-material: rgba(255, 255, 255, 0.72);
  --teacher-material-strong: rgba(255, 255, 255, 0.9);
  --teacher-press-scale: 0.97;
  --teacher-focus: 0 0 0 3px rgba(17, 24, 39, 0.2);
}

.teacher-interactive {
  min-height: var(--teacher-control-height);
  transition: transform 120ms ease-out, background-color 160ms ease-out,
    color 160ms ease-out, box-shadow 160ms ease-out;
  touch-action: manipulation;
}

.teacher-interactive:active { transform: scale(var(--teacher-press-scale)); }
.teacher-interactive:focus-visible { outline: none; box-shadow: var(--teacher-focus); }

@media (prefers-reduced-transparency: reduce) {
  .glass, .teacher-material { background: var(--bg-surface-opaque); backdrop-filter: none; }
}

@media (prefers-contrast: more) {
  .glass, .glass-panel, .teacher-material { border-color: currentColor; }
}
```

Replace the custom first-choice font with `system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif`, remove global negative body tracking, and retain size-specific heading tracking.

- [ ] **Step 4: Run the motion test and client build**

Run: `cd client && npm run test:run -- src/utils/appleDesign.test.ts && npm run build`

Expected: test PASS and Vite build succeeds.

- [ ] **Step 5: Commit the foundation**

```bash
git add client/src/index.css client/src/utils/appleDesign.ts client/src/utils/appleDesign.test.ts
git diff --check
git commit -m "feat: define teacher web design foundations"
```

### Task 2: Reusable Teacher Web Primitives

**Files:**
- Create: `client/src/components/teacher-ui/TeacherPage.tsx`
- Create: `client/src/components/teacher-ui/TeacherSurface.tsx`
- Create: `client/src/components/teacher-ui/TeacherButton.tsx`
- Create: `client/src/components/teacher-ui/TeacherFeedback.tsx`
- Create: `client/src/components/teacher-ui/index.ts`
- Create: `client/src/components/teacher-ui/teacherUI.test.tsx`

**Interfaces:**
- Consumes: `cn`, semantic CSS utilities, React element attributes.
- Produces:
  - `TeacherPage({ title, description?, actions?, children, width? })`
  - `TeacherSection({ title?, description?, actions?, children })`
  - `TeacherSurface({ tone?, interactive?, as?, className?, children, ...props })`
  - `TeacherButton({ variant?, size?, icon?, iconOnlyLabel?, loading?, ...buttonProps })`
  - `TeacherFeedback({ kind, title, description?, action? })`

- [ ] **Step 1: Write failing public-behavior tests**

```tsx
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { TeacherButton, TeacherFeedback, TeacherPage, TeacherSurface } from '.';

describe('teacher UI primitives', () => {
  it('exposes page structure and actions', () => {
    render(<TeacherPage title="Batches" actions={<button>Add batch</button>}><p>Body</p></TeacherPage>);
    expect(screen.getByRole('heading', { name: 'Batches', level: 1 })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Add batch' })).toBeInTheDocument();
  });

  it('requires an accessible name for icon-only actions', () => {
    render(<TeacherButton icon={<span aria-hidden>+</span>} iconOnlyLabel="Add batch" />);
    expect(screen.getByRole('button', { name: 'Add batch' })).toHaveClass('teacher-interactive');
  });

  it('marks interactive surfaces and errors semantically', () => {
    render(<><TeacherSurface interactive as="button">Open</TeacherSurface><TeacherFeedback kind="error" title="Could not load" /></>);
    expect(screen.getByRole('button', { name: 'Open' })).toHaveClass('teacher-interactive');
    expect(screen.getByRole('alert')).toHaveTextContent('Could not load');
  });
});
```

- [ ] **Step 2: Run the primitive test and confirm imports fail**

Run: `cd client && npm run test:run -- src/components/teacher-ui/teacherUI.test.tsx`

Expected: FAIL because the `teacher-ui` module does not exist.

- [ ] **Step 3: Implement the focused primitives**

Use polymorphism only for `TeacherSurface`; keep other interfaces explicit. The button's accessible-name branch must render:

```tsx
<button
  type={type ?? 'button'}
  aria-label={iconOnlyLabel}
  aria-busy={loading || undefined}
  disabled={disabled || loading}
  className={cn('teacher-interactive inline-flex min-h-11 items-center justify-center', variantClasses[variant], className)}
  {...props}
>
  {loading ? <LoaderCircle aria-hidden className="size-4 animate-spin" /> : icon}
  {!iconOnlyLabel ? children : <span className="sr-only">{iconOnlyLabel}</span>}
</button>
```

`TeacherPage` must use a single `h1`, wrap actions on narrow widths, and expose `data-teacher-page`. `TeacherFeedback` uses `role="alert"` for error and warning, `role="status"` for loading/success/empty, and no looping decoration beyond an existing loading indicator.

- [ ] **Step 4: Run focused tests and build**

Run: `cd client && npm run test:run -- src/components/teacher-ui/teacherUI.test.tsx src/utils/appleDesign.test.ts && npm run build`

Expected: all tests PASS and build succeeds.

- [ ] **Step 5: Commit the primitives**

```bash
git add client/src/components/teacher-ui
git diff --check
git commit -m "feat: add teacher web UI primitives"
```

### Task 3: Authenticated Web Shell and Navigation

**Files:**
- Modify: `client/src/components/Layout.tsx`
- Modify: `client/src/components/layoutNavigation.ts`
- Modify: `client/src/components/Layout.support.test.tsx`
- Create: `client/src/components/Layout.teacherDesign.test.tsx`

**Interfaces:**
- Consumes: Task 1 motion contract, `TeacherButton`, existing `getInstituteNavigation`, existing quick-fee fee-mode preload.
- Produces: one desktop sidebar, one safe-area-aware mobile header/menu, and one mobile bottom navigation for all authenticated teacher routes.

- [ ] **Step 1: Add failing shell/navigation tests**

Test the pure navigation matcher through an exported function:

```ts
export function isInstitutePathActive(currentPath: string, itemPath: string): boolean;
```

```ts
it('matches detail routes to their parent navigation item', () => {
  expect(isInstitutePathActive('/batches/batch-1', '/batches')).toBe(true);
  expect(isInstitutePathActive('/tests/test-1', '/tests')).toBe(true);
  expect(isInstitutePathActive('/dashboard', '/dashboard')).toBe(true);
  expect(isInstitutePathActive('/fees', '/batches')).toBe(false);
});
```

Render `Layout` in `MemoryRouter` with API calls mocked and assert that the page has `data-teacher-shell`, the mobile navigation has `aria-label="Primary teacher navigation"`, the menu control has an accessible name, and the quick-fee button remains present for full-plan teachers.

- [ ] **Step 2: Run the shell tests and verify the new contract fails**

Run: `cd client && npm run test:run -- src/components/Layout.teacherDesign.test.tsx src/components/Layout.support.test.tsx`

Expected: FAIL because `isInstitutePathActive`, shell marker, and navigation labels are absent.

- [ ] **Step 3: Refactor `Layout` without replacing current business logic**

- Keep the current `/institute/me` request and `instituteFeeMode` propagation exactly intact.
- Replace repeated mobile navigation link markup with one mapped collection derived from `getInstituteNavigation` plus plan-specific filtering.
- Use `isInstitutePathActive` for parent/detail matching.
- Set `aria-current="page"` on active links.
- Give icon-only marketplace, quiz, scan, menu, sidebar-collapse, and quick-fee controls accessible labels.
- Use `useReducedMotion()` to choose page/header transitions through `getApplePageTransition`.
- Lock body scroll while the full-screen mobile menu is open and restore it on cleanup.
- Replace the hard-coded `pb-44` with a shell variable based on `calc(6rem + env(safe-area-inset-bottom))`.
- Use `data-teacher-shell`, `data-mobile-nav`, and semantic `<header>`, `<nav>`, `<main>` landmarks.
- Preserve pull-to-refresh behavior but replace the delayed reload timer with immediate refresh after the release threshold; ensure it is disabled while a modal is open.

- [ ] **Step 4: Run shell and existing route tests**

Run: `cd client && npm run test:run -- src/components/Layout.teacherDesign.test.tsx src/components/Layout.support.test.tsx src/App.supportRoutes.test.tsx`

Expected: all tests PASS.

- [ ] **Step 5: Build and commit the shell**

Run: `cd client && npm run build`

```bash
git add client/src/components/Layout.tsx client/src/components/layoutNavigation.ts client/src/components/Layout.support.test.tsx client/src/components/Layout.teacherDesign.test.tsx
git diff --check
git commit -m "feat: unify authenticated teacher web shell"
```

### Task 4: High-Frequency Web Pages

**Files:**
- Modify: `client/src/pages/Dashboard.tsx`
- Modify: `client/src/pages/BatchList.tsx`
- Modify: `client/src/pages/TestList.tsx`
- Modify: `client/src/pages/QuizList.tsx`
- Modify: `client/src/pages/Fees.tsx`
- Modify: `client/src/features/month-coverage/MonthCoverageFeesView.tsx`
- Modify: `client/src/pages/Dashboard.monthCoverage.test.tsx`
- Create: `client/src/pages/TeacherPageStructure.test.tsx`

**Interfaces:**
- Consumes: `TeacherPage`, `TeacherSection`, `TeacherSurface`, `TeacherButton`, and `TeacherFeedback` from Task 2; `Layout` from Task 3.
- Produces: consistent high-frequency teacher overview/list pages with unchanged API and fee behavior.

- [ ] **Step 1: Write failing structural tests for representative states**

Mock page APIs and assert:

```tsx
expect(screen.getByTestId('teacher-dashboard')).toHaveAttribute('data-teacher-page');
expect(screen.getByRole('heading', { name: /dashboard/i, level: 1 })).toBeInTheDocument();
expect(screen.getByRole('button', { name: /create batch/i })).toHaveClass('teacher-interactive');
expect(screen.getByRole('status')).toHaveTextContent(/no batches|loading/i);
```

Keep the existing dashboard month-coverage assertions unchanged so the style migration proves behavioral preservation.

- [ ] **Step 2: Run representative tests and confirm missing page markers fail**

Run: `cd client && npm run test:run -- src/pages/TeacherPageStructure.test.tsx src/pages/Dashboard.monthCoverage.test.tsx`

Expected: the new structural assertions FAIL while month-coverage behavior remains green.

- [ ] **Step 3: Migrate the five pages using this explicit matrix**

| Page | Page title/action | Surfaces | Feedback |
| --- | --- | --- | --- |
| `Dashboard` | `TeacherPage` with greeting and primary quick action | stats, activity, fee summary | loading/error/empty |
| `BatchList` | “Batches” plus create action | batch cards and filters | no batches/load failure |
| `TestList` | “Tests” plus create action | test cards and summary | no tests/load failure |
| `QuizList` | “Quizzes” plus AI/manual actions | credit summary, quiz cards, active session | no quizzes/load failure |
| `Fees` | “Fees” plus mode-appropriate action | filters, totals, payment rows | loading/error/no records |

Replace page-local `animate-fade-*` wrappers with Task 1 motion variants or static rendering under reduced motion. Make card click targets the only interactive layer rather than nesting buttons inside clickable cards. Keep every existing API call, query key, mutation, navigation destination, month-coverage branch, and modal prop unchanged.

- [ ] **Step 4: Run page behavior tests**

Run: `cd client && npm run test:run -- src/pages/TeacherPageStructure.test.tsx src/pages/Dashboard.monthCoverage.test.tsx src/features/month-coverage/MonthCoverageFeesView.test.tsx src/features/month-coverage/MonthCoveragePaymentDialog.test.tsx`

Expected: all tests PASS.

- [ ] **Step 5: Build and commit high-frequency pages**

Run: `cd client && npm run build`

```bash
git add client/src/pages/Dashboard.tsx client/src/pages/BatchList.tsx client/src/pages/TestList.tsx client/src/pages/QuizList.tsx client/src/pages/Fees.tsx client/src/features/month-coverage/MonthCoverageFeesView.tsx client/src/pages/Dashboard.monthCoverage.test.tsx client/src/pages/TeacherPageStructure.test.tsx
git diff --check
git commit -m "feat: align primary teacher web pages"
```

### Task 5: Teacher Detail and Configuration Pages

**Files:**
- Modify: `client/src/pages/BatchDetails.tsx`
- Modify: `client/src/pages/TestDetails.tsx`
- Modify: `client/src/pages/ScanMarks.tsx`
- Modify: `client/src/pages/StudentProfile.tsx`
- Modify: `client/src/pages/Approvals.tsx`
- Modify: `client/src/pages/Settings.tsx`
- Modify: `client/src/pages/MarketplaceSettings.tsx`
- Modify: `client/src/pages/Billing.tsx`
- Modify: `client/src/pages/Support.tsx`
- Modify: `client/src/pages/BatchDetails.monthCoverage.test.tsx`
- Modify: `client/src/pages/Settings.registrationAlerts.test.tsx`

**Interfaces:**
- Consumes: all Tasks 1–4 contracts.
- Produces: consistent detail, scanning, approval, settings, billing, marketplace, and support experiences.

- [ ] **Step 1: Extend existing behavioral tests with accessibility assertions**

Add assertions to the existing batch/settings suites for a single `h1`, named icon actions, and semantic error/status regions. Add a lightweight Support render test asserting the routed support feature remains inside `Layout` through its existing component composition.

- [ ] **Step 2: Run the focused suites and record the failing accessibility assertions**

Run: `cd client && npm run test:run -- src/pages/BatchDetails.monthCoverage.test.tsx src/pages/Settings.registrationAlerts.test.tsx`

Expected: new heading/action semantics FAIL; existing business assertions remain green.

- [ ] **Step 3: Migrate pages with explicit responsibility boundaries**

- `BatchDetails`, `TestDetails`, and `StudentProfile`: use `TeacherPage` for title/back/actions; use sections for summaries, rosters, results, and fees; preserve drawers and mutation handlers.
- `ScanMarks`: keep camera/CV logic untouched; use a stable surface for instructions, a status region for processing, and named controls for camera/upload/close.
- `Approvals`: use a status badge and explicit approve/reject actions; destructive rejection remains visually distinct.
- `Settings` and `MarketplaceSettings`: group fields by the settings they affect, show inline validation, and keep save status adjacent to the save action.
- `Billing`: preserve checkout and subscription code; use semantic status surfaces for current plan, renewal, and payment errors.
- `Support`: ensure the existing support feature content receives the teacher page shell without changing the feature flag or ticket APIs.

Replace fixed-width action rows with wrapping grid/flex layouts at narrow widths. Replace icon-only controls without names. Do not extract data-fetching logic during this task.

- [ ] **Step 4: Run all touched page tests and build**

Run: `cd client && npm run test:run -- src/pages/BatchDetails.monthCoverage.test.tsx src/pages/Settings.registrationAlerts.test.tsx src/App.supportRoutes.test.tsx && npm run build`

Expected: tests PASS and build succeeds.

- [ ] **Step 5: Commit secondary pages**

```bash
git add client/src/pages/BatchDetails.tsx client/src/pages/TestDetails.tsx client/src/pages/ScanMarks.tsx client/src/pages/StudentProfile.tsx client/src/pages/Approvals.tsx client/src/pages/Settings.tsx client/src/pages/MarketplaceSettings.tsx client/src/pages/Billing.tsx client/src/pages/Support.tsx client/src/pages/BatchDetails.monthCoverage.test.tsx client/src/pages/Settings.registrationAlerts.test.tsx
git diff --check
git commit -m "feat: align secondary teacher web pages"
```

### Task 6: Teacher Overlays and Repeated Controls

**Files:**
- Modify: `client/src/components/QuickFeeModal.tsx`
- Modify: `client/src/components/StudentProfileDrawer.tsx`
- Modify: `client/src/components/Dropdown.tsx`
- Modify: `client/src/components/StudentSearch.tsx`
- Modify: `client/src/components/ManualQuizModal.tsx`
- Modify: `client/src/components/AITestGeneratorModal.tsx`
- Modify: `client/src/features/month-coverage/MonthCoveragePaymentDialog.tsx`
- Modify: `client/src/features/month-coverage/QuickMonthCoverageFeeForm.tsx`
- Modify: `client/src/features/month-coverage/StudentFeeStartDialog.tsx`
- Modify: `client/src/components/QuickFeeModal.monthCoverage.test.tsx`
- Modify: `client/src/components/StudentProfileDrawer.monthCoverage.test.tsx`

**Interfaces:**
- Consumes: Task 2 buttons, feedback, surface styling; existing overlay props and body `data-modal-open` contract.
- Produces: symmetric, accessible modal/drawer/sheet behavior with unchanged fee and quiz workflows.

- [ ] **Step 1: Add failing overlay accessibility assertions**

For each representative modal/drawer assert `role="dialog"`, `aria-modal="true"`, an accessible title, a named close action, Escape dismissal, initial focus, and focus restoration. Retain every existing month-coverage assertion.

- [ ] **Step 2: Run overlay suites and confirm semantics fail**

Run: `cd client && npm run test:run -- src/components/QuickFeeModal.monthCoverage.test.tsx src/components/StudentProfileDrawer.monthCoverage.test.tsx src/features/month-coverage/MonthCoveragePaymentDialog.test.tsx`

Expected: new overlay semantics FAIL while existing fee assertions remain green.

- [ ] **Step 3: Implement the overlay contract**

Use one shared pattern in each existing component without introducing a new overlay state manager:

```tsx
<motion.section
  role="dialog"
  aria-modal="true"
  aria-labelledby={titleId}
  initial={reduceMotion ? { opacity: 0 } : { opacity: 0, y: 24, scale: 0.98 }}
  animate={{ opacity: 1, y: 0, scale: 1 }}
  exit={reduceMotion ? { opacity: 0 } : { opacity: 0, y: 24, scale: 0.98 }}
  transition={getApplePageTransition(reduceMotion)}
>
```

Keep drawers exiting toward their entry edge and sheets toward the bottom. Add Escape handling, focus capture/restoration, scroll lock cleanup, opaque reduced-transparency surfaces, and 44-pixel close targets. `Dropdown` and `StudentSearch` receive visible focus, inline error support, and no arbitrary fixed-width constraint.

- [ ] **Step 4: Run overlay and fee suites**

Run: `cd client && npm run test:run -- src/components/QuickFeeModal.monthCoverage.test.tsx src/components/StudentProfileDrawer.monthCoverage.test.tsx src/features/month-coverage/MonthCoveragePaymentDialog.test.tsx src/features/month-coverage/QuickMonthCoverageFeeForm.test.tsx src/features/month-coverage/StudentFeeStartDialog.test.tsx`

Expected: all tests PASS.

- [ ] **Step 5: Build and commit overlays**

Run: `cd client && npm run build`

```bash
git add client/src/components/QuickFeeModal.tsx client/src/components/StudentProfileDrawer.tsx client/src/components/Dropdown.tsx client/src/components/StudentSearch.tsx client/src/components/ManualQuizModal.tsx client/src/components/AITestGeneratorModal.tsx client/src/features/month-coverage/MonthCoveragePaymentDialog.tsx client/src/features/month-coverage/QuickMonthCoverageFeeForm.tsx client/src/features/month-coverage/StudentFeeStartDialog.tsx client/src/components/QuickFeeModal.monthCoverage.test.tsx client/src/components/StudentProfileDrawer.monthCoverage.test.tsx
git diff --check
git commit -m "feat: unify teacher web overlays and controls"
```

### Task 7: Durable Teacher UI Guidance

**Files:**
- Create: `AGENTS.md`
- Create: `docs/guides/teacher-ui-standard.md`

**Interfaces:**
- Consumes: final token, primitive, shell, test, and platform file locations from Tasks 1–6 and the linked mobile plan.
- Produces: repository instructions future agents must read before teacher UI changes.

- [ ] **Step 1: Use the agent-writing skill before editing guidance**

Read `matt-skills-curated:writing-for-agents` completely. The skill governs the wording and structure of `AGENTS.md` and the referenced guide.

- [ ] **Step 2: Write the root pointer and repository guide**

`AGENTS.md` must stay short and contain this actionable rule:

```md
# MathLogs Agent Guidance

For any authenticated teacher UI change in `client/` or `mobile/`, read and follow `docs/guides/teacher-ui-standard.md` before editing. Preserve unrelated worktree changes and never broaden teacher styling into public, student, onboarding, or super-admin surfaces without explicit scope.
```

The guide must name the exact token, primitive, shell, and test locations; summarize brand, motion, responsive, accessibility, overlay, and verification requirements; and include checkboxes for phone, tablet/laptop, desktop, keyboard, reduced motion, text scale, and safe-area verification.

- [ ] **Step 3: Validate instruction discoverability and wording**

Run: `rg -n "teacher-ui-standard|reduced motion|44|safe area|keyboard|MathLogs" AGENTS.md docs/guides/teacher-ui-standard.md`

Expected: all required concepts appear and the referenced path resolves.

- [ ] **Step 4: Commit guidance**

```bash
git add AGENTS.md docs/guides/teacher-ui-standard.md
git diff --check
git commit -m "docs: codify teacher interface standards"
```

### Task 8: Web Regression and Visual Verification

**Files:**
- Modify only if verification discovers a scoped regression: files from Tasks 1–6
- Create: `docs/guides/teacher-ui-verification.md`

**Interfaces:**
- Consumes: completed web implementation and repository guide.
- Produces: recorded verification evidence and any minimal regression fixes.

- [ ] **Step 1: Run the complete client quality gate**

Run: `cd client && npm run test:run && npm run build && npm run lint`

Expected: all tests pass, Vite build succeeds, and lint reports no new errors. If unrelated pre-existing lint errors remain, record the exact command output and verify no touched file adds an error.

- [ ] **Step 2: Start the web app and inspect representative authenticated routes**

Run the existing project development command. Verify at widths 390, 768, 1024, and 1440 CSS pixels:

- `/dashboard`
- `/batches` and one `/batches/:id`
- `/tests` and one `/tests/:id`
- `/quizzes`
- `/fees`
- `/students/:id`
- `/settings`
- `/billing`

At each size confirm no horizontal page scroll, no clipped/wrapped-away primary action, no fixed navigation overlap, and the current route remains identifiable.

- [ ] **Step 3: Verify accessibility-sensitive states**

Using keyboard only, traverse the shell, open and dismiss mobile menu/modal/drawer, and confirm focus restoration. Emulate `prefers-reduced-motion: reduce`, `prefers-reduced-transparency: reduce`, and `prefers-contrast: more`; confirm large slides/loops disappear, glass becomes opaque, and borders/focus remain visible.

- [ ] **Step 4: Record concrete results**

Create `docs/guides/teacher-ui-verification.md` with date, tested commit, commands and exit results, viewport matrix, routes checked, accessibility settings checked, and any known pre-existing failures. Do not write subjective “looks good”; record observable pass/fail results.

- [ ] **Step 5: Commit verification evidence and scoped fixes**

```bash
git add docs/guides/teacher-ui-verification.md
git diff --check
git commit -m "test: verify teacher web design rollout"
```

Commit any verification regression fix in a separate scoped commit using its exact file path. Before committing, inspect `git diff --cached --name-only` and unstage any unrelated file.
