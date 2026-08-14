# Superadmin Marketplace Operations Portal

## Purpose

Expand the existing `/super-admin/marketplace` control center into the private operations workspace for MathLogs Marketplace. One superadmin will use it to maintain listing quality, verify ownership, moderate reviews, monitor admission-inquiry delivery, and manage Google Business Profile connections.

The portal is not a sales CRM. Claimed coaching owners handle their own student inquiries. The superadmin controls marketplace trust, access, delivery oversight, and exceptions.

## Product boundaries

### Included

- Marketplace overview and attention queue.
- Complete superadmin editing of marketplace listings.
- Listing visibility, verification, preview, and Google sync operations.
- Dedicated ownership-claim records and manual-verification workflow.
- Automatic marketplace-only access after claim approval.
- WhatsApp approval and rejection communication with retry support.
- Admission-inquiry routing to verified owners and protected holding for unclaimed listings.
- Lead-delivery monitoring and retry support.
- Review moderation.
- Immutable audit history for sensitive marketplace actions.

### Excluded from this phase

- Multiple superadmin assignment or team queues.
- Claim evidence or document uploads.
- A superadmin sales pipeline for admission inquiries.
- Automated ownership verification.
- Bulk marketplace actions and saved filters.
- Scheduled Google refresh and quota scheduling.

## Roles and permissions

| Capability | Public visitor | Marketplace-only owner | Full institute admin | Superadmin |
| --- | --- | --- | --- | --- |
| Browse published listings | Yes | Yes | Yes | Yes |
| Submit review, inquiry, or claim | Yes | Yes | Yes | Yes |
| Edit owned listing details | No | Own listing | Own listing | Any listing |
| View admission inquiries | No | Own listing | Own listing | Delivery oversight |
| Change inquiry sales status | No | Own listing | Own listing | No |
| Publish or hide a listing | No | Own listing using existing self-service setting | Own listing using existing self-service setting | Yes |
| Award verified status | No | No | No | Yes |
| Approve ownership claims | No | No | No | Yes |
| Moderate marketplace reviews | No | No | No | Yes |
| Manage Google sync | No | No | No | Yes |
| View marketplace audit history | No | No | No | Yes |

All superadmin APIs must verify the authenticated user's `SUPER_ADMIN` role on the server. UI visibility is not a security boundary.

## Information architecture

The portal uses a compact operations shell with a slim left navigation and a top utility bar.

### Navigation

1. **Overview** — marketplace health, pending work, delivery failures, incomplete listings, and recent activity.
2. **Listings** — search, filter, edit, preview, publish, hide, verify, and manage Google data.
3. **Ownership Claims** — manual-verification queue with status badges and decision actions.
4. **Reviews** — moderation queue with listing and reviewer context.
5. **Lead Delivery** — admission-inquiry routing, held leads, WhatsApp delivery status, and retries.

Claims, reviews, and lead-delivery failures display attention counts in navigation. The top utility bar contains global search, refresh, and a `View Marketplace` action.

## Overview

The opening screen prioritizes operations rather than promotional content. It shows:

- Published listings and total listings.
- Verified and claimed listings.
- Pending ownership claims.
- Pending reviews.
- New admission inquiries.
- Held inquiries for unclaimed listings.
- Failed teacher notifications.
- Listings with low profile completeness.
- Recent sensitive activity from the marketplace audit log.

Attention items link directly to the relevant filtered queue.

## Listings workflow

### Listings table

The table supports search by coaching, teacher, phone, city, and area. Filters include public, hidden, verified, unverified, claimed, unclaimed, Google connected, Google stale, and incomplete.

Each row displays:

- Logo, coaching name, teacher, and location.
- Visibility, verification, ownership, and institute-plan status.
- Profile-completeness score.
- Google connection and last-sync state.
- Review and admission-inquiry counts.
- Preview and overflow actions.

### Listing editor

Selecting a listing opens a right-side detail drawer without losing the current queue position. On smaller screens it becomes a full-screen editor.

The superadmin can edit:

- Coaching name and teacher name.
- Public phone, account phone, and WhatsApp phone.
- City, area, and full address.
- Tagline and profile description.
- Subjects and classes offered.
- Logo or profile image.
- Public visibility and verified status.

The public slug remains stable so published links do not break. Slug editing and redirects are not part of this phase.

Google Place ID, Google rating, Google review count, Google reviews, Google photos, and Google sync timestamps are read-only outside the protected Google sync workflow.

The editor includes `Save Changes`, `Preview Public Page`, `Google Sync`, and activity history. It warns before discarding unsaved changes. High-impact actions such as hiding a public listing, removing verification, or unlinking Google require confirmation.

## Ownership claims

### Data captured

Each claim is stored as a dedicated `MarketplaceClaim`, not as a specially formatted `LeadInquiry`. It contains:

- Institute and claimant identity.
- Submitted phone and optional email.
- Claimant's original proof note.
- Status and status timestamps.
- Required internal manual-verification note for a decision.
- Required rejection reason for rejection.
- Approval or rejection communication state.
- Decision metadata and audit references.

Only one open claim for the same institute and normalized phone may exist at a time. Repeated submissions return the existing open claim rather than creating duplicate work.

### States

`NEW → CONTACTED → APPROVED | REJECTED`

- **New:** submitted and not yet contacted.
- **Contacted:** the superadmin has manually contacted the claimant.
- **Approved:** ownership was manually verified and access was granted.
- **Rejected:** verification failed; the rejection reason is recorded and communicated.

Reopening a rejected claim is not supported. The claimant may submit a new request, which preserves the earlier decision in history.

### Approval behavior

Approval requires a manual-verification note and performs one database transaction that:

1. Marks the claim approved with decision time and superadmin identity.
2. Marks the institute claimed and records the normalized claimed phone and claim date.
3. Marks the institute verified, active, and publicly listed.
4. Links the submitted phone to the institute's account phone while leaving the public phone separately editable.
5. Creates or reuses an institute-admin record associated with the institute.
6. Applies marketplace-only access using the existing `PAGE_ONLY` plan configuration only when the institute has no linked admin before approval.
7. Reuses the current access level whenever a linked admin already exists, so approval never downgrades or restricts an existing MathLogs account.
8. Writes an audit entry for the decision and resulting access changes.

Phone login uses the existing OTP authentication flow. If the phone is associated with multiple institutes, the existing account-selection screen is used. When the normalized phone is already taken as an internal username, provisioning creates a unique internal username from the phone and institute ID; the claimant still signs in using the approved phone number.

After the transaction commits, MathLogs sends a WhatsApp approval message containing the marketplace-login link, phone/OTP instructions, and confirmation that full coaching-management features remain an optional upgrade.

### Rejection behavior

Rejection requires an internal verification note and a claimant-facing reason. MathLogs records the decision, writes an audit entry, and sends a WhatsApp message containing the reason plus support and reapplication guidance. Rejection does not modify listing ownership, verification, visibility, or account access.

### Communication failures

WhatsApp delivery is not part of the approval or rejection database transaction. A messaging failure must not reverse a saved decision. The claim shows `Message failed`, the last error, retry count, and a `Resend` action. Successful retries add audit entries and update the communication state.

## Admission-inquiry routing

Admission inquiries remain `LeadInquiry` records and are separate from ownership claims.

### Claimed listings

When a student or parent submits an inquiry for a claimed listing, MathLogs:

1. Validates and stores the inquiry.
2. Makes it available in the owner’s marketplace account.
3. Sends the owner a WhatsApp notification containing the inquiry summary and a secure link to view it.
4. Records delivery state, delivery time, retry count, and any failure.

The owner handles the sales lifecycle from their own account using `NEW`, `CONTACTED`, `ENROLLED`, or `CLOSED`. The superadmin observes delivery but does not manage these sales statuses.

### Unclaimed listings

An inquiry for an unclaimed listing is stored in a protected hold state. It appears in the superadmin Lead Delivery queue, but family contact details are not released to an unverified claimant or public listing contact. Once ownership is approved, held inquiries remain visible to the superadmin and may be explicitly released to the verified owner. Historical inquiries are not silently sent in bulk.

### Duplicate and abuse handling

Repeated inquiries for the same institute and normalized phone within 15 minutes are flagged as possible duplicates. The first valid inquiry remains intact. The API retains its existing rate limiting and input validation; duplicate detection is operational protection, not a substitute for abuse controls.

### Lead Delivery screen

The screen shows:

- Coaching and claimant status.
- Student or parent name and submitted contact information.
- Subject, class, message, and submission time.
- Destination teacher and phone.
- Held, queued, delivered, or failed status.
- Delivery time, retry count, and last error.
- `Resend` for failed claimed-listing notifications.
- `Release to Owner` for held inquiries after a claim is approved.

## Review moderation

MathLogs reviews use `PENDING`, `APPROVED`, and `REJECTED` states. Only approved MathLogs reviews appear publicly. The moderation queue shows the review, rating, reviewer context, source, institute, date, and current status.

Approve and reject actions require confirmation and create audit entries. Google reviews remain source-attributed, display-only sync data and are not moderated as MathLogs reviews.

## Proposed data model

### `MarketplaceClaim`

Core fields:

- `id`, `instituteId`
- `claimantName`, `phone`, `normalizedPhone`, `email`, `proofNote`
- `status`
- `verificationNote`, `rejectionReason`
- `contactedAt`, `decidedAt`, `createdAt`, `updatedAt`
- `communicationStatus`, `communicationSentAt`, `communicationError`, `communicationRetryCount`
- `decidedByAdminId`

Indexes cover status/date queues, institute history, and normalized-phone duplicate checks.

### `MarketplaceAuditLog`

Core fields:

- `id`, `action`, `entityType`, `entityId`
- `actorAdminId`
- `instituteId`
- `before`, `after`, and optional metadata as JSON
- `createdAt`

Audit records are append-only through application APIs. Actions include listing edits, publish/hide, verify/unverify, claim status changes, review moderation, Google connect/sync/unlink, lead release, and message retries.

### `LeadInquiry` additions

- Ownership-safe routing state: `HELD`, `QUEUED`, `DELIVERED`, or `FAILED`.
- `destinationPhone`, `notificationSentAt`, `notificationError`, and `notificationRetryCount`.
- `releasedAt` for previously held inquiries.
- Optional duplicate flag and reference to the original inquiry.

### `Institute` additions

- `ownershipStatus`: `UNCLAIMED` or `CLAIMED`.
- `claimedPhone`.
- `claimedAt`.

Existing rows are migrated deterministically: an institute with at least one linked `Admin` is backfilled as `CLAIMED`; an institute without a linked `Admin` is backfilled as `UNCLAIMED`. A pre-migration report lists both groups for review before the migration is applied. A phone number alone never establishes ownership.

## API boundaries

Routes follow existing project conventions and provide these capabilities:

- List overview metrics and recent activity.
- Search and filter marketplace listings.
- Fetch and update any listing as superadmin.
- List claims, fetch claim detail, mark contacted, approve, reject, and retry communication.
- List review moderation items and update review status.
- List lead-delivery records, retry failed notification, and release a held lead.
- Fetch listing activity history.
- Search, connect, sync, and unlink Google data.

Mutation endpoints validate state transitions server-side. Approval is idempotent: repeating an already completed request returns the existing approved result and does not create a second account or duplicate message automatically.

## UI behavior and visual system

- Desktop-first compact operations layout with a slim left rail.
- Neutral MathLogs surfaces with restrained shadows and clear separators.
- Tables remain the primary container for data-heavy queues.
- A right detail drawer preserves filters, scroll position, and selected context.
- On mobile, table rows become readable stacked rows and the drawer becomes full-screen.
- Amber denotes pending, blue contacted or in progress, green approved or delivered, and red rejected or failed.
- Loading skeletons preserve layout; empty states explain the next useful action.
- Forms use inline validation and disable repeat submissions while saving.
- Optimistic updates are limited to low-risk reversible UI state. Sensitive decisions refresh from the committed server response.
- Destructive or trust-changing actions require confirmation.
- Keyboard focus, labels, status text, and contrast meet accessibility requirements; color is never the only status indicator.

## Error handling

- Listing-edit conflicts return the latest server data and ask the operator to review before resubmitting.
- Claim state conflicts return the current claim state without applying duplicate side effects.
- Account collisions reuse the existing phone/account-selection model rather than creating ambiguous duplicate access.
- Database failures leave the claim decision unchanged and display an actionable error.
- Notification failures are recorded separately and remain retryable.
- Missing WhatsApp configuration does not falsely report delivery; the item is marked failed with an operational error.
- Google API failures preserve the last successful data and display its timestamp.
- Unauthorized and forbidden responses return generic user-safe messages and are logged securely.

## Verification strategy

### Backend tests

- Every superadmin operation rejects public and institute-admin callers.
- Listing updates accept permitted fields and reject direct Google-derived fields.
- Claim submission deduplicates an existing open claim for the same institute and phone.
- Claim transitions enforce required notes and valid current states.
- Approval atomically claims, verifies, publishes, and provisions marketplace-only access.
- Approval does not downgrade an existing full or paid institute account.
- Repeated approval is idempotent.
- Rejection preserves listing and account state.
- Communication failure preserves the claim decision and enables retry.
- Claimed inquiries route to the owner; unclaimed inquiries remain held.
- Held inquiries require explicit release after approval.
- Duplicate inquiries are flagged without losing the original.
- Audit entries are written for every sensitive mutation.

### Frontend tests

- Navigation counts and filtered queues use server state correctly.
- Listing editor validates, saves, warns on unsaved changes, and blocks manual Google data edits.
- Claim actions require the correct notes and render success or message-failure states.
- Lead Delivery supports retry and release only when allowed.
- Permission failures do not leave the UI in an optimistic success state.
- Drawer and full-screen mobile states preserve the selected record and queue filters.

### End-to-end checks

- Edit, publish, verify, and preview a listing.
- Submit, contact, approve, communicate, and phone-login through a marketplace-only claim.
- Approve a claim for an existing paid account without changing its plan.
- Reject a claim and verify claimant-facing communication.
- Recover from failed approval or rejection WhatsApp delivery.
- Deliver a claimed-listing inquiry to the owner.
- Hold and later explicitly release an unclaimed-listing inquiry.
- Moderate a review and confirm public visibility behavior.
- Verify desktop, tablet, and mobile portal layouts.

## Success criteria

- One superadmin can see and resolve all marketplace trust and delivery exceptions from one portal.
- Approved claimants can log in with the submitted phone number and manage their listing without buying the full coaching-management product.
- Existing full MathLogs accounts are never downgraded by claim approval.
- Admission inquiries reach verified owners promptly, while family contact information remains protected for unclaimed listings.
- Sensitive actions are permission-checked, idempotent where needed, and auditable.
- Notification failures are visible and recoverable without corrupting business state.
