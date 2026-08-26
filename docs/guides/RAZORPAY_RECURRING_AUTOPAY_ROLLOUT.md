# Razorpay recurring AutoPay rollout

Monthly Quiz and Enterprise checkout uses Razorpay Subscriptions. Yearly plans and lifetime credit packs continue to use one-time Orders.

## Required configuration

- Keep `RAZORPAY_SUBSCRIPTIONS_ENABLED=false` while deploying or rolling back.
- Configure the live Quiz and Enterprise monthly plan IDs, public key, secret, and a dedicated webhook secret.
- In Razorpay Dashboard, enable recurring UPI, cards, and eMandate methods supported by the account.
- Configure the production webhook endpoint `/api/billing/webhooks/razorpay` for `subscription.authenticated`, `subscription.activated`, `subscription.charged`, `subscription.pending`, `subscription.halted`, `subscription.cancelled`, `subscription.completed`, `subscription.expired`, and `payment.failed`.
- Create and approve the AutoPay WhatsApp templates listed in `WHATSAPP_BOT_SETUP.md`. Missing templates fail only the affected notification; they do not roll back billing state.

## Guarded release

1. Back up the production database and record the release/version being replaced.
2. Set subscription creation to `false`.
3. Deploy the verified commit. The release phase applies the additive Prisma migration.
4. Verify `/health`, annual Order checkout, Marketplace activation, and read-only billing status.
5. Confirm webhook delivery/signature processing using Razorpay test mode and verify eligible trial, ineligible immediate debit, retry/grace, recovery, cancellation, and onboarding flows.
6. Set subscription creation to `true` only after the Dashboard configuration above is confirmed.
7. Monitor failed webhook events, provider-unknown attempts, notification failures, and the Superadmin billing history.

## Rollback

Set `RAZORPAY_SUBSCRIPTIONS_ENABLED=false` immediately. Do not cancel existing mandates or disable their webhooks/reconciliation; customers must retain cancellation and lifecycle processing until every live mandate ends. Roll back application code only to a version that understands the additive subscription tables and continues webhook handling.
