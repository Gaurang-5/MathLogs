# Teacher Apple-Inspired Design System

**Date:** 2026-08-28  
**Status:** Approved for implementation planning

## Purpose

Create one coherent design system for every authenticated teacher experience in the MathLogs web and Expo applications. The system will preserve the existing MathLogs black-and-gray identity while applying the supplied Apple design principles: immediate response, direct and interruptible interaction, restrained physical motion, clear hierarchy, translucent materials, platform-appropriate navigation, accessibility, and consistent wayfinding.

The desired emotional character is calm, confident, and precise. The work must improve consistency without changing teacher workflows, domain behavior, permissions, or data contracts.

## Scope

### Web teacher experience

The system applies to all authenticated institute routes and the teacher-facing overlays launched from them:

- Dashboard
- Batches and batch details
- Tests, test details, and scanning
- Quizzes and quiz workflows
- Students and student profiles
- Fees and quick-fee workflows
- Approvals
- Settings
- Marketplace listing settings
- Billing
- Institute support

The public marketplace, public registration and payment flows, student portal, onboarding, login, and super-admin application are outside this rollout unless they consume a shared primitive whose change is safe and visually compatible.

### Native mobile teacher experience

The system applies to every authenticated Expo teacher route:

- Dashboard
- Batches and batch details
- Tests, test details, and scanning
- Quizzes, quiz details, and quiz generation
- Fees and quick-fee sheet
- Settings
- Authenticated modals and secondary screens reached from those routes

Welcome and login may continue to use their distinct acquisition/authentication presentation. Shared tokens should remain compatible with them, but they are not acceptance-critical for this rollout.

## Design Approach

Use shared foundations and shells rather than independently redesigning each screen.

1. Establish semantic tokens for color, type, spacing, radius, elevation/material, motion, and interaction states on web and mobile.
2. Upgrade the authenticated teacher shells so navigation, backgrounds, safe-area behavior, headers, content width, and page transitions are consistent automatically.
3. Provide reusable teacher primitives for the patterns repeated across pages.
4. Migrate page-local styling to those foundations in bounded groups, preserving each page's behavior.
5. Record durable repository guidance so future teacher UI work uses the same rules.

This approach is preferred over a page-by-page rewrite because it reduces duplication and makes later screens inherit the system. It is preferred over a shell-only facelift because controls, dialogs, feedback, and accessibility must also feel consistent.

## Visual Foundations

### Brand and color

- Preserve MathLogs' neutral black, graphite, gray, and white identity.
- Use semantic roles such as background, surface, elevated surface, primary text, secondary text, border, accent, success, warning, and destructive instead of page-specific literal colors.
- Support light and dark appearance where the platform already exposes it.
- Use status colors for meaning, never decoration alone.
- Maintain readable contrast in default, increased-contrast, disabled, pressed, focused, and translucent states.

### Typography

- Use the platform system font stack with optical sizing where available.
- Define a compact type scale for display/page titles, section titles, body, labels, captions, and numeric/statistical values.
- Tighten tracking on large titles; keep body tracking neutral; use slightly more tracking only for very small labels where it improves legibility.
- Use responsive or scalable units so larger accessibility text does not break layouts.
- Prefer weight and spacing over unnecessary changes in color or size to communicate hierarchy.

### Space, shape, and depth

- Use a shared spacing scale and consistent content gutters.
- Keep related controls close to the content they affect.
- Use restrained corner radii with a clear hierarchy: controls, cards, sheets, and large containers should not all use the same radius.
- Use translucency for floating navigation, toolbars, and sheets where it conveys hierarchy. Avoid stacking translucent foreground surfaces.
- Larger floating surfaces receive stronger separation than small controls; ordinary content cards should remain quieter.

## Shared Web Architecture

### Teacher shell

The existing `Layout` remains the single entry point for authenticated web pages. It will own:

- Responsive desktop sidebar and mobile navigation
- Floating material treatment and scroll-edge separation
- Current-location indication and specific navigation labels
- Page title/action placement
- Responsive content gutters and maximum readable width
- Safe spacing for fixed or floating navigation
- Route-level reveal behavior that honors reduced motion
- Shared quick actions and teacher overlays

Desktop should support efficient pointer-and-keyboard workflows. Mobile web should use touch-sized controls, simplified chrome, safe-area insets, and bottom navigation without obscuring content.

### Web primitives

Introduce or consolidate a small set of semantic UI building blocks rather than a broad component framework:

- `TeacherPage` / page header and sections
- Surface/card variants
- Primary, secondary, quiet, and destructive buttons
- Icon button with tooltip/accessible name
- Input, select, search, and inline validation states
- Segmented control/tabs
- Status badge and feedback banner
- Empty, loading, and error states
- Dialog, drawer, and mobile sheet conventions

Existing page markup may continue using Tailwind classes where appropriate, but new styling must consume semantic variables and the shared interaction conventions.

## Shared Mobile Architecture

### Theme and shell

The Expo theme module is the source of truth for semantic colors, type, spacing, radius, elevation, touch targets, and spring configurations. The authenticated tab layout owns:

- Safe-area-aware floating tab material
- Clear selected state and route naming
- Immediate haptic and visual press feedback
- A central quick-fee action that remains visually and semantically distinct
- Correct content inset so the tab bar never covers page content

Native screens use platform navigation behavior rather than imitating the desktop sidebar. Sheets and detail routes must enter and exit along spatially consistent paths.

### Mobile primitives

The existing mobile UI module will be deepened into reusable primitives for:

- Pressable buttons and icon actions
- Static and interactive surfaces
- Page headers and sections
- Inputs and search fields
- Status and feedback treatments
- Loading skeletons and empty/error states
- Sheets/dialog content

Press feedback begins on touch-down. Haptics are reserved for meaningful actions and fire with the corresponding visual state.

## Motion and Interaction Rules

- Default motion is critically damped and non-bouncy, with a response around 0.3–0.4 seconds.
- Bounce is reserved for interactions that inherit momentum from a user gesture.
- Gesture-driven motion must remain interruptible and start from the current presented value.
- Entry and exit paths are symmetric and anchored to the initiating control when possible.
- Animate compositor-friendly properties on web and native-driver/worklet-friendly properties on mobile.
- Do not delay input to wait for an animation. Controls remain usable during reversible transitions.
- Use immediate pressed states for all interactive controls.
- Avoid decorative looping motion in authenticated work screens.

Reduced-motion users receive short opacity changes or static state changes instead of large slides, springs, parallax, or staggered movement.

## Responsive and Accessibility Requirements

- Web layouts must work at phone, tablet, laptop, and wide desktop widths without horizontal page scrolling, clipped actions, or navigation overlap.
- Native screens must support common phone sizes, orientation-safe layout where relevant, device safe areas, and keyboard avoidance.
- Interactive targets must be at least 44 by 44 CSS pixels/points unless the platform provides an equivalent expanded hit area.
- All icon-only actions require an accessible name.
- Keyboard users must see a strong focus indicator and be able to reach, operate, and dismiss overlays logically.
- Dialogs and sheets must manage focus, expose a clear dismissal path, and avoid trapping users accidentally.
- Errors are specific and shown near the affected control. Long operations expose status; successful meaningful actions expose completion feedback.
- Respect reduced motion, reduced transparency where supported, increased contrast, and system text scaling.

## Page Migration Strategy

Migrate in layers so regressions remain local and reviewable:

1. Tokens, shared motion, and accessibility media/platform settings.
2. Web `Layout` and mobile authenticated tab shell.
3. Shared controls, surfaces, page headers, and feedback states.
4. High-frequency pages: dashboard, batches, tests/quizzes, and fees.
5. Detail and secondary pages: batch/test/student details, scanning, settings, billing, support, approvals, and marketplace settings.
6. Modal, drawer, sheet, loading, empty, and error-state consistency pass.

Behavioral logic and API calls stay in place. Page migrations should be predominantly presentation refactors, with tests protecting existing public behavior.

## Error Handling and Resilience

- Existing API error handling remains authoritative.
- Shared feedback primitives must accept meaningful messages from current flows without replacing them with generic copy.
- A failure to load optional decorative/material behavior must not block core teacher tasks.
- Translucent surfaces must have opaque fallbacks.
- Motion and haptic APIs must degrade safely when unsupported.
- Loading states should stabilize layout and avoid indefinite animation when the request has failed.

## Future Enforcement

Add a root `AGENTS.md` that points future contributors and agents to a concise teacher UI standard stored under `docs/guides/`. The guidance will require:

- Reuse of semantic tokens and teacher primitives
- Platform-appropriate web and native layouts
- Immediate, interruptible, restrained interaction feedback
- Accessibility and reduced-motion checks
- Responsive verification for every teacher-facing change
- Preservation of the MathLogs brand rather than literal imitation of Apple products

The guide will include a review checklist and concrete token/component locations. It will not duplicate the full supplied reference; it will translate the relevant principles into repository-specific rules.

## Compatibility and Existing Work

The worktree already contains substantial unrelated and in-progress changes, including fee-coverage behavior that overlaps `Layout`, dashboard, billing, batch details, student profiles, and fee dialogs. Implementation must preserve those edits and avoid broad rewrites of overlapping files. Shared refactors should be applied incrementally against the current working tree, and unrelated generated/report files must remain untouched.

No server schema, API, authorization, fee calculation, or student lifecycle behavior is part of this design.

## Verification

Verification will be proportional to each migration layer:

- Existing web component and route tests remain green.
- Add focused tests for shared teacher shell/navigation behavior and accessibility-sensitive primitives.
- Run client TypeScript/build and targeted Vitest suites, followed by the full feasible client suite.
- Run mobile TypeScript checking and any available component tests.
- Perform representative visual checks at phone, tablet/laptop, and wide desktop sizes on web.
- Perform representative iOS/Android or Expo checks for safe areas, keyboard behavior, tab overlap, sheets, touch targets, and text scaling.
- Verify reduced-motion behavior and keyboard navigation on web.
- Confirm that public, student, onboarding, and super-admin areas have not been unintentionally restyled.

## Acceptance Criteria

1. Every authenticated teacher route on web renders inside the consistent teacher shell and uses the shared visual foundations.
2. Every authenticated teacher route in Expo uses the aligned theme, navigation shell, and shared interaction conventions.
3. Common controls, surfaces, overlays, feedback, and state treatments no longer vary arbitrarily between teacher pages.
4. Teacher workflows and data behavior remain unchanged.
5. Phone, tablet, and desktop layouts remain usable with no content hidden behind fixed navigation.
6. Reduced motion, keyboard focus, accessible names, contrast, and touch-target requirements are met for shared primitives and shells.
7. Repository guidance makes these standards discoverable and mandatory for future teacher UI work.
8. Existing in-progress fee-coverage and account work is preserved.
