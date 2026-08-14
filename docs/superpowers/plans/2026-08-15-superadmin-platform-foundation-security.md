# Superadmin Platform Foundation and Security Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the shared Superadmin shell, attention/search contracts, durable audit, OTP re-verification, and audited support-session foundation used by every later module.

**Architecture:** Add a dedicated `/api/super-admin` router protected by reusable role and re-authentication middleware. Persist platform audit, authentication events, enriched session metadata, re-authentication challenges, and support sessions in Prisma, then replace the legacy route entry with a modular React shell whose children load by route.

**Tech Stack:** React 19, React Router, TypeScript, Tailwind CSS, Vitest, Node.js, Express, Prisma 5, PostgreSQL, Node test runner, JWT, bcryptjs.

## Global Constraints

- One Superadmin operates the platform; do not add assignment or team routing.
- Use warm white/neutral surfaces, black primary actions, amber attention, and restrained semantic colors.
- Server-side `SUPER_ADMIN` checks are mandatory for every `/api/super-admin` endpoint.
- Never return or log credentials, tokens, OTP values, or secret fragments.
- High-risk actions require a reason, fresh OTP verification, and immutable audit history.
- Run schema changes only against the disposable local PostgreSQL database during implementation.
- Do not apply production migrations without explicit user approval and affected-data preflight.
- Preserve existing Marketplace PAGE_ONLY, concurrency, delivery, conflict, and Google-field safeguards.

---

## File map

- `server/prisma/schema.prisma` — platform audit, authentication event, durable admin session, re-authentication challenge, and support-session persistence.
- `server/prisma/migrations/20260816090000_superadmin_security_foundation/migration.sql` — additive production DDL and indexes.
- `server/src/middleware/superAdmin.ts` — `requireSuperAdmin`, `requireSuperAdminReauth`, and support-session validation.
- `server/src/middleware/correlationId.ts` — stable request correlation ID and response header.
- `server/src/types/express.d.ts` — typed request correlation/support-session context.
- `server/src/services/superAdminAuditService.ts` — consistent immutable audit writes.
- `server/src/services/superAdminIdempotencyService.ts` — scoped request claiming and replay for retry-style mutations.
- `server/src/services/superAdminSecurityService.ts` — OTP challenge lifecycle and support-session token lifecycle.
- `server/src/controllers/superAdminSecurityController.ts` — HTTP adapters for challenge/session endpoints.
- `server/src/controllers/superAdminHomeController.ts` — initial attention aggregate and global institute search.
- `server/src/routes/superAdminRoutes.ts` — dedicated protected router.
- `server/src/routes/api.ts` — mount the new router and retire unguarded Superadmin mutations as later plans migrate them.
- `server/src/controllers/authController.ts` — record bounded authentication events and refresh-session metadata.
- `client/src/features/superadmin-shell/types.ts` — shell, attention, search, and security contracts.
- `client/src/features/superadmin-shell/api.ts` — typed Superadmin API boundary.
- `client/src/features/superadmin-shell/SuperAdminShell.tsx` — shared sidebar/top bar/responsive navigation.
- `client/src/features/superadmin-shell/ReauthDialog.tsx` — fresh OTP challenge flow.
- `client/src/pages/superadmin/SuperAdminHome.tsx` — attention-first route.
- `client/src/pages/superadmin/SuperAdminRoute.tsx` — nested route outlet and shared shell.
- `client/src/App.tsx` — nested `/super-admin/*` routing.

### Task 1: Persist platform audit, authentication events, re-authentication challenges, and support sessions

**Files:**
- Modify: `server/prisma/schema.prisma`
- Create: `server/prisma/migrations/20260816090000_superadmin_security_foundation/migration.sql`
- Create: `server/tests/superAdminSecuritySchema.test.ts`

**Interfaces:**
- Produces: Prisma models `SuperAdminAuditLog`, `AuthenticationEvent`, `AdminSession`, `SuperAdminIdempotencyRecord`, `SuperAdminReauthChallenge`, and `SuperAdminSupportSession`.
- Links `RefreshToken` to a durable `AdminSession`; raw refresh tokens remain excluded from every Superadmin response.
- Produces challenge states through nullable `verifiedAt` and `consumedAt`; no plaintext OTP is stored.

- [ ] **Step 1: Write the failing schema test**

```ts
test('persists the Superadmin security foundation', async () => {
  const challenge = await prisma.superAdminReauthChallenge.create({
    data: {
      adminId: superAdminId,
      actionClass: 'SUPPORT_SESSION',
      otpHash: 'bcrypt-hash',
      expiresAt: new Date(Date.now() + 300_000)
    }
  });
  const session = await prisma.superAdminSupportSession.create({
    data: {
      adminId: superAdminId,
      instituteId,
      reason: 'Investigate ticket SUP-1',
      expiresAt: new Date(Date.now() + 900_000)
    }
  });
  const audit = await prisma.superAdminAuditLog.create({
    data: {
      action: 'SUPPORT_SESSION_STARTED',
      entityType: 'Institute',
      entityId: instituteId,
      actorAdminId: superAdminId,
      instituteId,
      reason: 'Investigate ticket SUP-1',
      correlationId: 'corr-1',
      supportSessionId: session.id
    }
  });
  assert.equal(challenge.consumedAt, null);
  assert.equal(audit.supportSessionId, session.id);
  const event = await prisma.authenticationEvent.create({
    data: { adminId: superAdminId, eventType: 'LOGIN', success: true, ipHash: 'sha256:abc', deviceLabel: 'Safari on macOS' }
  });
  const adminSession = await prisma.adminSession.create({
    data: { adminId: superAdminId, expiresAt: new Date(Date.now() + 86_400_000), deviceLabel: 'Safari on macOS' }
  });
  assert.equal(event.success, true);
  assert.equal(adminSession.revokedAt, null);
  await prisma.superAdminIdempotencyRecord.create({
    data: { actorAdminId: superAdminId, scope: 'SYSTEM_JOB_RETRY', key: 'retry-1', requestHash: 'sha256:retry', expiresAt: new Date(Date.now() + 86_400_000) }
  });
  await assert.rejects(() => prisma.superAdminAuditLog.update({ where: { id: audit.id }, data: { reason: 'rewritten' } }));
  await assert.rejects(() => prisma.superAdminAuditLog.delete({ where: { id: audit.id } }));
});
```

- [ ] **Step 2: Run the schema test to verify RED**

Run: `cd server && DATABASE_URL='postgresql://mathlogs_test:mathlogs_test@127.0.0.1:55432/mathlogs_test?schema=public' JWT_SECRET=test-secret NODE_ENV=test npx tsx --test --test-force-exit tests/superAdminSecuritySchema.test.ts`

Expected: FAIL because the six new Prisma delegates/relations do not exist.

- [ ] **Step 3: Add the Prisma models and relations**

```prisma
model SuperAdminAuditLog {
  id               String   @id @default(uuid())
  action           String
  entityType       String
  entityId         String?
  actorAdminId     String
  instituteId      String?
  reason           String?
  correlationId    String
  supportSessionId String?
  before           Json?
  after            Json?
  metadata         Json?
  createdAt        DateTime @default(now())
  actorAdmin       Admin    @relation(fields: [actorAdminId], references: [id])

  @@index([createdAt])
  @@index([entityType, entityId, createdAt])
  @@index([instituteId, createdAt])
  @@index([actorAdminId, createdAt])
}

model SuperAdminReauthChallenge {
  id          String    @id @default(uuid())
  adminId     String
  actionClass String
  otpHash     String
  attempts    Int       @default(0)
  lockedAt    DateTime?
  expiresAt   DateTime
  verifiedAt  DateTime?
  consumedAt  DateTime?
  createdAt   DateTime  @default(now())
  admin       Admin     @relation(fields: [adminId], references: [id], onDelete: Cascade)

  @@index([adminId, actionClass, expiresAt])
}

model SuperAdminSupportSession {
  id          String    @id @default(uuid())
  adminId     String
  instituteId String
  ticketId    String?
  caseId      String?
  reason      String
  expiresAt   DateTime
  endedAt     DateTime?
  endReason   String?
  createdAt   DateTime  @default(now())
  admin       Admin     @relation(fields: [adminId], references: [id], onDelete: Cascade)
  institute   Institute @relation(fields: [instituteId], references: [id], onDelete: Cascade)

  @@index([adminId, expiresAt])
  @@index([instituteId, createdAt])
}

model AuthenticationEvent {
  id          String   @id @default(uuid())
  adminId     String?
  eventType   String
  success     Boolean
  ipHash      String?
  deviceLabel String?
  metadata    Json?
  createdAt   DateTime @default(now())
  admin       Admin?   @relation(fields: [adminId], references: [id], onDelete: SetNull)

  @@index([adminId, createdAt])
  @@index([eventType, success, createdAt])
}

model AdminSession {
  id          String   @id @default(uuid())
  adminId     String
  deviceLabel String?
  ipHash      String?
  lastSeenAt  DateTime @default(now())
  expiresAt   DateTime
  revokedAt   DateTime?
  createdAt   DateTime @default(now())
  admin       Admin    @relation(fields: [adminId], references: [id], onDelete: Cascade)
  refreshTokens RefreshToken[]

  @@index([adminId, revokedAt, expiresAt])
}

model SuperAdminIdempotencyRecord {
  id           String   @id @default(uuid())
  actorAdminId String
  scope        String
  key          String
  requestHash  String
  status       String   @default("PENDING")
  response     Json?
  expiresAt    DateTime
  createdAt    DateTime @default(now())
  updatedAt    DateTime @updatedAt
  actorAdmin   Admin    @relation(fields: [actorAdminId], references: [id], onDelete: Cascade)

  @@unique([actorAdminId, scope, key])
  @@index([expiresAt])
}
```

Extend `RefreshToken` with nullable `sessionId` and relation to `AdminSession` using `onDelete: Cascade`. Add matching relation arrays to `Admin` and `Institute` where relations exist. Keep audit `instituteId`, `entityId`, and `supportSessionId` as historical scalar identifiers without foreign keys so later entity deletion cannot rewrite audit history. Write additive SQL matching Prisma names and foreign-key behavior, plus a database trigger that rejects direct `UPDATE` or `DELETE` on `SuperAdminAuditLog`. Existing refresh tokens remain valid with null session IDs, but become visible in the session console after their next successful login.

- [ ] **Step 4: Format, validate, generate, and sync the disposable DB**

Run: `cd server && npx prisma format`

Run: `cd server && npx prisma validate`

Run: `cd server && npx prisma generate`

Run: `cd server && DATABASE_URL='postgresql://mathlogs_test:mathlogs_test@127.0.0.1:55432/mathlogs_test?schema=public' npx prisma migrate deploy`

Expected: schema valid; client generated; additive migration (including audit immutability trigger) applied without reset.

- [ ] **Step 5: Run the schema test to verify GREEN**

Run: `cd server && DATABASE_URL='postgresql://mathlogs_test:mathlogs_test@127.0.0.1:55432/mathlogs_test?schema=public' JWT_SECRET=test-secret NODE_ENV=test npx tsx --test --test-force-exit tests/superAdminSecuritySchema.test.ts`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add server/prisma/schema.prisma server/prisma/migrations/20260816090000_superadmin_security_foundation server/tests/superAdminSecuritySchema.test.ts
git commit -m "feat: add superadmin security persistence"
```

### Task 2: Add reusable Superadmin authorization, audit, and OTP re-verification

**Files:**
- Create: `server/src/middleware/superAdmin.ts`
- Create: `server/src/middleware/correlationId.ts`
- Create: `server/src/services/superAdminAuditService.ts`
- Create: `server/src/services/superAdminIdempotencyService.ts`
- Create: `server/src/services/superAdminSecurityService.ts`
- Create: `server/src/controllers/superAdminSecurityController.ts`
- Create: `server/src/routes/superAdminRoutes.ts`
- Modify: `server/src/types/express.d.ts`
- Modify: `server/src/controllers/authController.ts`
- Modify: `server/src/routes/api.ts`
- Test: `server/tests/superAdminSecurity.test.ts`

**Interfaces:**
- Produces: `requireSuperAdmin(req, res, next): void`.
- Produces: `requireSuperAdminReauth(actionClass: SuperAdminActionClass): RequestHandler`.
- Produces: `writeSuperAdminAudit(tx, input): Promise<SuperAdminAuditLog>`.
- Produces: `recordAuthenticationEvent(input): Promise<void>`; event logging is best-effort and never blocks authentication.
- Produces: `claimSuperAdminIdempotency({ actorAdminId, scope, key, requestHash })`; same key/hash replays the stored result, while a different hash returns 409.
- Produces endpoints `POST /api/super-admin/security/reauth/send`, `POST /verify`, `POST /support-sessions`, and `DELETE /support-sessions/:id`.
- Consumes header `X-Superadmin-Challenge` on protected mutations.

- [ ] **Step 1: Write failing API tests**

```ts
test('Superadmin routes reject institute admins', async () => {
  const response = await fetch(`${baseUrl}/api/super-admin/security/reauth/send`, {
    method: 'POST',
    headers: auth(instituteToken),
    body: JSON.stringify({ actionClass: 'SUPPORT_SESSION' })
  });
  assert.equal(response.status, 403);
});

test('verified challenge is consumed exactly once', async () => {
  const challenge = await createVerifiedChallenge(superAdminId, 'SUPPORT_SESSION');
  const first = await startSupportSession(challenge.id);
  const second = await startSupportSession(challenge.id);
  assert.equal(first.status, 201);
  assert.equal(second.status, 403);
});

test('locks a challenge after five invalid OTP attempts', async () => {
  const challenge = await createChallenge(superAdminId, 'SUPPORT_SESSION');
  for (let attempt = 0; attempt < 5; attempt += 1) await verifyChallenge(challenge.id, '000000');
  assert.equal((await verifyChallenge(challenge.id, validOtp)).status, 429);
});

test('correlates an audited mutation without exposing secrets', async () => {
  const response = await startSupportSessionWithHeader('corr-test-1');
  assert.equal(response.headers.get('x-correlation-id'), 'corr-test-1');
  const audit = await prisma.superAdminAuditLog.findFirstOrThrow({ where: { correlationId: 'corr-test-1' } });
  assert.doesNotMatch(JSON.stringify(audit), /otp|refreshToken|accessToken/i);
});
```

- [ ] **Step 2: Run tests to verify RED**

Run: `cd server && DATABASE_URL='postgresql://mathlogs_test:mathlogs_test@127.0.0.1:55432/mathlogs_test?schema=public' JWT_SECRET=test-secret NODE_ENV=test npx tsx --test --test-force-exit tests/superAdminSecurity.test.ts`

Expected: FAIL with missing router/service behavior.

- [ ] **Step 3: Implement exact action classes and audit input**

```ts
export type SuperAdminActionClass =
  | 'SUPPORT_SESSION'
  | 'PLAN_REVOKE'
  | 'BILLING_ADJUSTMENT'
  | 'ADMIN_ACCESS_CHANGE'
  | 'SENSITIVE_CONFIGURATION'
  | 'TARGETED_COMMUNICATION'
  | 'INSTITUTE_DELETE'
  | 'SYSTEM_SESSION_REVOKE';

export type SuperAdminAuditInput = {
  action: string;
  entityType: string;
  entityId?: string;
  actorAdminId: string;
  instituteId?: string;
  reason?: string;
  correlationId: string;
  supportSessionId?: string;
  before?: Prisma.InputJsonValue;
  after?: Prisma.InputJsonValue;
  metadata?: Prisma.InputJsonValue;
};
```

`requireSuperAdminReauth` must conditionally consume one verified, unexpired challenge using `updateMany({ where: { id, adminId, actionClass, verifiedAt: { not: null }, consumedAt: null, expiresAt: { gt: now } } })`. A zero count returns `403 { error: 'REAUTH_REQUIRED' }`.

`claimSuperAdminIdempotency` creates a 24-hour scoped record transactionally. The winner performs the mutation and stores a bounded response; an identical completed request replays it, an identical pending request returns `409 IDEMPOTENCY_IN_PROGRESS`, and a key reused with a different canonical request hash returns `409 IDEMPOTENCY_KEY_REUSED`.

- [ ] **Step 4: Implement OTP challenge and support-session lifecycle**

Challenge send creates a six-digit cryptographic OTP, stores only a bcrypt hash, expires after five minutes, invalidates older unconsumed challenges for the same action, enforces a 60-second resend cooldown plus the existing auth rate limiter, and dispatches through the Superadmin account identity: normalize a phone-like username for WhatsApp or use an email-like username for email. If neither is configured, return `409 { error: 'SUPERADMIN_RECOVERY_CHANNEL_MISSING' }`. Test code injects a dispatcher and fixed OTP; production code never returns the OTP.

Verification compares the hash, increments failed attempts atomically, locks after five failures, and sets `verifiedAt` only while unexpired/unlocked. Support-session creation requires `reason.trim().length >= 10`, a consumed `SUPPORT_SESSION` challenge, a valid institute, and creates a 15-minute session plus audit entry in one transaction. Return `{ session, supportToken }`, where the short-lived JWT contains only `{ kind: 'SUPPORT_SESSION', sessionId, actorAdminId, instituteId, role: 'INSTITUTE_ADMIN' }` and expires no later than the row. Explicit ending conditionally sets `endedAt` and `endReason: 'MANUAL'` and writes its audit entry in one transaction.

- [ ] **Step 5: Mount the protected router**

```ts
const router = Router();
router.use(authenticateToken, requireSuperAdmin);
router.post('/security/reauth/send', sendReauthOtp);
router.post('/security/reauth/verify', verifyReauthOtp);
router.post('/support-sessions', requireSuperAdminReauth('SUPPORT_SESSION'), startSupportSession);
router.delete('/support-sessions/:id', endSupportSession);
```

Mount with `router.use('/super-admin', superAdminRoutes)` inside `server/src/routes/api.ts`.

Mount `correlationId` before authentication; accept a valid inbound `X-Correlation-Id` or generate a UUID, expose it as `req.correlationId`, and echo it in the response. Update token creation in `authController.ts` to create an `AdminSession`; refresh rotation carries the same `sessionId` and updates `lastSeenAt`; logout/revoke marks the session revoked and deletes its refresh tokens. Write bounded `LOGIN`, `LOGIN_FAILED`, `REFRESH`, and `LOGOUT` authentication events without storing usernames, destinations, raw IPs, credentials, or tokens.

- [ ] **Step 6: Run tests and build**

Run: `cd server && DATABASE_URL='postgresql://mathlogs_test:mathlogs_test@127.0.0.1:55432/mathlogs_test?schema=public' JWT_SECRET=test-secret NODE_ENV=test npx tsx --test --test-force-exit tests/superAdminSecurity.test.ts tests/superAdminSecuritySchema.test.ts`

Run: `cd server && npm run build`

Expected: all focused tests PASS; TypeScript build exits 0.

- [ ] **Step 7: Commit**

```bash
git add server/src/middleware/superAdmin.ts server/src/middleware/correlationId.ts server/src/types/express.d.ts server/src/services/superAdminAuditService.ts server/src/services/superAdminIdempotencyService.ts server/src/services/superAdminSecurityService.ts server/src/controllers/superAdminSecurityController.ts server/src/controllers/authController.ts server/src/routes/superAdminRoutes.ts server/src/routes/api.ts server/tests/superAdminSecurity.test.ts
git commit -m "feat: add guarded superadmin security flows"
```

### Task 3: Add Home attention and global institute-search APIs

**Files:**
- Create: `server/src/services/superAdminHomeService.ts`
- Create: `server/src/controllers/superAdminHomeController.ts`
- Modify: `server/src/routes/superAdminRoutes.ts`
- Test: `server/tests/superAdminHome.test.ts`

**Interfaces:**
- Produces `GET /api/super-admin/home` returning `{ metrics, attention, recentActivity, system }`.
- Produces `GET /api/super-admin/search?q=` returning at most 12 institute results.

- [ ] **Step 1: Write failing contract tests**

```ts
assert.deepEqual(Object.keys(body.data), ['metrics', 'attention', 'recentActivity', 'system']);
assert.equal(body.data.attention.some((item: any) => item.kind === 'CLAIM' && item.severity === 'TODAY'), true);
assert.equal(search.data[0].instituteId, institute.id);
```

- [ ] **Step 2: Run tests to verify RED**

Run: `cd server && DATABASE_URL='postgresql://mathlogs_test:mathlogs_test@127.0.0.1:55432/mathlogs_test?schema=public' JWT_SECRET=test-secret NODE_ENV=test npx tsx --test --test-force-exit tests/superAdminHome.test.ts`

Expected: 404 for both missing endpoints.

- [ ] **Step 3: Implement stable response contracts**

```ts
export type AttentionItem = {
  id: string;
  kind: 'CLAIM' | 'REVIEW' | 'LEAD_DELIVERY' | 'PLAN_EXPIRY' | 'SUPPORT' | 'JOB' | 'ONBOARDING';
  severity: 'CRITICAL' | 'TODAY' | 'UPCOMING';
  title: string;
  detail: string;
  instituteId?: string;
  entityId: string;
  createdAt: string;
  action: { label: string; href: string };
};
```

Compute Marketplace attention from existing dedicated state. Use plan-expiry windows of 7 days for `TODAY` and 30 days for `UPCOMING`. Keep the service query-only; no mutation or automatic retry occurs during aggregation.

- [ ] **Step 4: Add protected routes**

```ts
router.get('/home', getSuperAdminHome);
router.get('/search', searchSuperAdminInstitutes);
```

Search trims `q`, requires at least two characters, and uses case-insensitive name/teacher/email plus exact/contains phone and ID matching. Never return configuration JSON or credentials.

- [ ] **Step 5: Run tests and build**

Run: `cd server && DATABASE_URL='postgresql://mathlogs_test:mathlogs_test@127.0.0.1:55432/mathlogs_test?schema=public' JWT_SECRET=test-secret NODE_ENV=test npx tsx --test --test-force-exit tests/superAdminHome.test.ts tests/marketplaceSuperAdmin.test.ts`

Run: `cd server && npm run build`

Expected: PASS and build exit 0.

- [ ] **Step 6: Commit**

```bash
git add server/src/services/superAdminHomeService.ts server/src/controllers/superAdminHomeController.ts server/src/routes/superAdminRoutes.ts server/tests/superAdminHome.test.ts
git commit -m "feat: add superadmin attention home api"
```

### Task 4: Build the shared Superadmin shell and re-authentication dialog

**Files:**
- Create: `client/src/features/superadmin-shell/types.ts`
- Create: `client/src/features/superadmin-shell/api.ts`
- Create: `client/src/features/superadmin-shell/navigation.ts`
- Create: `client/src/features/superadmin-shell/SuperAdminShell.tsx`
- Create: `client/src/features/superadmin-shell/ReauthDialog.tsx`
- Create: `client/src/features/superadmin-shell/SuperAdminShell.test.tsx`
- Create: `client/src/pages/superadmin/SuperAdminRoute.tsx`
- Create: `client/src/pages/superadmin/SuperAdminHome.tsx`
- Modify: `client/src/App.tsx`

**Interfaces:**
- Produces hook `useSuperAdminReauth(): { request(actionClass): Promise<string> }`; returned string is the challenge ID sent through `X-Superadmin-Challenge`.
- Produces nested route shell using `<Outlet />`.
- Consumes Home/search contracts from Task 3.

- [ ] **Step 1: Write failing shell and dialog tests**

```tsx
render(<MemoryRouter initialEntries={['/super-admin']}><SuperAdminShell counts={{ support: 2 }}><div>Home</div></SuperAdminShell></MemoryRouter>);
expect(screen.getByRole('navigation', { name: /superadmin/i })).toBeVisible();
expect(screen.getByText('Support')).toHaveTextContent('2');
expect(screen.getByText('Home')).toBeVisible();
```

Test mobile menu focus, global search result navigation, OTP dialog failure, and successful challenge resolution.

- [ ] **Step 2: Run tests to verify RED**

Run: `cd client && npm run test:run -- src/features/superadmin-shell/SuperAdminShell.test.tsx`

Expected: FAIL because shell files do not exist.

- [ ] **Step 3: Define navigation and typed API**

```ts
export const superAdminNavigation = [
  { id: 'home', label: 'Home', href: '/super-admin' },
  { id: 'institutes', label: 'Institutes', href: '/super-admin/institutes' },
  { id: 'revenue', label: 'Revenue', href: '/super-admin/revenue' },
  { id: 'marketplace', label: 'Marketplace', href: '/super-admin/marketplace' },
  { id: 'support', label: 'Support', href: '/super-admin/support' },
  { id: 'communications', label: 'Communications', href: '/super-admin/communications' },
  { id: 'system', label: 'System', href: '/super-admin/system' }
] as const;
```

Use the shared `apiRequest` function and preserve structured error data. Do not add Axios to new modules.

- [ ] **Step 4: Implement shell and nested routes**

Use a fixed desktop sidebar, sticky top bar, mobile dialog navigation, global combobox search, attention badges, and an `<Outlet />`. Replace `/super-admin` and `/super-admin/marketplace` sibling routes with one protected `/super-admin` parent route and nested children.

- [ ] **Step 5: Implement attention-first Home**

Render urgency sections from server-provided `AttentionItem[]`, metric links, recent activity, and system status. Preserve explicit loading, empty, partial-error, and refresh states. Do not calculate severity again in the client.

- [ ] **Step 6: Run client tests, lint, and build**

Run: `cd client && npm run test:run`

Run: `cd client && npx eslint src/features/superadmin-shell src/pages/superadmin/SuperAdminRoute.tsx src/pages/superadmin/SuperAdminHome.tsx src/App.tsx`

Run: `cd client && npm run build`

Expected: all tests PASS; lint has no errors; production build exits 0.

- [ ] **Step 7: Commit**

```bash
git add client/src/features/superadmin-shell client/src/pages/superadmin/SuperAdminRoute.tsx client/src/pages/superadmin/SuperAdminHome.tsx client/src/App.tsx
git commit -m "feat: add unified superadmin shell"
```

## Foundation acceptance checkpoint

Run:

```bash
cd server
DATABASE_URL='postgresql://mathlogs_test:mathlogs_test@127.0.0.1:55432/mathlogs_test?schema=public' JWT_SECRET=test-secret NODE_ENV=test npx tsx --test --test-force-exit tests/superAdminSecuritySchema.test.ts tests/superAdminSecurity.test.ts tests/superAdminHome.test.ts tests/marketplaceSuperAdmin.test.ts
npm run build
```

Run:

```bash
cd client
npm run test:run
npm run build
```

Expected: focused server tests, full client tests, and both builds pass. Review the shell at desktop, tablet, and mobile widths before proceeding to the next plan.
