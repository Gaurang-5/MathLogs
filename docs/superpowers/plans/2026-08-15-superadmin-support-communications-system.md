# Superadmin Support, Communications, and System Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add institute support tickets and internal cases, safe targeted operational communications, system health, job inspection/retry, security visibility, and unified audit exploration.

**Architecture:** Persist support and targeted-send state independently, link delivery jobs durably to recipients, and expose all operations through the protected Superadmin router. Build three route modules that share the shell, re-authentication flow, institute links, audit contract, and standard queue components.

**Tech Stack:** React 19, TypeScript, Tailwind CSS, Vitest, Express, Prisma 5, PostgreSQL, Node test runner, existing EmailJob/WhatsappJob workers.

## Global Constraints

- Complete foundation/security before this plan; institute workspace contracts must remain stable.
- One Superadmin means no assignment, agent routing, or performance scoring.
- Customer replies and internal notes are separate and never leak across visibility boundaries.
- Targeted sends are immediate operational sends using approved templates; no recurring marketing journeys.
- Targeted sends require audience preview, reason, OTP re-verification, and typed confirmation.
- Exclude recipients without channel eligibility or recorded consent.
- Diagnostics expose booleans, timestamps, bounded errors, and counts only—never secrets or secret fragments.
- Job retries are conditional, concurrency-safe, durable, and audited.
- Use only the disposable local PostgreSQL database during implementation.

---

## File map

- `server/prisma/schema.prisma` — support ticket/message/attachment/case, communication consent, targeted-send/recipient persistence, and job linkage.
- `server/prisma/migrations/20260816110000_superadmin_support_communications/migration.sql` — additive DDL.
- `server/src/services/superAdminSupportService.ts` — ticket and case state machines.
- `server/src/services/superAdminCommunicationService.ts` — audience preview, send creation, dispatch, and retry.
- `server/src/services/superAdminSystemService.ts` — sanitized integration health, job queries/retries, sessions, auth events, and audit search.
- `server/src/controllers/superAdminSupportController.ts` — support HTTP adapters.
- `server/src/middleware/supportUpload.ts` — bounded in-memory screenshot validation.
- `server/src/utils/supportAttachmentStorage.ts` — private attachment storage and authorized retrieval.
- `server/src/controllers/superAdminCommunicationController.ts` — communications HTTP adapters.
- `server/src/controllers/superAdminSystemController.ts` — system HTTP adapters.
- `client/src/features/superadmin-support/*` — support queues and ticket/case detail.
- `client/src/features/superadmin-communications/*` — templates, audience preview, send confirmation, and delivery log.
- `client/src/features/superadmin-system/*` — health, jobs, audit, and security panels.

### Task 1: Persist support and targeted communication state

**Files:**
- Modify: `server/prisma/schema.prisma`
- Create: `server/prisma/migrations/20260816110000_superadmin_support_communications/migration.sql`
- Create: `server/tests/superAdminOperationsSchema.test.ts`

**Interfaces:**
- Produces `SupportTicket`, `SupportMessage`, `SupportAttachment`, `InternalCase`, `InternalCaseNote`, `InstituteCommunicationPreference`, `TargetedCommunicationSend`, and `TargetedCommunicationRecipient`.
- Extends `EmailJob` and `WhatsappJob` with nullable `superAdminEntityType` and `superAdminEntityId`.

- [ ] **Step 1: Write the failing persistence test**

```ts
const ticket = await prisma.supportTicket.create({
  data: {
    reference: 'SUP-000001',
    instituteId,
    category: 'BILLING',
    subject: 'Renewal not reflected',
    description: 'Payment completed but renewal date is unchanged.',
    priority: 'HIGH'
  }
});
const send = await prisma.targetedCommunicationSend.create({
  data: {
    channel: 'WHATSAPP',
    templateName: 'trial_expiring',
    audienceDefinition: { plan: 'FREE', expiresWithinDays: 7 },
    reason: 'Notify expiring trial institutes',
    idempotencyKey: 'send-1',
    createdByAdminId: superAdminId
  }
});
assert.equal(ticket.status, 'NEW');
assert.equal(send.status, 'DRAFT');
const preference = await prisma.instituteCommunicationPreference.create({
  data: { instituteId, whatsappOperational: true, consentSource: 'OWNER_SETTINGS', whatsappConsentedAt: new Date() }
});
assert.equal(preference.whatsappOperational, true);
```

- [ ] **Step 2: Run RED**

Run: `cd server && DATABASE_URL='postgresql://mathlogs_test:mathlogs_test@127.0.0.1:55432/mathlogs_superadmin_test?schema=public' JWT_SECRET=test-secret NODE_ENV=test npx tsx --test --test-force-exit tests/superAdminOperationsSchema.test.ts`

Expected: missing Prisma delegates.

- [ ] **Step 3: Add support models**

```prisma
model SupportTicket {
  id          String   @id @default(uuid())
  reference   String   @unique
  instituteId String
  category    String
  subject     String
  description String   @db.Text
  priority    String   @default("NORMAL")
  status      String   @default("NEW")
  resolvedAt  DateTime?
  closedAt    DateTime?
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt
  institute   Institute @relation(fields: [instituteId], references: [id], onDelete: Cascade)
  messages    SupportMessage[]
  attachments SupportAttachment[]

  @@index([status, priority, createdAt])
  @@index([instituteId, updatedAt])
}

model SupportMessage {
  id           String   @id @default(uuid())
  ticketId     String
  authorAdminId String?
  visibility   String
  body         String   @db.Text
  createdAt    DateTime @default(now())
  ticket       SupportTicket @relation(fields: [ticketId], references: [id], onDelete: Cascade)
  authorAdmin  Admin?   @relation(fields: [authorAdminId], references: [id])

  @@index([ticketId, createdAt])
}

model SupportAttachment {
  id          String   @id @default(uuid())
  ticketId    String
  storageKey  String   @unique
  fileName    String
  contentType String
  sizeBytes   Int
  createdAt   DateTime @default(now())
  ticket      SupportTicket @relation(fields: [ticketId], references: [id], onDelete: Cascade)

  @@index([ticketId, createdAt])
}

model InternalCase {
  id           String   @id @default(uuid())
  instituteId  String
  title        String
  category     String
  priority     String   @default("NORMAL")
  status       String   @default("OPEN")
  followUpAt   DateTime?
  linkedType   String?
  linkedId     String?
  createdAt    DateTime @default(now())
  updatedAt    DateTime @updatedAt
  institute    Institute @relation(fields: [instituteId], references: [id], onDelete: Cascade)
  notes        InternalCaseNote[]

  @@index([status, followUpAt])
  @@index([instituteId, updatedAt])
}
```

Add `InternalCaseNote` with case ID, authorAdminId, text body, and createdAt. Upgrade foundation `SuperAdminSupportSession.ticketId` and `caseId` to optional relations with `onDelete: SetNull`; a session may link to at most one of them.

- [ ] **Step 4: Add communication models and durable job linkage**

```prisma
model TargetedCommunicationSend {
  id               String   @id @default(uuid())
  channel          String
  templateName     String
  audienceDefinition Json
  reason           String
  idempotencyKey   String   @unique
  status           String   @default("DRAFT")
  includedCount    Int      @default(0)
  excludedCount    Int      @default(0)
  createdByAdminId String
  dispatchedAt     DateTime?
  createdAt        DateTime @default(now())
  updatedAt        DateTime @updatedAt
  createdByAdmin   Admin    @relation(fields: [createdByAdminId], references: [id])
  recipients       TargetedCommunicationRecipient[]

  @@index([status, createdAt])
}

model TargetedCommunicationRecipient {
  id            String   @id @default(uuid())
  sendId        String
  instituteId   String?
  destination   String
  variables     Json
  status        String   @default("PENDING")
  exclusionReason String?
  jobId         String?
  error         String?
  sentAt        DateTime?
  createdAt     DateTime @default(now())
  updatedAt     DateTime @updatedAt
  send          TargetedCommunicationSend @relation(fields: [sendId], references: [id], onDelete: Cascade)
  institute     Institute? @relation(fields: [instituteId], references: [id], onDelete: SetNull)

  @@unique([sendId, instituteId])
  @@index([status, createdAt])
  @@index([instituteId, createdAt])
}

model InstituteCommunicationPreference {
  instituteId          String   @id
  whatsappOperational  Boolean  @default(false)
  whatsappConsentedAt  DateTime?
  emailOperational     Boolean  @default(false)
  emailConsentedAt     DateTime?
  consentSource        String?
  updatedAt            DateTime @updatedAt
  institute            Institute @relation(fields: [instituteId], references: [id], onDelete: Cascade)
}
```

Add the two nullable job linkage fields and compound index to both job models. Add matching support, case, send, recipient, message/note author, and communication-preference relations to `Admin` and `Institute`.

- [ ] **Step 5: Validate and run GREEN**

Run: `cd server && npx prisma format`

Run: `cd server && npx prisma validate`

Run: `cd server && npx prisma generate`

Run: `cd server && DATABASE_URL='postgresql://mathlogs_test:mathlogs_test@127.0.0.1:55432/mathlogs_superadmin_test?schema=public' npx prisma migrate deploy`

Run: `cd server && DATABASE_URL='postgresql://mathlogs_test:mathlogs_test@127.0.0.1:55432/mathlogs_superadmin_test?schema=public' JWT_SECRET=test-secret NODE_ENV=test npx tsx --test --test-force-exit tests/superAdminOperationsSchema.test.ts`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add server/prisma/schema.prisma server/prisma/migrations/20260816110000_superadmin_support_communications server/tests/superAdminOperationsSchema.test.ts
git commit -m "feat: add superadmin support and communication models"
```

### Task 2: Add support ticket and internal case APIs

**Files:**
- Create: `server/src/services/superAdminSupportService.ts`
- Create: `server/src/controllers/superAdminSupportController.ts`
- Create: `server/src/middleware/supportUpload.ts`
- Create: `server/src/utils/supportAttachmentStorage.ts`
- Modify: `server/src/services/superAdminSecurityService.ts`
- Modify: `server/src/controllers/superAdminSecurityController.ts`
- Modify: `server/src/routes/superAdminRoutes.ts`
- Modify: `server/src/routes/api.ts`
- Test: `server/tests/superAdminSupport.test.ts`

**Interfaces:**
- Produces Superadmin endpoints `/api/super-admin/support/tickets`, `/tickets/:id`, `/cases`, and `/cases/:id`.
- Produces institute endpoint `POST /api/support/tickets` plus authenticated list/detail/reply endpoints scoped to `req.user.instituteId`.
- Produces `GET /api/support/attachments/:id`; authorization is derived from the attachment's ticket, never from a client-supplied storage key.

- [ ] **Step 1: Write failing role, visibility, and transition tests**

```ts
assert.equal((await createInstituteTicket()).status, 201);
assert.equal((await listTickets(instituteToken)).body.data.every((t: any) => t.instituteId === instituteId), true);
assert.equal((await addMessage(superToken, ticketId, 'INTERNAL', 'Investigating billing logs')).status, 201);
assert.equal((await getTicket(instituteToken, ticketId)).body.data.messages.some((m: any) => m.visibility === 'INTERNAL'), false);
assert.equal((await getAttachment(otherInstituteToken, attachmentId)).status, 404);
```

Test only allowed ticket transitions, required resolution summary, follow-up dates, audit entries, linked support-session institute validation, three-file maximum, five-megabyte-per-file limit, accepted JPEG/PNG/WebP MIME types, magic-byte validation, and cross-institute attachment denial.

- [ ] **Step 2: Run RED**

Run: `cd server && DATABASE_URL='postgresql://mathlogs_test:mathlogs_test@127.0.0.1:55432/mathlogs_superadmin_test?schema=public' JWT_SECRET=test-secret NODE_ENV=test npx tsx --test --test-force-exit tests/superAdminSupport.test.ts`

Expected: 404.

- [ ] **Step 3: Implement explicit state transitions**

```ts
const ticketTransitions = {
  NEW: ['IN_PROGRESS', 'WAITING_ON_INSTITUTE', 'RESOLVED'],
  IN_PROGRESS: ['WAITING_ON_INSTITUTE', 'RESOLVED'],
  WAITING_ON_INSTITUTE: ['IN_PROGRESS', 'RESOLVED'],
  RESOLVED: ['IN_PROGRESS', 'CLOSED'],
  CLOSED: []
} as const;
```

Institute replies are always `PUBLIC`; Superadmin chooses `PUBLIC` or `INTERNAL`. Resolving requires a public resolution summary and sets `resolvedAt`. Closing requires prior `RESOLVED` and sets `closedAt`.

Create ticket and message transitions with a version predicate on `updatedAt` so concurrent replies/transitions cannot silently overwrite each other; stale writes return `409` with the latest ticket.

Extend support-session creation to accept either `ticketId` or `caseId`, never both. Load the linked record server-side, require its institute matches `instituteId`, and persist the relation plus link metadata in the start audit.

- [ ] **Step 4: Add private screenshot storage and authorized streaming**

Use `multer.memoryStorage()` with at most three screenshots and five MiB per file. Accept JPEG, PNG, and WebP only after MIME plus magic-byte validation. Store opaque keys under `support/{instituteId}/{ticketId}/...` in the configured private bucket and persist only `SupportAttachment` metadata. The download controller must load the ticket first, require either the owning institute or `SUPER_ADMIN`, then stream with `Content-Disposition: attachment`; never expose bucket keys or public URLs. If storage fails, roll back ticket metadata and delete any already-uploaded objects.

- [ ] **Step 5: Add queue filters and Home/institute projections**

Support list filters by status, priority, category, institute, overdue, and query. Update Home attention and institute workspace support counts/details without changing their response shapes.

- [ ] **Step 6: Run GREEN and commit**

Run: `cd server && DATABASE_URL='postgresql://mathlogs_test:mathlogs_test@127.0.0.1:55432/mathlogs_superadmin_test?schema=public' JWT_SECRET=test-secret NODE_ENV=test npx tsx --test --test-force-exit tests/superAdminSupport.test.ts tests/superAdminHome.test.ts tests/superAdminInstitutes.test.ts`

Run: `cd server && npm run build`

```bash
git add server/src/services/superAdminSupportService.ts server/src/controllers/superAdminSupportController.ts server/src/middleware/supportUpload.ts server/src/utils/supportAttachmentStorage.ts server/src/services/superAdminSecurityService.ts server/src/controllers/superAdminSecurityController.ts server/src/routes/superAdminRoutes.ts server/src/routes/api.ts server/tests/superAdminSupport.test.ts server/src/services/superAdminHomeService.ts server/src/services/superAdminInstituteService.ts
git commit -m "feat: add superadmin support operations"
```

### Task 3: Build Support UI and institute ticket integration

**Files:**
- Create: `client/src/features/superadmin-support/types.ts`
- Create: `client/src/features/superadmin-support/api.ts`
- Create: `client/src/features/superadmin-support/SupportQueue.tsx`
- Create: `client/src/features/superadmin-support/TicketWorkspace.tsx`
- Create: `client/src/features/superadmin-support/InternalCasePanel.tsx`
- Create: `client/src/features/superadmin-support/TicketWorkspace.test.tsx`
- Create: `client/src/pages/superadmin/SuperAdminSupport.tsx`
- Modify: `client/src/pages/superadmin/SuperAdminInstituteDetail.tsx`
- Create: `client/src/pages/Support.tsx`
- Modify: `client/src/App.tsx`

**Interfaces:**
- Consumes Task 2 endpoints.
- Produces `/super-admin/support`, `/super-admin/support/tickets/:id`, and authenticated institute `/support`.

- [ ] **Step 1: Write failing UI tests**

Test filters, aging indicators, internal/public visibility, resolution note requirement, case follow-up, institute isolation, and starting a support session with linked ticket ID.

- [ ] **Step 2: Run RED**

Run: `cd client && npm run test:run -- src/features/superadmin-support/TicketWorkspace.test.tsx`

Expected: missing modules.

- [ ] **Step 3: Implement Support routes and panels**

Use server state as the source of truth. Show messages chronologically with explicit Internal Note styling. Preserve queue filters in URL parameters. Use dedicated ticket routes on desktop and full-screen mobile detail.

```ts
export type SupportDraft = {
  category: 'ACCOUNT' | 'BILLING' | 'MARKETPLACE' | 'QUIZ' | 'STUDENTS' | 'TECHNICAL' | 'OTHER';
  subject: string;
  description: string;
  attachments: File[];
};
```

The institute form enforces the same three-image/five-MiB limits before multipart submission, shows per-file removal, and retrieves attachments only through the authorized attachment endpoint.

- [ ] **Step 4: Verify and commit**

Run: `cd client && npm run test:run`

Run: `cd client && npx eslint src/features/superadmin-support src/pages/superadmin/SuperAdminSupport.tsx src/pages/Support.tsx`

Run: `cd client && npm run build`

```bash
git add client/src/features/superadmin-support client/src/pages/superadmin/SuperAdminSupport.tsx client/src/pages/superadmin/SuperAdminInstituteDetail.tsx client/src/pages/Support.tsx client/src/App.tsx
git commit -m "feat: add institute support operations ui"
```

### Task 4: Add targeted communication preview, dispatch, and retry APIs

**Files:**
- Create: `server/src/services/superAdminCommunicationService.ts`
- Create: `server/src/controllers/superAdminCommunicationController.ts`
- Modify: `server/src/routes/api.ts`
- Modify: `server/src/routes/superAdminRoutes.ts`
- Modify: `server/src/utils/whatsapp.ts`
- Modify: `server/src/utils/whatsappWorker.ts`
- Modify: `server/src/utils/emailWorker.ts`
- Test: `server/tests/superAdminCommunications.test.ts`

**Interfaces:**
- Produces `GET /api/super-admin/communications/templates` and `/sends`.
- Produces `POST /api/super-admin/communications/audience-preview`.
- Produces protected `POST /api/super-admin/communications/sends` and `/recipients/:id/retry`.
- Produces institute-scoped `GET /api/communication-preferences` and `PATCH /api/communication-preferences`.

- [ ] **Step 1: Write failing preview and concurrency tests**

```ts
const preview = await post('/api/super-admin/communications/audience-preview', {
  channel: 'WHATSAPP', templateName: 'trial_expiring', audience: { expiresWithinDays: 7 }
});
assert.equal(preview.body.data.included.every((r: any) => r.destinationMasked), true);
assert.equal(preview.body.data.excluded.some((r: any) => r.reason === 'NO_CHANNEL_ELIGIBILITY'), true);
```

Test missing approved template, missing credentials, missing channel consent, owner opt-in/opt-out timestamps, cross-institute preference isolation, duplicate idempotency key, concurrent dispatch, one durable job per recipient, worker final-state synchronization, and retry conditionality. Seed consent through `InstituteCommunicationPreference`, never by assuming that a phone/email field implies consent.

- [ ] **Step 2: Run RED**

Run: `cd server && DATABASE_URL='postgresql://mathlogs_test:mathlogs_test@127.0.0.1:55432/mathlogs_superadmin_test?schema=public' JWT_SECRET=test-secret NODE_ENV=test npx tsx --test --test-force-exit tests/superAdminCommunications.test.ts`

Expected: missing API/models integration.

- [ ] **Step 3: Define audience and send input**

```ts
export type OperationalAudience =
  | { kind: 'EXPIRING_TRIALS'; withinDays: number }
  | { kind: 'FAILED_ONBOARDING' }
  | { kind: 'PAGE_ONLY_OWNERS' }
  | { kind: 'INSTITUTE_IDS'; instituteIds: string[] };

export type TargetedSendInput = {
  channel: 'WHATSAPP' | 'EMAIL';
  templateName: string;
  audience: OperationalAudience;
  reason: string;
  confirmationText: 'SEND';
};
```

Preview returns masked destinations and exclusion reasons. Dispatch recomputes the audience inside the transaction rather than trusting preview IDs.

Eligibility requires the matching `InstituteCommunicationPreference` flag, its channel-specific consent timestamp, and a valid destination. Return separate `NO_CONSENT`, `NO_DESTINATION`, `INVALID_DESTINATION`, and `CHANNEL_UNAVAILABLE` exclusions. The institute settings endpoint can change only its authenticated institute: enabling a channel records the server timestamp and `OWNER_SETTINGS`; disabling clears that channel's timestamp. Only transactional messages already authorized by their originating workflow may bypass targeted-send preference checks.

- [ ] **Step 4: Implement transactional dispatch and worker sync**

Create send, recipients, audit, and jobs transactionally. Store generic Superadmin entity linkage on each job. Worker completion/retry/failure updates the linked recipient and repairs missing `jobId`, matching the established Marketplace durable-link pattern.

- [ ] **Step 5: Run GREEN and commit**

Run: `cd server && DATABASE_URL='postgresql://mathlogs_test:mathlogs_test@127.0.0.1:55432/mathlogs_superadmin_test?schema=public' JWT_SECRET=test-secret NODE_ENV=test npx tsx --test --test-force-exit tests/superAdminCommunications.test.ts tests/whatsappMarketplaceStatus.test.ts tests/marketplaceNotificationService.test.ts`

Run: `cd server && npm run build`

```bash
git add server/src/services/superAdminCommunicationService.ts server/src/controllers/superAdminCommunicationController.ts server/src/routes/superAdminRoutes.ts server/src/routes/api.ts server/src/utils/whatsapp.ts server/src/utils/whatsappWorker.ts server/src/utils/emailWorker.ts server/tests/superAdminCommunications.test.ts
git commit -m "feat: add targeted superadmin communications"
```

### Task 5: Build Communications UI

**Files:**
- Create: `client/src/features/superadmin-communications/types.ts`
- Create: `client/src/features/superadmin-communications/api.ts`
- Create: `client/src/features/superadmin-communications/TemplateLibrary.tsx`
- Create: `client/src/features/superadmin-communications/TargetedSendWizard.tsx`
- Create: `client/src/features/superadmin-communications/DeliveryLog.tsx`
- Create: `client/src/features/superadmin-communications/TargetedSendWizard.test.tsx`
- Create: `client/src/features/superadmin-communications/CommunicationPreferences.test.tsx`
- Create: `client/src/pages/superadmin/SuperAdminCommunications.tsx`
- Modify: `client/src/pages/Settings.tsx`
- Modify: `client/src/App.tsx`

**Interfaces:**
- Consumes Task 4 and foundation `useSuperAdminReauth()`.
- Produces `/super-admin/communications` with Templates, Targeted Send, and Delivery tabs.

- [ ] **Step 1: Write failing tests**

Test audience preview, masked recipients, exclusions, sample variable rendering, required reason, OTP challenge, typed `SEND`, retained idempotency key on retry, delivery filters, and institute-owned consent toggles.

- [ ] **Step 2: Run RED**

Run: `cd client && npm run test:run -- src/features/superadmin-communications/TargetedSendWizard.test.tsx src/features/superadmin-communications/CommunicationPreferences.test.tsx`

Expected: missing components.

- [ ] **Step 3: Implement wizard and logs**

Do not expose full recipient destinations in preview tables. Require preview freshness; if audience inputs change, invalidate confirmation and re-run preview. A successful send navigates to its immutable delivery detail.

```ts
const changeAudience = (next: OperationalAudience) => {
  setAudience(next);
  setPreview(null);
  setConfirmationText('');
};
```

Add an Operational Communications section to institute Settings with separate WhatsApp/email opt-ins, plain-language purpose text, current consent timestamps, and an explicit save action. Superadmin screens may display consent state but cannot turn consent on for an institute.

- [ ] **Step 4: Verify and commit**

Run: `cd client && npm run test:run`

Run: `cd client && npx eslint src/features/superadmin-communications src/pages/superadmin/SuperAdminCommunications.tsx`

Run: `cd client && npm run build`

```bash
git add client/src/features/superadmin-communications client/src/pages/superadmin/SuperAdminCommunications.tsx client/src/pages/Settings.tsx client/src/App.tsx
git commit -m "feat: add superadmin communications workspace"
```

### Task 6: Add sanitized system health, jobs, audit, and security APIs

**Files:**
- Create: `server/src/services/superAdminSystemService.ts`
- Create: `server/src/controllers/superAdminSystemController.ts`
- Modify: `server/src/routes/superAdminRoutes.ts`
- Test: `server/tests/superAdminSystem.test.ts`

**Interfaces:**
- Produces `GET /api/super-admin/system/health`, `/jobs`, `/audit`, `/sessions`, and `/auth-events`.
- Produces `POST /api/super-admin/system/jobs/:kind/:id/retry` requiring `Idempotency-Key`.
- Produces `DELETE /api/super-admin/system/sessions/:id` guarded by `SYSTEM_SESSION_REVOKE`, plus `DELETE /api/super-admin/support-sessions/:id`; both require a reason and immutable audit entries.
- Consumes foundation `claimSuperAdminIdempotency()` with scope `SYSTEM_JOB_RETRY`.

- [ ] **Step 1: Write failing sanitization and retry tests**

```ts
const health = (await get('/api/super-admin/system/health')).body.data;
assert.deepEqual(health.whatsapp, {
  configured: true,
  lastSuccessAt: null,
  recentFailures: 0,
  state: 'HEALTHY'
});
assert.doesNotMatch(JSON.stringify(health), /access-token-secret|phone-id-secret/);
```

Test job pagination, bounded errors, concurrent retries yielding one queued transition, audit filters, session ownership, self-session revocation behavior, and rejection of already-revoked sessions.

- [ ] **Step 2: Run RED**

Run: `cd server && DATABASE_URL='postgresql://mathlogs_test:mathlogs_test@127.0.0.1:55432/mathlogs_superadmin_test?schema=public' JWT_SECRET=test-secret NODE_ENV=test npx tsx --test --test-force-exit tests/superAdminSystem.test.ts`

Expected: 404.

- [ ] **Step 3: Implement health and job contracts**

```ts
export type IntegrationHealth = {
  configured: boolean;
  state: 'HEALTHY' | 'DEGRADED' | 'DOWN' | 'UNCONFIGURED';
  lastSuccessAt: string | null;
  recentFailures: number;
  detail?: string;
};
```

Return named health records for API, PostgreSQL, Redis, background workers, email, WhatsApp, Google Places, private storage, and Razorpay. Use bounded DB/job evidence and sanitized environment booleans. Do not perform billable third-party calls from the health endpoint. Retry only `FAILED` jobs below explicit retry policy, reset error conditionally, and audit.

- [ ] **Step 4: Implement audit and security views**

Audit supports actor, institute, action, entity, correlation ID, support session, and date range. Sessions list `AdminSession` plus active support sessions using the foundation's `deviceLabel`, hashed IP, timestamps, and revocation state; do not return raw refresh tokens. Revocation marks the session and deletes its refresh tokens transactionally; revoking the current session returns `currentSessionRevoked: true` so the client signs out. Authentication events read from `AuthenticationEvent`, are paginated newest-first, and expose only type, success, device label, timestamps, and a shortened hash label.

- [ ] **Step 5: Run GREEN and commit**

Run: `cd server && DATABASE_URL='postgresql://mathlogs_test:mathlogs_test@127.0.0.1:55432/mathlogs_superadmin_test?schema=public' JWT_SECRET=test-secret NODE_ENV=test npx tsx --test --test-force-exit tests/superAdminSystem.test.ts tests/superAdminSecurity.test.ts tests/superAdminCommunications.test.ts`

Run: `cd server && npm run build`

```bash
git add server/src/services/superAdminSystemService.ts server/src/controllers/superAdminSystemController.ts server/src/routes/superAdminRoutes.ts server/tests/superAdminSystem.test.ts
git commit -m "feat: add superadmin system operations api"
```

### Task 7: Build System UI

**Files:**
- Create: `client/src/features/superadmin-system/types.ts`
- Create: `client/src/features/superadmin-system/api.ts`
- Create: `client/src/features/superadmin-system/HealthPanel.tsx`
- Create: `client/src/features/superadmin-system/JobsPanel.tsx`
- Create: `client/src/features/superadmin-system/AuditExplorer.tsx`
- Create: `client/src/features/superadmin-system/SecurityPanel.tsx`
- Create: `client/src/features/superadmin-system/SystemWorkspace.test.tsx`
- Create: `client/src/pages/superadmin/SuperAdminSystem.tsx`
- Modify: `client/src/App.tsx`

**Interfaces:**
- Consumes Task 6 endpoints.
- Produces `/super-admin/system` with Health, Jobs, Audit, and Security tabs.

- [ ] **Step 1: Write failing tests**

Test sanitized diagnostics, job retry confirmation, bounded error display, URL-backed audit filters, correlation-ID copying, and session end controls.

- [ ] **Step 2: Run RED**

Run: `cd client && npm run test:run -- src/features/superadmin-system/SystemWorkspace.test.tsx`

Expected: missing modules.

- [ ] **Step 3: Implement panels and verify**

```ts
export const systemTabs = [
  { id: 'health', label: 'Health' },
  { id: 'jobs', label: 'Jobs' },
  { id: 'audit', label: 'Audit' },
  { id: 'security', label: 'Security' }
] as const;
export type SystemTab = (typeof systemTabs)[number]['id'];
```

Health shows sanitized integration cards; Jobs uses a paginated queue with explicit retry confirmation; Audit keeps all filters in the URL; Security combines refresh sessions, support sessions, and authentication events with audited revoke/end controls.

Run: `cd client && npm run test:run`

Run: `cd client && npx eslint src/features/superadmin-system src/pages/superadmin/SuperAdminSystem.tsx`

Run: `cd client && npm run build`

- [ ] **Step 4: Commit**

```bash
git add client/src/features/superadmin-system client/src/pages/superadmin/SuperAdminSystem.tsx client/src/App.tsx
git commit -m "feat: add superadmin system workspace"
```

## Support, communications, and system acceptance checkpoint

Run all new focused server tests plus existing Marketplace notification and worker tests against the disposable local database. Run the full client suite and both builds. Verify support visibility boundaries, targeted-send re-authentication, durable job state, secret-free diagnostics, and mobile full-screen workflows before final integration.
