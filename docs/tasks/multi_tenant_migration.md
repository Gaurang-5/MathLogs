# Task: Multi-Tenant Migration & "Golden Ticket" Onboarding

## Status
- [ ] **Phase 1: Database Architecture**
    - [ ] Update `schema.prisma` with `Institute`, `InviteToken`, and relation updates.
    - [ ] Create migration script to move existing single-user data to a new "Default Institute".
- [ ] **Phase 2: Backend Logic**
    - [ ] Update `authController.ts` to support Super Admin setup.
    - [ ] Create `inviteController.ts` for generating tokens and handling setup.
    - [ ] Update `authMiddleware` to enforce Institute isolation.
    - [ ] Refactor existing controllers to check `instituteId` instead of `teacherId` (or map teacherId to Admin).
- [ ] **Phase 3: Frontend Updates**
    - [ ] Create "Setup Account" page (`/setup?token=...`).
    - [ ] Update Login to handle new roles (optional, mostly invisible).
    - [ ] (Future) Add Super Admin Dashboard.

## Detailed Schema Plan

### New Models
```prisma
model Institute {
  id            String         @id @default(uuid())
  name          String
  createdAt     DateTime       @default(now())
  updatedAt     DateTime       @updatedAt
  
  admins        Admin[]
  academicYears AcademicYear[]
  students      Student[]      // Direct link for safety?
  invites       InviteToken[]
}

model InviteToken {
  id          String    @id @default(uuid())
  token       String    @unique
  instituteId String
  institute   Institute @relation(fields: [instituteId], references: [id])
  isUsed      Boolean   @default(false)
  expiresAt   DateTime
  createdAt   DateTime  @default(now())
}
```

### Modified Models

**Admin:**
- Add `instituteId` (FK).
- Add `role` (Enum: SUPER_ADMIN, ADMIN).

**AcademicYear:**
- Add `instituteId` (FK).
- Remove/Deprecate `teacherId` (Map existing `teacherId` to `instituteId` logic).

**Student/Batch:**
- **Decision:** To enforce strict isolation, we will add `instituteId` to `Student`, `Batch`, `FeeRecord` eventually.
- **Phase 1 Step:** Let's assume ownership via `AcademicYear` for now to save time, OR add `instituteId` to `AcademicYear` and rely on that.
- *Correction*: `AcademicYear` is the root of the data tree for a year. If we link `AcademicYear` to `Institute`, and ensure all Batches/Students belong to a valid Year, we are safe.
- *Risk*: Students pending assignment might not have a year?
- *Check*: `Student` model has `academicYearId`. Is it optional? Yes.
- If `Student` has no `academicYearId`, who owns them?
- Currently `Student` implies ownership via... wait.
- `Student` table currently does NOT have `teacherId`. It has `batchId` (optional) and `academicYearId` (optional).
- ⚠️ **SECURITY HOLE**: If a student has no batch and no year, they are "floating". We need to fix this.
- **Fix:** `Student` MUST have `instituteId`.

## Migration Strategy (The "Golden Ticket" Path)

1. **Pre-Migration**:
   - Backup DB.
   
2. **Migration Step 1 (Schema)**:
   - Add `Institute` model.
   - Add optional `instituteId` to `Admin`, `Student`, `AcademicYear`.
   
3. **Migration Step 2 (Data)**:
   - Create "Default Institute" (Name: "My Coaching").
   - Assign existing single Admin to this Institute.
   - Assign ALL existing Students/Years to this Institute.
   
4. **Migration Step 3 (Enforcement)**:
   - Make `instituteId` required on `Admin`, `AcademicYear`, `Student`.
   
5. **Migration Step 4 (Cleanup)**:
   - Remove `teacherId` from `AcademicYear`.

## "Golden Ticket" Workflow
1. Super Admin hits `/api/invites/generate` -> `{ token: "abc-123" }`.
2. Teacher visits frontend `/setup?token=abc-123`.
3. Frontend calls `/api/invites/validate` -> returns Institute Name.
4. Teacher fills "Username, Password".
5. Frontend calls `/api/auth/setup` -> creates Admin, links to Institute, invalidates token.
