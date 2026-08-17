# Support Feature Production Holdback

## Purpose

Release the completed MathLogs billing, plans, quiz credits, Marketplace, Superadmin operations, communications, fee, quiz, and authentication work while keeping the new ticket-based Support feature unavailable in production for now.

The holdback is reversible and data-preserving. Support code and database records remain intact for a later launch, but neither institute users nor the Superadmin can discover or invoke Support ticket or support-session workflows while the feature is disabled.

## Decisions

- Support is disabled by default in every environment unless explicitly enabled.
- Production ships with Support disabled.
- No Support table, migration, attachment, ticket, case, message, or audit data is deleted or rewritten.
- Operational communications are not part of the holdback. Plan-start, trial, expiry, renewal, and payment reminders continue to work over configured email and WhatsApp channels.
- Institute communication preferences remain available by moving their controls from the Support page to Settings.
- Security remains server-enforced. Hiding client links is not considered sufficient.
- The release does not roll back the shared Support/communications migration because doing so would risk communication infrastructure and retained data.

## Feature-gate contract

The server owns the authoritative gate through `SUPPORT_FEATURE_ENABLED`. The value is enabled only when normalized to the exact string `true`; an absent, malformed, or false value disables Support.

The web client uses `VITE_SUPPORT_FEATURE_ENABLED` to avoid loading or presenting unreleased UI. It follows the same exact-string rule and defaults to disabled. A client/server mismatch remains safe because the server gate always wins.

Small central helpers expose these values so route files and components do not reimplement environment parsing.

## Server behavior while disabled

All institute ticket endpoints under `/api/support/*` and all Superadmin ticket, case, and support-session endpoints under `/api/super-admin/support*` return the same not-found response as an unavailable route. They do not authenticate, query Support tables, parse uploads, create sessions, mutate state, or disclose that dormant functionality exists.

The gate runs before authentication, upload parsing, reauthentication, and controllers. This prevents direct API calls from reaching hidden functionality and avoids accepting attachment payloads while disabled.

Superadmin Home excludes Support attention items. Support ticket counts do not create links into a disabled route. System summaries omit active support-session presentation while other authentication/session security remains available.

Communication preference endpoints and all communications, job, lifecycle, billing, plan, quiz, fee, Marketplace, and institute operations remain registered and unchanged.

## Client behavior while disabled

The institute application:

- Removes Support from desktop, tablet, and mobile navigation.
- Does not register or lazy-load the `/support` ticket page.
- Redirects a direct `/support` visit to `/settings`.
- Adds the existing operational email/WhatsApp preference controls to Settings, with their current API and consent semantics.

The Superadmin application:

- Removes Support from the grouped sidebar.
- Does not register or lazy-load Support queue routes.
- Redirects direct `/super-admin/support` and ticket-detail visits to `/super-admin`.
- Omits the open-Support metric and Support attention cards from Home.
- Omits the active-support-session card from System overview.
- Clears any stale browser-stored support-session context so an old local session cannot display a dormant banner.

Communications remains visible in the Serve navigation group.

## Enabled behavior for later launch

Setting both server and client flags to `true` restores the existing Support navigation, routes, ticket queues, attachments, cases, support sessions, attention items, and system indicators without a schema migration or data restoration. Tests cover both disabled-default and explicitly enabled behavior so the dormant path does not decay silently.

## Data safety and migrations

This change contains no Prisma schema change and no database migration. It does not run a backfill, `db push`, reset, delete, truncate, or data conversion. Existing Support records and attachments remain governed by their current retention and authorization logic.

The shared production migration ledger stays unchanged. The release phase may run `prisma migrate deploy`; with the current ledger it should report no pending migrations rather than alter Support data.

## Testing and acceptance criteria

Focused server tests must prove:

- Support defaults to disabled.
- Every institute and Superadmin Support endpoint is unreachable while disabled.
- Disabled requests do not execute authentication, upload, reauthentication, or controller work.
- Communication preference and communications endpoints remain reachable.
- Explicit enablement preserves existing Support route behavior.
- Home and system aggregates do not expose disabled Support actions or indicators.

Focused client tests must prove:

- Institute and Superadmin navigation omit Support by default.
- Direct Support URLs redirect safely.
- Settings loads and saves operational communication preferences.
- Home and System omit Support-only cards when disabled.
- Explicit enablement restores the existing route and navigation contract.

Release verification requires the focused tests, complete server and client test suites, Prisma validation/generation, TypeScript checks, lint for changed client files, both production builds, and `git diff --check`.

## Production rollout

1. Verify `SUPPORT_FEATURE_ENABLED` and `VITE_SUPPORT_FEATURE_ENABLED` are absent or set to `false` in production.
2. Run the complete local release verification.
3. Commit the implementation on `main` with a clean worktree.
4. Push `main` to `origin` as explicitly authorized by the user.
5. Deploy through the repository's established Heroku workflow.
6. Confirm the release migration phase reports no unexpected migration work.
7. Smoke-test login, Superadmin Home, plans, billing, quiz, fees, Marketplace, communications, and Settings communication preferences.
8. Confirm direct institute and Superadmin Support URLs are unavailable and no Support links are visible.

If a production smoke test fails, roll back application code through the hosting provider. Do not delete or alter Support data as a rollback mechanism.
