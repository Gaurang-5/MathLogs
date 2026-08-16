# Canonical Plan Cutover

This release replaces all active product-plan variants with `MARKETPLACE`, `QUIZ`, and `ENTERPRISE`. The legacy enum values remain temporarily in the database enum only so the additive migration can read and convert historical rows safely.

## Safety sequence

1. Back up the configured PostgreSQL database using the platform backup mechanism.
2. Run `cd server && npx tsx src/scripts/migrateCanonicalPlans.ts --preflight`.
3. Confirm the printed host/schema fingerprint, plan distribution, candidate count, aggregate quiz credits, and protected business-table counts.
4. Deploy the additive Prisma migration. Never reset or recreate the database.
5. Run `npx tsx src/scripts/migrateCanonicalPlans.ts --apply` once the fingerprint and counts are approved.
6. Run preflight again. Candidate count must be zero and protected counts must be unchanged.

The conversion assigns every account carrying an old plan to Enterprise. Existing aggregate `quizCredits` are preserved as lifetime credits; five included credits are added only when an active Quiz/Enterprise period requires them. Marketplace access receives a non-expiring grant timestamp. The script uses a transaction and advisory lock and can be rerun safely.

## Release smoke checks

- `GET /api/plans` returns exactly the three products and approved prices.
- An authenticated billing page shows included and lifetime credits separately.
- Superadmin Home, institute workspace, revenue filters, plan changes, trial extension, lifetime-credit adjustment, and paid-plan revoke load successfully.
- Marketplace listing, ownership claims, and lead delivery remain available after a paid plan expires.
- A controlled Quiz/Enterprise account can claim only one 14-day trial.
- No smoke test creates a live Razorpay charge or sends customer email/WhatsApp.

## Communication operations

Plan activation, trial start, approaching expiry, payment due, payment failure, payment success, and Marketplace fallback are persisted as `PlanNotification` records. Email requires SMTP configuration. WhatsApp requires each environment variable and approved Meta template listed in [WHATSAPP_BOT_SETUP.md](./WHATSAPP_BOT_SETUP.md). Inspect failed records and their linked queue jobs in Superadmin System; retry only after correcting consent, destination, or provider configuration.
