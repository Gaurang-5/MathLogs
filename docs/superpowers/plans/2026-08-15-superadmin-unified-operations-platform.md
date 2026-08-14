# Superadmin Unified Operations Platform Plan Set

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver the complete approved Superadmin operations reform as one release through four ordered, independently reviewable implementation plans.

**Architecture:** The work is decomposed by durable subsystem boundary while sharing one protected API router, audit/security foundation, institute workspace contract, React shell, and final release gate. All four plans land on one feature branch and are released together; decomposition is for correctness and review, not staged customer exposure.

**Tech Stack:** React 19, React Router, TypeScript, Tailwind CSS, Vitest, Node.js, Express, Prisma 5, PostgreSQL, JWT, bcryptjs, existing EmailJob and WhatsappJob workers.

## Global Constraints

- One Superadmin operates the platform.
- One complete release; no partially linked modules are exposed.
- Server-side authorization and fresh OTP challenges protect high-risk operations.
- No credential values or fragments in logs, diagnostics, or API responses.
- Existing Marketplace safeguards remain intact.
- TDD red-green cycles and focused review gates are required for every task.
- All implementation migrations/tests use the disposable local PostgreSQL database.
- Production migration, push, and deployment each require explicit user authorization.

## Ordered plans

1. [Foundation and Security](./2026-08-15-superadmin-platform-foundation-security.md)
   - Security persistence.
   - Reusable Superadmin RBAC, audit, re-authentication, and support-session creation.
   - Home/search API foundation.
   - Shared responsive shell and OTP dialog.

2. [Institutes and Revenue](./2026-08-15-superadmin-institutes-revenue.md)
   - Institute directory and 360-degree workspace APIs.
   - Guided onboarding and validated imports.
   - Revenue reporting and idempotent guarded billing operations.
   - Institute and Revenue route modules.

3. [Support, Communications, and System](./2026-08-15-superadmin-support-communications-system.md)
   - Support tickets, internal cases, replies, notes, and follow-ups.
   - Targeted communication audience preview, dispatch, job linkage, and retry.
   - Sanitized health, jobs, audit, and security views.
   - Institute support, Superadmin Support, Communications, and System route modules.

4. [Unified Integration and Rollout](./2026-08-15-superadmin-integration-rollout.md)
   - Two-stage deletion and complete support-session impersonation.
   - Marketplace integration into the shared shell.
   - Final Home and institute cross-module composition.
   - Legacy UI/API retirement.
   - End-to-end, accessibility, visual, migration, and production release gates.

## Dependency order

```text
Foundation/Security
        |
        v
Institutes/Revenue
        |
        v
Support/Communications/System
        |
        v
Unified Integration/Rollout
```

Tasks within a plan execute in document order. Do not start a dependent plan until the previous plan's acceptance checkpoint passes and its commits receive specification review and code-quality review.

## Branch and database strategy

- Start from clean local `main` in a Superpowers-created `.worktrees/` worktree.
- Create branch `codex/superadmin-unified-operations`.
- Copy only test-safe ignored environment configuration into the worktree; never move `.git` or `.venv`.
- Start or reuse a disposable local PostgreSQL instance on loopback.
- Set the worktree `server/.env` to the disposable database and test-only credentials.
- Confirm parsed database host is `127.0.0.1` or `localhost` before any schema mutation or integration test.
- Commit after every task using the message specified in the task.
- Keep unrelated user changes and the existing safety stash untouched.

## Review cadence

For each task:

1. Verify the specified RED test fails for the expected missing behavior.
2. Implement only the task contract.
3. Run the specified GREEN tests and build/lint checks.
4. Run a specification-compliance review.
5. Run a code-quality/security review.
6. Fix findings and repeat verification.
7. Commit the exact task files.

At each plan checkpoint, run its focused cross-module suite. Before integration, compare the full server suite to the recorded baseline so unrelated historical failures are not confused with regressions.

## One-release completion criteria

- `/super-admin` renders the new attention-first Home inside one shared shell.
- Institutes, Revenue, Marketplace, Support, Communications, and System are real linked modules.
- Every institute has the approved dedicated workspace tabs.
- Guided onboarding and imports replace legacy creation modals.
- High-risk billing, targeted sends, support sessions, access/security changes, and deletion require fresh OTP verification.
- Support sessions remain visible, short-lived, reasoned, and fully audited.
- Marketplace retains all current behavior and safeguards without a second portal shell.
- Diagnostics and logs contain no secrets or token fragments.
- Legacy Superadmin UI and unsafe legacy mutations are removed.
- Focused server/client suites, builds, lint, accessibility checks, responsive visual QA, and migration tests pass.
- Production data remains untouched until explicit migration/deployment approval.
