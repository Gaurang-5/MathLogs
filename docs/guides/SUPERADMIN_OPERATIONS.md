# Superadmin Operations Guide

This guide covers the single-Superadmin operating model for the unified MathLogs portal at `/super-admin`.

## Daily start

1. Open **Home** and work the attention queue before reviewing aggregate metrics.
2. Check failed Marketplace lead deliveries, pending ownership claims, open support tickets, failed communication jobs, and institutes with incomplete setup.
3. Use global search to open the institute 360 workspace instead of changing institute data through legacy endpoints.
4. Record verification notes and reasons in the operation itself; do not keep decision context only in calls or external chat.

## Ownership claims and Marketplace leads

- Claims are manually verified. Contact the claimant using the submitted phone or email and record that contact before deciding.
- Approve only after the institute identity and claimant authority are established. Approval provisions the Marketplace account for the verified phone and sends the approved communication.
- If the claimant also wants coaching-management features, use institute onboarding. If not, leave the account Marketplace-only.
- Reject with a clear reason. Resends are idempotent and should be used only when the delivery status indicates failure or the recipient confirms non-receipt.
- Student leads are delivered to the institute/teacher. Retry failed delivery; release a held lead only after confirming the listing is claimed and its owner contact is valid.

## Institute operations

- Use **Institutes** for onboarding, profile edits, configuration, subscription operations, communication preferences, support history, and Marketplace context.
- Billing and other high-risk operations require a fresh OTP challenge. Always verify the preview before confirming.
- Stale edit warnings mean another operation changed the record. Reload or deliberately rebase; never overwrite the current state blindly.

## Support workflow

- Institute users create tickets in **Support Center**. Public replies are visible to them; internal notes are never returned to institute users.
- Screenshot attachments accept at most three JPEG, PNG, or WebP files, each no larger than 5 MB. Content signatures are verified. Files are held in private object storage (or a private local fallback) and streamed only after ticket-ownership authorization.
- Start an audited support session only from a linked ticket or internal case and provide a specific reason. OTP verification is required.
- A support session lasts 15 minutes. The persistent banner identifies the institute and expiry. Sensitive authentication, billing, Superadmin, and deletion operations remain blocked.
- End the session as soon as the investigation is complete. Mutations performed during the session are written to the audit trail.

## Communications

- Use only approved operational templates. Preview the exact audience and masked recipients before sending.
- Respect institute email and WhatsApp operational-consent settings. Promotional campaigns are outside this portal.
- Dispatch requires fresh OTP verification and an idempotency key. Inspect durable job history before retrying failures.
- Never paste access tokens, credentials, payment data, or student-sensitive content into a template.

## System and security

- **System** shows sanitized integration health, durable job state, audit records, and active sessions. It never displays credential values.
- Retry only known failed jobs. Investigate repeated failures before retrying again.
- Revoke a suspicious session immediately; access tokens are session-bound, so revocation takes effect without waiting for token expiry.
- Keep Meta, email, storage, Razorpay, database, Redis, and AI credentials in the production secret manager, not source control.

## Institute deletion

Deletion is deliberately two-stage:

1. Schedule deletion with fresh OTP, the exact institute name, and a reason. The institute is deactivated and operational processing is paused.
2. During the seven-day waiting period, cancel if the request was mistaken or circumstances change. Cancellation restores the prior status and processing state.
3. After the waiting period, perform final deletion with a new OTP challenge and confirmation. The deletion record and audit evidence are retained.

Never bypass this lifecycle with direct database deletion. Take and verify a production backup before the final operation.

## Release checklist

- Run Prisma formatting, validation, client generation, and migrations against the intended environment.
- Run focused Superadmin/Marketplace tests, the full server suite, the full client suite, lint, and production builds.
- Confirm required WhatsApp template names and `SUPPORT_ATTACHMENT_BUCKET` are configured.
- Verify the support bucket is private and the application identity has only required object permissions.
- Review migration SQL and affected production data before applying any production migration.
- Smoke-test desktop, tablet, and mobile layouts, plus OTP, claim approval, lead retry, support attachment download, support-session expiry, communication dispatch, session revocation, and deletion scheduling/cancellation.
- Production migration and deployment require separate explicit approval.
