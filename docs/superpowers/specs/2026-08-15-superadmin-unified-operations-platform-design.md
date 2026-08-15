# Superadmin Unified Operations Platform

## Purpose

Reform the complete MathLogs Superadmin portal into one attention-first operations platform that matches the latest public website and Marketplace visual language. The release replaces the legacy modal-heavy `/super-admin` dashboard and the separate Marketplace shell with a single responsive application for institute operations, revenue, Marketplace trust and delivery, support, communications, system health, security, and audit.

This is one complete product release, implemented as isolated modules behind shared contracts so each area remains independently testable and maintainable. One Superadmin operates the platform for now. The design avoids team assignment, routing, and permissions that are not yet needed while preserving data-model room for them later.

## Product principles

- Home prioritizes work requiring action, not decorative metrics.
- Every operational record links back to a complete institute workspace.
- High-risk actions require a reason, fresh OTP verification, confirmation, and audit history.
- Operational modules share navigation, search, tables, filters, status language, confirmations, and error handling.
- Server authorization is the security boundary; UI visibility is never sufficient.
- Sensitive values and credentials never appear in portal responses, diagnostics, or logs.
- Existing Marketplace concurrency, conflict, delivery, and page-only safeguards remain mandatory.
- The release does not introduce multi-agent assignment, a complete finance ledger, or marketing-automation journeys.

## Information architecture

The portal lives under `/super-admin/*` and uses one persistent grouped sidebar plus a global top utility bar.

### Primary navigation

1. **Home** — attention queue, operational health, compact platform metrics, trends, and recent sensitive actions.
2. **Institutes** — directory, guided onboarding, imports, and dedicated institute workspaces.
3. **Revenue** — subscriptions, trials, renewals, payments, invoices, limits, and credits.
4. **Marketplace** — overview, listings, ownership claims, reviews, lead delivery, and Marketplace activity.
5. **Support** — institute tickets, internal cases, follow-ups, replies, and resolution history.
6. **Communications** — approved templates, targeted operational sends, delivery history, and configuration health.
7. **System** — integrations, background jobs, audit history, authentication events, and Superadmin sessions.

The sidebar displays attention badges for actionable work, not raw totals. On mobile it becomes a slide-out navigation. The top utility bar contains global institute search, command shortcuts, notification access, refresh, and Superadmin account controls.

Global search finds institutes by coaching name, teacher, phone, email, or ID and opens the relevant institute workspace. Search results include plan, status, Marketplace state, and current attention indicators so similarly named institutes are distinguishable.

## Visual system and responsive behavior

The portal uses the latest MathLogs operational language:

- Warm white and light neutral page surfaces.
- White cards and panels with restrained borders and shadows.
- Black primary actions.
- Amber for attention and pending work.
- Restrained red, green, and blue for destructive, successful, and informational states.
- Strong typographic hierarchy with compact labels and readable operational data.
- Spacious Home summaries and compact tables in queue-heavy modules.

Desktop uses a fixed grouped sidebar, sticky top bar, compact data tables, and dedicated detail pages. Tablet preserves the sidebar where space allows and collapses secondary controls. Mobile uses slide-out navigation, stacked summaries, card-adapted tables, sticky primary actions, and full-screen workflows instead of narrow desktop modals.

Accessibility requirements include complete keyboard operation, visible focus, labelled icon buttons, focus trapping and restoration, semantic tables, sufficient contrast, reduced-motion support, and screen-reader announcements for asynchronous results.

## Application architecture

The current `SuperAdminDashboard.tsx` monolith is replaced by a shared shell and route-based feature modules. Marketplace moves into the same shell instead of maintaining a nested portal shell.

Each module owns:

- Route-level pages and focused components.
- Typed API functions and response types.
- Query, filter, pagination, and mutation state.
- Pure state-transition and formatting helpers.
- Unit, component, and API-contract tests.

Shared Superadmin infrastructure owns:

- Shell, sidebar, top bar, global search, and attention badges.
- Tables, filters, pagination, empty states, status chips, skeletons, and errors.
- Drawers for quick inspection and dedicated pages for complex records.
- Confirmation, typed confirmation, reason capture, and OTP re-verification.
- Correlation-ID display and copy support.
- Unsaved-change and stale-edit conflict handling.

The institute workspace is the central cross-module boundary. Marketplace, revenue, support, communication, and activity records link to the institute rather than copying institute state into separate client stores.

## Home and attention system

Home is an operational inbox grouped by urgency.

### Critical

- Exhausted or malformed message jobs.
- Failed or inconsistent billing operations.
- Suspended-account anomalies.
- Critical unresolved support tickets.
- Integration or background-worker failures affecting customers.

### Needs attention today

- New or contacted ownership claims awaiting decisions.
- Pending MathLogs reviews.
- Failed Marketplace lead delivery.
- Trials or plans expiring within the configured warning window.
- Overdue support cases.
- Institutes stuck in onboarding.

### Upcoming

- Renewals.
- Scheduled follow-ups.
- Targeted communications awaiting execution.
- Incomplete listings or stale Google synchronization.

Each attention item includes severity, institute or entity context, age, reason, and one primary action. Completed items leave active queues but remain in activity and audit history.

A compact metric strip shows active institutes, active students, monthly recurring revenue, collected revenue, upcoming renewals, Marketplace inquiry volume, open support tickets, and communication success rate. Selecting a metric opens the corresponding pre-filtered operational screen.

Lower Home sections show recent sensitive actions, newly onboarded institutes, revenue and institute-growth trends, Marketplace health, and background job/integration status.

Home loads from one dedicated aggregate endpoint. Module attention counts use the same server definitions to prevent Home, sidebar, and queue counts from disagreeing. Data refreshes manually and at a lightweight interval; financial or destructive actions never run automatically.

## Institutes and onboarding

### Institute directory

The directory is a server-paginated table with search, sorting, and filters for active, suspended, trial, expiring, page-only, quiz-only, Marketplace-listed, and incomplete-onboarding institutes.

Rows show institute and owner, plan, status, student and batch counts, usage, Marketplace state, renewal date, open ticket count, and attention indicators. Quick actions are limited to safe navigation and inspection; complex or risky changes happen inside the institute workspace.

### Guided onboarding

Creating an institute becomes a guided workflow:

1. Owner and coaching identity.
2. Account access type and initial administrators.
3. Plan, billing cycle, price, discount, or trial.
4. Student limits, quiz credits, and feature configuration.
5. Marketplace listing choices.
6. Review, creation, and invite generation.

The flow preserves entered data across steps, validates server-side before final creation, and shows a complete before-create summary.

Bulk imports accept CSV or JSON, produce a validated preview, report row-level errors, and require confirmation before mutation. Partial successes return explicit per-row outcomes and are safe to retry.

### Institute workspace

`/super-admin/institutes/:id` provides:

- **Overview:** owner, access, plan, status, usage, health, and current issues.
- **Account:** administrators, contacts, authentication context, and structured configuration.
- **Usage:** students, batches, quizzes, storage, and activity.
- **Billing:** plan, renewal, payment, invoice, limit, and credit history.
- **Marketplace:** listing, ownership, reviews, and lead-delivery state.
- **Leads:** onboarding and Marketplace inquiries with source labels.
- **Support:** tickets, internal cases, notes, and follow-ups.
- **Activity:** immutable cross-module timeline.

Common configuration uses structured forms. Raw JSON configuration remains only in an Advanced section with schema validation, before/after preview, OTP re-verification for sensitive values, and audit history.

## Audited support sessions

A Superadmin may start a time-limited support session from an institute or support ticket. Starting requires:

- A required reason.
- Optional linked ticket or case.
- Fresh OTP re-verification.
- A server-created, short-lived support-session token.

The institute interface displays a persistent support-session banner. Requests record both the Superadmin identity and impersonated institute context. The session cannot conceal its origin and expires automatically. Ending or expiring the session creates an audit entry.

Support sessions do not bypass server permissions for operations explicitly prohibited during impersonation. Permanent deletion, Superadmin security changes, and other platform-only actions remain inaccessible from the institute context.

## Revenue and billing

Revenue combines reporting and guarded operations.

### Reporting

- Monthly recurring and collected revenue.
- Active subscriptions and trials.
- Upcoming renewals and expirations.
- Failed or overdue payments.
- Plan distribution and movement.
- Date-range trends with drill-down to contributing institutes.

### Operations

Superadmin can:

- Change a plan immediately or schedule a future change.
- Extend trials and renewal dates.
- Adjust student limits and quiz credits.
- Inspect payment and invoice history.
- Retry explicitly recoverable billing actions.
- Revoke access with effective date and reason.
- Record an approved manual payment reference.

Every operation presents before/after state. Plan revocation, large credit adjustments, and manual payment changes require OTP re-verification. Server-side idempotency and database transactions protect financial mutations. Audit records include reason, before/after values, actor, institute, and correlation ID.

Refunds, tax adjustments, accounting reconciliation, and a general ledger are excluded from this release.

## Marketplace operations

The existing approved Marketplace design remains in force and is integrated into the shared shell. It includes:

- Operational overview and attention queues.
- Full listing search, editing, preview, visibility, verification, completeness, and protected Google synchronization.
- Manual ownership claims using `NEW -> CONTACTED -> APPROVED | REJECTED`.
- Marketplace-only account provisioning without downgrading existing accounts.
- WhatsApp approval/rejection delivery with durable retry state.
- MathLogs review moderation while Google reviews remain attributed read-only data.
- Held, queued, delivered, and failed student inquiry delivery with release and retry controls.
- Marketplace audit history.

Existing page-only server authorization, concurrency protection, job/entity linkage, stale-edit conflict handling, unsaved-change guards, and Google-field protection are mandatory.

Marketplace analytics add inquiry volume, owner outcome status, claim conversion, review approval rate, listing completeness, and message delivery success. Superadmin observes inquiry delivery but does not manage owners' sales pipelines.

## Support operations

Institutes submit tickets with category, subject, description, and optional screenshots. Each ticket is linked to the institute and relevant account context.

Ticket states are `NEW`, `IN_PROGRESS`, `WAITING_ON_INSTITUTE`, `RESOLVED`, and `CLOSED`. Priorities are `LOW`, `NORMAL`, `HIGH`, and `CRITICAL`. Categories include account, billing, Marketplace, quiz, students, and technical issues.

The Superadmin queue supports search, filtering, aging, overdue indicators, institute-visible replies, internal notes, and linked activity. Resolving requires a resolution summary. Closing preserves the complete conversation and related actions.

Superadmin may also create an internal case after a call, failed onboarding, suspected abuse, or another operational event. Cases support follow-up dates and links to billing, Marketplace, system, or communication entities.

There is no assignment or team routing while only one Superadmin operates the platform. Critical and overdue records feed Home attention. Support sessions launched from a ticket carry the ticket ID into audit history.

## Communications

Communications supports approved transactional messages and immediate targeted operational sends over configured WhatsApp and email channels.

### Templates

Templates display channel, purpose, variables, approval/configuration state, and a safe preview. Only approved, correctly configured templates may be sent.

### Targeted sends

Superadmin may select saved operational audiences such as expiring trials, failed onboarding, page-only owners, or a manually selected institute group. Before sending, the portal displays:

- Exact included and excluded recipient counts.
- Exclusion reasons such as missing consent or channel eligibility.
- Rendered sample and variable mapping.
- Channel and template.
- Required operational reason.

Targeted sends require OTP re-verification and typed confirmation. They are immediate; recurring journeys, promotional automation, audience scoring, and complex campaign scheduling are excluded.

### Delivery

Delivery history shows queued, sent, delivered, failed, and retry state with institute context. Transactional messages remain event-driven. Superadmin can inspect and retry eligible failures but cannot alter content during retry. Jobs and owning entities are durably linked, idempotent, and audited.

## System health, security, and audit

### Health and integrations

System reports safe health state for API, database, Redis, background workers, email, WhatsApp, Google Places, storage, and payment integrations. Each integration exposes configured/unconfigured, last successful operation, bounded failure counts, and sanitized diagnostics. Credentials, secrets, tokens, and secret fragments are never returned or logged.

### Background jobs

Jobs are filterable by type and pending, processing, completed, or failed state. Eligible failures may be retried. Exhausted or malformed jobs require reviewing the bounded error before retry. Retry actions are conditional and concurrency-safe.

### Audit explorer

Audit records include actor, institute context, action, entity, timestamp, before/after values, required reason, support-ticket reference, support-session identity, correlation ID, and safe device/IP metadata. Portal users cannot edit or delete audit entries.

### Security

Security shows active Superadmin sessions, recent authentication events, support sessions, and OTP re-verification history. High-risk actions use a short-lived server challenge created only after OTP verification. Challenges are bound to the authenticated Superadmin and intended action class.

Permanent institute deletion becomes two-stage: deactivate and schedule deletion, then require fresh OTP, reason, impact summary, and typed institute-name confirmation for final deletion. Existing destructive server behavior must not remain available through an unguarded legacy endpoint.

## Data and API boundaries

All Superadmin endpoints verify `SUPER_ADMIN` on the server. Modules use consistent envelopes, typed errors, pagination metadata, and stable filter schemas.

Required platform-level contracts include:

- Home aggregate and attention endpoints.
- Global institute search.
- Paginated institute directory and institute workspace summaries.
- Structured institute configuration mutations.
- Revenue summaries and guarded billing operations.
- Support tickets, replies, internal notes, cases, and follow-ups.
- Re-authentication challenges and support-session lifecycle.
- Communication templates, audience previews, sends, and delivery logs.
- System health, jobs, authentication events, and audit search.

New durable entities are expected for support tickets/replies, internal cases/follow-ups, targeted communication sends/recipients, re-authentication challenges, and support sessions. Exact Prisma fields and indexes belong in the implementation plan, but every entity must carry timestamps, actor/institute linkage where applicable, status, and audit correlation.

Lists use server-side search, filters, sorting, and pagination. Detail pages fetch focused records and activity history. The shared shell loads identity, badge counts, and global search only; route modules load their own data.

## Reliability and error handling

- Expected-version timestamps protect editable records from stale overwrites.
- Structured `409` responses include current state and support reload or safe rebase.
- Unsaved forms guard navigation, close, refresh, and context switching.
- Idempotency keys protect billing, communication, and retry mutations.
- Database transactions cover multi-record state changes.
- Background jobs retain durable owning-entity references and repair interrupted links.
- Financial, access, deletion, and communication actions wait for confirmed server results.
- Reversible low-risk actions may use optimistic UI with rollback.
- Module-level failure states do not break the full shell.
- Errors show actionable messages and correlation IDs without leaking internal or sensitive details.
- Empty, loading, partial, stale, and permission-denied states have explicit UI treatments.

## Testing and acceptance

### Automated verification

- Unit tests for filters, status transitions, formatting, permissions, attention classification, and challenge expiry.
- API tests for every Superadmin role boundary and sensitive mutation.
- Database migration, idempotency, and concurrency tests.
- Component tests for tables, forms, confirmations, OTP challenges, and stale-conflict recovery.
- Responsive integration tests for desktop and mobile workflows.
- Accessibility tests for keyboard operation, focus, labels, contrast, and announcements.
- Production client and server builds.

### End-to-end journeys

- Attention item to institute resolution.
- Guided institute onboarding and invite generation.
- Plan change, trial extension, credit adjustment, and plan revocation.
- Ownership contact, approval, provisioning, and communication retry.
- Review moderation and Marketplace lead retry/release.
- Institute ticket submission, Superadmin reply, support session, resolution, and audit trace.
- Targeted audience preview, OTP confirmation, durable send, and failure inspection.
- System job retry and sanitized integration diagnostics.
- Scheduled institute deletion with final guarded confirmation.

### Completion criteria

- Legacy Superadmin capabilities have an intentional home in the new information architecture.
- The legacy monolithic dashboard is no longer the active portal route.
- Marketplace is integrated without removing its existing safeguards.
- High-risk actions cannot execute without fresh OTP verification and audit reason.
- Institute, revenue, Marketplace, support, communication, and system records link coherently.
- Desktop and mobile primary workflows pass automated and visual verification.
- No production migration is applied without explicit approval and a preflight review of affected data.

## Explicit exclusions

- Multiple Superadmin assignment, team queues, or agent performance reporting.
- Full refunds, taxation, reconciliation, or accounting ledger.
- Recurring marketing journeys, promotional automation, or campaign scoring.
- Automated Marketplace ownership verification.
- Editing or deleting audit history.
- Displaying secrets or credential fragments.

## Implementation status — August 15, 2026

The unified portal is implemented under `/super-admin` with the shared shell and the Home, Institutes, Revenue, Marketplace, Support, Communications, and System workspaces. The previous monolithic `SuperAdminDashboard` client entry point has been removed. Its global `/api/institutes`, onboarding-management, bulk-import, plan/configuration, suspension, and Marketplace-listing mutation routes are intentionally tombstoned with `404 LEGACY_SUPERADMIN_ROUTE_REMOVED`; institute-owned APIs and the public onboarding payment flow remain available.

The release also includes session-bound authentication, OTP reauthentication for high-risk operations, audited 15-minute institute support sessions, private support attachments, consent-aware targeted communication, durable job retry/reconciliation, and two-stage institute deletion with a seven-day waiting period. Database migrations were exercised only against the disposable local test database during implementation; production migration and deployment remain separate approval-gated operations.
