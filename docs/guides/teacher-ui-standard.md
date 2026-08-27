# Teacher UI Standard

This is the implementation standard for every authenticated MathLogs teacher screen on web and native mobile. It translates Apple-inspired interface principles into MathLogs conventions; it does not ask for a literal copy of Apple products.

## Product character

Teacher workflows should feel calm, immediate, and precise. Preserve the MathLogs black, graphite, gray, and white identity. Prefer clear hierarchy, quiet surfaces, restrained depth, and direct feedback over decorative color or motion.

This standard applies to dashboard, batches, tests, quizzes, students, fees, approvals, settings, billing, support, their detail routes, and their authenticated dialogs, drawers, and sheets. Public, student, onboarding, login, and super-admin experiences are outside its scope.

## Required foundations

### Web

- Use the semantic variables in `client/src/index.css`; do not add a new page-local palette when an existing role fits.
- Keep authenticated routes inside `client/src/components/Layout.tsx` so navigation, page width, safe spacing, and motion remain consistent.
- Build repeated presentation with `client/src/components/teacher-ui/`: `TeacherPage`, `TeacherSection`, `TeacherSurface`, `TeacherButton`, and `TeacherFeedback`.
- Use `client/src/utils/appleDesign.ts` for route motion. Respect `prefers-reduced-motion`, reduced transparency, increased contrast, and visible keyboard focus.
- Give every icon-only control an accessible name. Keep interactive targets at least 44 by 44 CSS pixels or provide an equivalent hit area.

### Native mobile

- Use semantic roles from `mobile/constants/theme.ts`; avoid introducing screen-specific colors for established background, material, text, border, focus, or status roles.
- Use the primitives exported by `mobile/components/ui`, including `Page`, `Surface`, `PressableScale`, `Feedback`, and the existing button and skeleton components.
- Use `TEACHER_TAB_CONTENT_INSET` for scrollable teacher content reached from the tab shell so fixed navigation never covers content.
- Read accessibility preferences through `useAccessibilityPreferences`. Reduce or remove large, springy, or staggered motion when reduced motion is enabled, and provide an opaque fallback when reduced transparency is enabled.
- Give icon actions explicit `accessibilityRole` and `accessibilityLabel` values. Touch targets must be at least 44 by 44 points or use an equivalent hit area.

## Interaction and motion

- Feedback begins on press-down; do not delay state changes to wait for an animation.
- Prefer short, critically damped transitions. Avoid decorative looping motion and long list staggers in teacher work screens.
- Entry and exit should be spatially related and symmetric. Gesture-driven transitions must be interruptible.
- Haptics are for meaningful selection, success, warning, or failure—not ordinary card taps.
- Errors should be specific and near the affected control. Long operations expose progress; meaningful success exposes completion feedback.

## Layout and materials

- Use the system font and the shared type scale. Preserve text scaling and allow labels to wrap rather than clipping them.
- Keep one clear page heading and group related content into named sections.
- Use translucency for floating navigation, toolbars, or sheets when it explains hierarchy. Avoid stacking translucent foreground surfaces and always retain an opaque fallback.
- Use responsive content gutters and shared radius/elevation roles. Controls, cards, and sheets should not all have the same visual weight.
- Web layouts must work at phone, tablet/laptop, and wide desktop sizes without horizontal scrolling or navigation overlap. Native layouts must account for safe areas and the keyboard.

## Overlays

Dialogs, drawers, and sheets must have a clear title and dismissal path. Web overlays require dialog semantics, logical focus entry, Escape dismissal where appropriate, and focus restoration. Mobile overlays require named close controls, safe-area spacing, keyboard avoidance for forms, and a presentation direction related to the initiating action.

## Change checklist

Before completing a teacher-facing UI change:

- Reuse the existing semantic token and primitive before creating a new one.
- Confirm the screen remains inside the authenticated teacher shell.
- Check phone, tablet/laptop, and desktop layout where the platform applies.
- Confirm fixed navigation does not hide content and overlays remain usable with the keyboard open.
- Check keyboard focus, screen-reader names, contrast, 44-point targets, reduced motion, and reduced transparency.
- Preserve the existing workflow, permissions, API behavior, and meaningful error text.
- Run focused tests for changed behavior, the client build for web changes, and `npx tsc --noEmit` from `mobile/` for native changes.

When a new reusable pattern is genuinely required, add it to the shared token or primitive layer and update this guide in the same change.
