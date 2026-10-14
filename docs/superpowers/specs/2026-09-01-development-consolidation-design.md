# MathLogs Development Consolidation Design

## Objective

Consolidate the divergent local and remote MathLogs development histories into one verified branch without losing local work, while fixing the account-provisioning failure introduced by the marketplace city invariant.

The finished branch must contain:

- the remote Muzaffarnagar marketplace and SEO rollout;
- the local student-enrollment lifecycle;
- the authenticated teacher web and mobile design rollout;
- the pending month-coverage loading and dashboard optimizations;
- the pending student contact/profile improvements;
- unlimited account creation for the designated superadmin phone;
- a provisioning path compatible with the marketplace-city database constraint.

## Current state

Local `main` is 28 commits ahead of and 10 commits behind `origin/main`. The local history contains enrollment and teacher-interface work. The remote history contains the marketplace location/SEO work and the database constraint requiring every publicly listed institute to use the canonical city `Muzaffarnagar`.

The working tree also contains several uncommitted product changes plus generated or diagnostic artifacts. Product files must be consolidated and tested. The following are preservation-only artifacts and are not product commits:

- `graphify-out/` generated reports;
- `.codex/` evidence;
- `.superpowers/brainstorm/` session material;
- `docs/fee-coverage-teacher-questionnaire.md`;
- `server/scripts/inspect_three_students.ts`.

## Integration strategy

Work occurs on `codex/consolidate-development`, created from the current local `main`. Existing product changes are first separated into logical, path-scoped commits so the remote merge cannot absorb or overwrite unrelated edits.

The product change groups are:

1. Month-coverage fee-mode preloading and dashboard efficiency, including Quick Fee behavior and its client/server regression tests.
2. Student profile contact consolidation and callable custom telephone fields, including drawer/full-profile tests.
3. Unlimited superadmin account creation across checkout, trial, invite, provisioning, and admin username generation, including policy and integration tests.
4. Small presentation fixes that are independently verified and do not alter business behavior.

Generated and diagnostic artifacts are temporarily stashed with an explicit label before merging and restored after the product tree is stable. They remain uncommitted unless separately requested.

After the local preservation commits, merge `origin/main` with an explicit merge commit. Conflict resolution must preserve both sides' intended behavior. Marketplace files use the remote canonical-location rules; enrollment and teacher-interface files retain the local lifecycle and design-system behavior. No conflict is resolved by discarding an entire side wholesale.

## Provisioning root cause and required behavior

The database has the constraint `Institute_public_marketplace_city`:

- an institute may be unlisted with any nullable city during setup;
- a publicly listed institute must have city exactly `Muzaffarnagar`.

The older local provisioning service defaults new institutes to `isPubliclyListed: true` while accepting missing or noncanonical cities. That behavior reliably produces PostgreSQL constraint error `23514`. The remote marketplace implementation changes provisioning to create institutes unlisted and canonicalizes an explicitly supplied marketplace city.

The consolidated implementation must combine that remote behavior with the local unlimited-account policy:

- every newly provisioned institute starts unlisted;
- an explicitly supplied marketplace city is validated through the shared marketplace-location domain function;
- the superadmin phone may create independent institutes repeatedly;
- ordinary phone numbers retain idempotent existing-institute behavior;
- unique internal admin usernames and trial identities prevent database uniqueness collisions;
- public listing is enabled only through a later validated marketplace flow.

A database-backed regression test must fail on the pre-fix merged behavior and pass after the consolidated fix. It must assert the persisted institute is unlisted and that repeated superadmin provisioning creates distinct institutes without violating the city constraint.

## Conflict and preservation rules

- Preserve all user changes, including files outside the product commit groups.
- Do not reset, restore, or delete broad paths.
- Use path-scoped staging and commits.
- Inspect every merge conflict against both parents and relevant tests before resolution.
- Keep the authenticated teacher standard in `AGENTS.md` and `docs/guides/teacher-ui-standard.md`.
- Do not apply teacher styling to public, student, onboarding, login, or super-admin interfaces.
- Do not push, deploy, run migrations against production, or delete worktrees as part of consolidation.
- Do not commit generated Graphify output, local evidence, or diagnostic scripts.

## Verification

Verification is performed on the fully merged tree, not inferred from earlier task reports.

Required checks:

1. `git diff --check` for whitespace and conflict-marker integrity.
2. Full client Vitest suite.
3. Client production build.
4. Full server test suite with `JWT_SECRET=test-secret NODE_ENV=test`.
5. Server TypeScript build/typecheck.
6. Mobile TypeScript typecheck.
7. Focused provisioning regression tests against the configured test database.
8. Repository audit confirming no unresolved merge state, no staged generated artifacts, and a documented list of restored preservation-only files.

If an existing unrelated test fails, record the exact failure and establish whether it is pre-existing on both parent histories. The consolidation is complete only when changes introduced or combined by this work are green; no known integration regression may be waived.

## Commit structure and handoff

Commits remain reviewable and ordered:

1. local month-coverage/Quick Fee optimization;
2. local student profile/contact improvements;
3. local unlimited-account policy;
4. merge of `origin/main`;
5. provisioning/location integration fix and regression coverage;
6. any narrowly scoped conflict follow-up required by full verification.

After verification, local `main` may be fast-forwarded to the consolidated branch because the user approved combining the work. Remote push and production deployment remain separate actions requiring explicit authorization.
