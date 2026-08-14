# Superadmin Marketplace Control Center

## Product goal

Give MathLogs operations one private workspace to curate trustworthy marketplace listings. Public visitors can discover coaching institutes and read approved content; institute admins can maintain their own descriptive profile; only superadmins can publish, verify, moderate, or operate Google Business Profile sync.

## Roles and boundaries

| Capability | Public visitor | Institute admin | Superadmin |
| --- | --- | --- | --- |
| Browse published profiles | Yes | Yes | Yes |
| Submit inquiry or review | Yes | Yes | Yes |
| Edit own descriptive profile | No | Yes | Yes |
| Publish/hide listing | No | Existing self-service setting | Yes |
| Award verified badge | No | No | Yes |
| Search, connect, sync, or unlink Google | No | No | Yes |
| Approve/reject marketplace reviews | No | No | Yes |
| Resolve ownership claims | No | No | Yes |

Google authorization is enforced on the API. UI visibility is not treated as a security boundary.

## Information architecture

The control center lives at `/super-admin/marketplace` and is linked from the existing superadmin dashboard.

1. **Overview** — published, verified, Google-connected, and attention-required metrics.
2. **Listings** — search/filter, profile completeness, preview, publish/hide, verify, and Google operations.
3. **Review moderation** — review context, source, rating, current state, approve/reject.
4. **Lead operations** — new inquiry volume and follow-up ownership. Detailed workflow is a follow-on phase.
5. **Ownership claims** — identity-verification queue. Detailed workflow is a follow-on phase.

## Listing lifecycle

`Directory draft → Profile complete → Published → Verified`

- A hidden listing never appears in public search or profile routes.
- Verification is a separate trust decision from visibility.
- Suspending an institute continues to remove it from the public marketplace.
- Profile completeness is an operational quality score, not a public rating.

## Review lifecycle

`Submitted → Pending → Approved | Rejected`

Only approved MathLogs reviews appear publicly. Google reviews remain source-attributed, display-only data populated by the protected sync operation.

## Google sync lifecycle

`Not connected → Search by superadmin → Confirm business → Connected → Resync or unlink`

- Search, sync, and unlink require an authenticated `SUPER_ADMIN` on the server.
- Public pages show a Google card only when a real `googlePlaceId` exists.
- No placeholder rating or review count is shown.
- Institute profile updates cannot write Google rating or review-count fields.

## Current implementation and next phases

The first implementation includes the overview, listing operations, Google controls, review queue, moderation API, and strict Google authorization.

Next phases:

- Replace claim records encoded as lead names with a dedicated `MarketplaceClaim` model and evidence/audit fields.
- Add lead assignment, notes, status transitions, and CSV export.
- Add immutable `MarketplaceAuditLog` entries for publish, verify, moderation, and Google operations.
- Add scheduled Google refresh with quota controls, retry state, and stale-data alerts.
- Add bulk listing actions and saved filters after operational usage validates the workflow.
