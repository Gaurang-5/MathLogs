# Teacher Apple-Inspired Design System — Mobile Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Apply the aligned MathLogs teacher design system to every authenticated Expo route with native navigation, safe areas, scalable type, immediate feedback, restrained springs, and consistent controls.

**Architecture:** `mobile/constants/theme.ts` remains the semantic source of truth and `mobile/components/ui/` becomes the public primitive boundary. The Expo Router tab shell owns authenticated navigation and insets; route files retain data and workflow logic while adopting shared page, surface, action, feedback, and sheet patterns.

**Tech Stack:** Expo 54, Expo Router 6, React Native 0.81, React 19, TypeScript 5.9, React Native Reanimated 4, Expo Blur, Expo Haptics, Lucide React Native.

**Spec:** `docs/superpowers/specs/2026-08-28-teacher-apple-design-system-design.md`

## Global Constraints

- Preserve the MathLogs neutral black, graphite, gray, and white identity.
- Do not change API requests, authentication, fee behavior, quiz behavior, routing destinations, or server contracts.
- Native screens use platform navigation and must not imitate the web sidebar.
- Default motion is critically damped and non-bouncy; bounce is reserved for touch gestures carrying momentum.
- Pressed feedback starts on touch-down and controls remain usable while animations settle.
- Meaningful haptics fire on the same interaction as visual feedback; ordinary navigation must not produce excessive haptics.
- Touch targets are at least 44 by 44 points or have an equivalent `hitSlop`.
- Respect safe areas, keyboard avoidance, system text scaling, reduced motion, and reduced transparency where the platform exposes them.
- Avoid decorative looping motion on authenticated work screens.
- Preserve all existing uncommitted work and stage only the files named by the current task.

## File Structure

- `mobile/constants/theme.ts`: semantic light/dark colors, spacing, radii, type roles, touch targets, shadows, and motion.
- `mobile/components/ui/PressableScale.tsx`: immediate accessible press feedback with optional meaningful haptics.
- `mobile/components/ui/Page.tsx`: safe-area/scroll-aware page, header, and section structure.
- `mobile/components/ui/Surface.tsx`: static and interactive material surfaces.
- `mobile/components/ui/Feedback.tsx`: loading, empty, success, warning, and error states.
- `mobile/components/ui/index.tsx`: public exports and compatibility exports for existing components.
- `mobile/app/(tabs)/_layout.tsx`: authenticated tab shell and bottom inset source.
- Authenticated route files: presentation composition only; queries, mutations, and navigation logic remain local.

---

### Task 1: Native Theme and Accessibility Contract

**Files:**
- Modify: `mobile/constants/theme.ts`
- Modify: `mobile/global.css`
- Modify: `mobile/app/_layout.tsx`

**Interfaces:**
- Consumes: React Native appearance/accessibility settings and existing Expo theme provider.
- Produces: `ThemeColors`, `TypeScale`, `TouchTarget`, `Motion`, `getThemeColors(scheme)`, and an application theme aligned with the semantic palette.

- [ ] **Step 1: Run the baseline type check**

Run: `cd mobile && npx tsc --noEmit`

Expected: PASS. If it already fails, save the exact baseline output and do not attribute those errors to this task.

- [ ] **Step 2: Replace decorative constants with semantic roles**

Export these exact contracts from `theme.ts`:

```ts
export type ThemeScheme = 'light' | 'dark';
export const TouchTarget = { minimum: 44, comfortable: 48 } as const;
export const Motion = {
  press: { damping: 30, stiffness: 420, mass: 0.8 },
  default: { damping: 30, stiffness: 350, mass: 0.8 },
  momentum: { damping: 22, stiffness: 300, mass: 0.9 },
  reducedDuration: 120,
} as const;
export function getThemeColors(scheme: ThemeScheme) {
  return Colors[scheme];
}
```

Keep status colors named `success`, `warning`, and `error`. Add semantic `background`, `surface`, `surfaceElevated`, `material`, `text`, `textSecondary`, `textMuted`, `border`, `focus`, and `overlay` to both schemes. Replace `Animation.spring` call sites later through the compatibility alias `Animation.spring = Motion.default` so the repository type-checks throughout migration.

- [ ] **Step 3: Align root navigation appearance**

In `app/_layout.tsx`, build React Navigation light/dark themes from `getThemeColors`, keep the current authentication gate unchanged, and ensure status bar style follows the active scheme. `global.css` should use the system font stack and must not force fixed text sizes.

- [ ] **Step 4: Run the type check**

Run: `cd mobile && npx tsc --noEmit`

Expected: PASS or no new errors relative to the recorded baseline.

- [ ] **Step 5: Commit native foundations**

```bash
git add mobile/constants/theme.ts mobile/global.css mobile/app/_layout.tsx
git diff --check
git commit -m "feat: define teacher mobile design foundations"
```

### Task 2: Native Teacher UI Primitives

**Files:**
- Create: `mobile/components/ui/PressableScale.tsx`
- Create: `mobile/components/ui/Page.tsx`
- Create: `mobile/components/ui/Surface.tsx`
- Create: `mobile/components/ui/Feedback.tsx`
- Modify: `mobile/components/ui/index.tsx`

**Interfaces:**
- Consumes: Task 1 theme roles, Reanimated, Expo Haptics, `AccessibilityInfo`.
- Produces:
  - `PressableScale({ haptic?, disabled?, accessibilityLabel?, hitSlop?, children, style, onPress })`
  - `TeacherPage({ title, subtitle?, actions?, scroll?, children })`
  - `TeacherSection({ title?, action?, children })`
  - `Surface({ tone?, interactive?, children, style, onPress? })`
  - `Feedback({ kind, title, description?, action? })`
  - compatibility exports `BrandButton`, `GlassCard`, `StatCard`, `OfflineBanner`, `SkeletonLoader`.

- [ ] **Step 1: Implement a reduced-motion-aware press primitive first**

The exact interaction contract is:

```tsx
const scale = useSharedValue(1);
const onPressIn = () => {
  scale.value = reduceMotion ? 1 : withSpring(0.97, Motion.press);
  if (haptic === 'commit') void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
};
const onPressOut = () => {
  scale.value = reduceMotion ? 1 : withSpring(1, Motion.press);
};
```

Use `AccessibilityInfo.isReduceMotionEnabled()` plus the `reduceMotionChanged` subscription with cleanup. Default `hitSlop` to 8 when the rendered control is smaller than `TouchTarget.minimum`. Do not haptically announce every ordinary card press; `haptic="commit"` is opt-in.

- [ ] **Step 2: Implement page, surface, and feedback primitives**

`TeacherPage` uses `SafeAreaView`, supports `ScrollView` or static content, adds bottom content inset exported as `TEACHER_TAB_CONTENT_INSET`, and allows font scaling. `Surface` uses opaque color when reduced transparency is active or BlurView is unavailable. `Feedback` sets `accessibilityRole="alert"` for error/warning and `accessibilityLiveRegion="polite"` for status changes.

- [ ] **Step 3: Rebuild compatibility components on the primitives**

Keep existing prop signatures so route migrations can be incremental. `BrandButton` delegates press behavior to `PressableScale`; `GlassCard` delegates structure to `Surface`; `SkeletonLoader` stops its opacity loop when reduced motion is enabled and shows a static placeholder.

- [ ] **Step 4: Type-check the public UI boundary**

Run: `cd mobile && npx tsc --noEmit`

Expected: PASS or no new errors relative to Task 1 baseline.

- [ ] **Step 5: Commit native primitives**

```bash
git add mobile/components/ui/PressableScale.tsx mobile/components/ui/Page.tsx mobile/components/ui/Surface.tsx mobile/components/ui/Feedback.tsx mobile/components/ui/index.tsx
git diff --check
git commit -m "feat: add teacher mobile UI primitives"
```

### Task 3: Authenticated Mobile Tab Shell

**Files:**
- Modify: `mobile/app/(tabs)/_layout.tsx`
- Modify: `mobile/app/(tabs)/index.tsx`

**Interfaces:**
- Consumes: `PressableScale`, Task 1 colors/motion, Expo Router tabs, device safe-area inset.
- Produces: `TEACHER_TAB_CONTENT_INSET`, accessible tab names, selected state, and a centered quick-fee action.

- [ ] **Step 1: Export and consume one bottom-inset contract**

Export from `_layout.tsx`:

```ts
export const TEACHER_TAB_CONTENT_INSET = Platform.select({ ios: 104, default: 88 });
```

Move it to `mobile/constants/layout.ts` instead if importing the route layout from primitives creates a cycle. In that case both `_layout.tsx` and `TeacherPage` import `TEACHER_TAB_CONTENT_INSET` from the new constants file.

- [ ] **Step 2: Replace the opaque tab bar with one material layer**

Use a single `BlurView` background with an opaque semantic fallback, `useSafeAreaInsets()` for bottom padding, a visible selected capsule/dot, and `tabBarAccessibilityLabel` for Dashboard, Batches, Tests, and Fees. Keep Quizzes and Settings hidden exactly as current routing requires. The center quick-fee action must have `accessibilityRole="button"`, `accessibilityLabel="Record fee payment"`, a minimum 56-point visible diameter, and no duplicate tab navigation event.

- [ ] **Step 3: Remove duplicated dashboard shell styling**

Wrap the authenticated dashboard content in `TeacherPage`. Preserve its data requests and navigation handlers. Replace entry animations with reduced-motion-aware equivalents and map stats/activity items to `Surface`.

- [ ] **Step 4: Type-check and launch an Expo smoke build**

Run: `cd mobile && npx tsc --noEmit`

Then run the existing Expo start command and confirm the tab router compiles without a red screen.

- [ ] **Step 5: Commit the tab shell**

```bash
git add mobile/app/'(tabs)'/_layout.tsx mobile/app/'(tabs)'/index.tsx mobile/constants/layout.ts
git diff --check
git commit -m "feat: unify authenticated teacher mobile shell"
```

If `mobile/constants/layout.ts` was unnecessary, omit it from `git add`.

### Task 4: Primary Mobile Teacher Lists and Fees

**Files:**
- Modify: `mobile/app/(tabs)/batches.tsx`
- Modify: `mobile/app/(tabs)/tests.tsx`
- Modify: `mobile/app/(tabs)/quizzes.tsx`
- Modify: `mobile/app/(tabs)/fees.tsx`
- Modify: `mobile/app/(tabs)/settings.tsx`

**Interfaces:**
- Consumes: `TeacherPage`, `TeacherSection`, `Surface`, `PressableScale`, `Feedback`.
- Produces: aligned top-level mobile teacher screens with unchanged query/mutation/navigation behavior.

- [ ] **Step 1: Record the route behavior before presentation edits**

For each file, list its API endpoints, navigation destinations, mutation callbacks, and empty/error/loading branches in the task notes. Use `rg -n "api\.|router\.|useQuery|useMutation|loading|error" mobile/app/'(tabs)'/*.tsx` and retain every discovered behavior during the diff.

- [ ] **Step 2: Migrate each route through this explicit composition matrix**

| Route | Header | Surfaces | Feedback |
| --- | --- | --- | --- |
| Batches | title + create action | batch summary/cards | loading/error/no batches |
| Tests | title + create/scan actions | stats and test cards | loading/error/no tests |
| Quizzes | title + generate action | credits, stats, quiz cards | loading/error/no quizzes |
| Fees | title + record action | totals, filters, payment rows | loading/error/no payments |
| Settings | title | grouped settings and sign-out surface | save/error status |

Remove per-card `FadeInRight.delay(index * 50)` stagger for long lists; use a short page-level reveal or static rendering. Preserve list virtualization and keys. Ensure row actions have accessible labels that include the relevant batch/test/student name.

- [ ] **Step 3: Normalize touch, text, and empty states**

Use `PressableScale` for actions, `Surface` for cards, and `Feedback` for all terminal states. Allow title/body text scaling; apply `numberOfLines` only where truncation has an accessible full label. Add bottom padding from `TEACHER_TAB_CONTENT_INSET` rather than hard-coded per-screen values.

- [ ] **Step 4: Type-check all primary routes**

Run: `cd mobile && npx tsc --noEmit`

Expected: PASS or no new errors relative to baseline.

- [ ] **Step 5: Commit primary routes**

```bash
git add mobile/app/'(tabs)'/batches.tsx mobile/app/'(tabs)'/tests.tsx mobile/app/'(tabs)'/quizzes.tsx mobile/app/'(tabs)'/fees.tsx mobile/app/'(tabs)'/settings.tsx
git diff --check
git commit -m "feat: align primary teacher mobile screens"
```

### Task 5: Mobile Detail, Scan, and Generator Routes

**Files:**
- Modify: `mobile/app/batch/[id].tsx`
- Modify: `mobile/app/test/[id].tsx`
- Modify: `mobile/app/quiz/[id].tsx`
- Modify: `mobile/app/scan.tsx`
- Modify: `mobile/app/test/scan.tsx`
- Modify: `mobile/app/quiz-generator.tsx`

**Interfaces:**
- Consumes: Tasks 1–4 primitives and layout contracts.
- Produces: spatially consistent detail routes and accessible camera/generator work states.

- [ ] **Step 1: Inventory behavior that presentation edits must preserve**

Run: `rg -n "api\.|router\.|Camera|permission|upload|submit|delete|Alert\.alert" mobile/app/batch/'[id]'.tsx mobile/app/test/'[id]'.tsx mobile/app/quiz/'[id]'.tsx mobile/app/scan.tsx mobile/app/test/scan.tsx mobile/app/quiz-generator.tsx`

Record endpoints, navigation, permission branches, destructive confirmations, and completion behavior before editing.

- [ ] **Step 2: Migrate detail routes**

Use `TeacherPage` with a named back action and `TeacherSection` for summary, roster/results, and actions. Use `Surface` for hero/stat content. Back controls get `accessibilityLabel` containing the destination, and destructive actions keep platform confirmation plus the destructive semantic color.

- [ ] **Step 3: Migrate camera and generator routes**

Keep camera lifecycle, CV/upload, and generation logic untouched. Present permission failures with `Feedback kind="error"`; processing with a live status; success with a single meaningful haptic and matching visual update. Modal scan results enter and exit along the same vertical path. Disable decorative repeated scan-line motion when reduced motion is active.

- [ ] **Step 4: Type-check and smoke-test route compilation**

Run: `cd mobile && npx tsc --noEmit`

Launch Expo and navigate to one batch detail, one test detail, scan permission state, and quiz generator. Expected: no red screen and no missing route.

- [ ] **Step 5: Commit detail routes**

```bash
git add mobile/app/batch/'[id]'.tsx mobile/app/test/'[id]'.tsx mobile/app/quiz/'[id]'.tsx mobile/app/scan.tsx mobile/app/test/scan.tsx mobile/app/quiz-generator.tsx
git diff --check
git commit -m "feat: align teacher mobile detail workflows"
```

### Task 6: Mobile Quick-Fee Sheet and Quiz Components

**Files:**
- Modify: `mobile/app/quick-fee-modal.tsx`
- Modify: `mobile/components/quiz/QuizAnalytics.tsx`
- Modify: `mobile/components/quiz/QuizLiveMonitor.tsx`
- Modify: `mobile/components/quiz/QuizSubmissionInspector.tsx`

**Interfaces:**
- Consumes: native primitives and current Expo Router modal presentation.
- Produces: accessible bottom-sheet-like quick fee flow and aligned quiz secondary panels.

- [ ] **Step 1: Preserve quick-fee and quiz state contracts**

Record all fee submission payload fields, student selection rules, success reset behavior, quiz polling intervals, close callbacks, and inspector selection state. These values must not change in the presentation diff.

- [ ] **Step 2: Apply sheet spatial and accessibility conventions**

Quick fee uses one surface, a drag indicator only if the router modal can actually be dismissed by gesture, a named close action, keyboard avoidance, safe-area bottom padding, and symmetric bottom entry/exit. Search results use 44-point rows. Submission success fires one success haptic on the same state change as the success visual.

- [ ] **Step 3: Align quiz secondary components**

Use `TeacherSection`, `Surface`, and `Feedback` for analytics, monitor, and submission states. Do not restart polling because of presentation re-renders. Icon controls receive names; charts retain readable text and do not rely on color alone.

- [ ] **Step 4: Type-check and smoke-test modal flow**

Run: `cd mobile && npx tsc --noEmit`

In Expo, open quick fee, focus search with the keyboard visible, select a student, dismiss without saving, reopen, and verify state and focus are coherent. Open one quiz analytics/monitor path and confirm polling continues.

- [ ] **Step 5: Commit secondary components**

```bash
git add mobile/app/quick-fee-modal.tsx mobile/components/quiz/QuizAnalytics.tsx mobile/components/quiz/QuizLiveMonitor.tsx mobile/components/quiz/QuizSubmissionInspector.tsx
git diff --check
git commit -m "feat: unify teacher mobile sheets and quiz panels"
```

### Task 7: Native Regression and Accessibility Verification

**Files:**
- Modify only if verification discovers a scoped regression: files from Tasks 1–6
- Modify: `docs/guides/teacher-ui-verification.md`

**Interfaces:**
- Consumes: completed mobile implementation and the web plan's guidance/verification document.
- Produces: mobile verification evidence appended to the shared record.

- [ ] **Step 1: Run the native quality gate**

Run: `cd mobile && npx tsc --noEmit`

Expected: PASS or the exact unchanged pre-existing baseline errors recorded in Task 1.

- [ ] **Step 2: Verify representative iOS and Android/Expo states**

Check Dashboard, Batches, batch detail, Tests, test detail, Quizzes, Fees, quick fee, Settings, scan permission denied, scan processing, and one error/empty state. Confirm no content is hidden by status/tab bars, keyboard focus remains visible, scrolling reaches the last item, and rotation does not trap or clip essential actions where rotation is supported.

- [ ] **Step 3: Verify accessibility settings**

Enable larger system text and reduced motion. Confirm text remains legible without clipping critical labels, decorative list stagger/scan loops stop, press feedback remains immediate without large motion, icon controls are announced meaningfully, and touch targets remain operable. Check both light and dark appearance if the app exposes both.

- [ ] **Step 4: Append objective results to the shared verification record**

Add a “Native mobile” section to `docs/guides/teacher-ui-verification.md` containing device/emulator, OS, Expo runtime, routes/states checked, text size/reduced-motion settings, safe-area/keyboard results, command result, and any unchanged pre-existing issue.

- [ ] **Step 5: Commit verification evidence and scoped fixes**

```bash
git add docs/guides/teacher-ui-verification.md
git diff --check
git commit -m "test: verify teacher mobile design rollout"
```

Commit any verification regression fix in a separate scoped commit using its exact file path. Before committing, inspect `git diff --cached --name-only` and unstage any unrelated file.
