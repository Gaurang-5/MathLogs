# Architecture Redesign: Academic Year & Student Lifecycle

This report addresses structural flaws in the current "Academic Year" system and provides a concrete architectural redesign. The goal is to resolve data siloing, test result bleeding, and billing loopholes while introducing a scalable pattern for student promotions.

---

## 1. Multi-Tenant Ownership & Scope (Data Siloing)
**The Flaw:** Academic years are owned by `teacherId` (Admins). In a multi-admin Institute, Admin A and Admin B do not share the same "2024-2025" wrapper.
**The Fix:** Promote `AcademicYear` to belong to the `Institute`. 

### Schema Changes
```prisma
model AcademicYear {
  id              String     @id @default(uuid())
  name            String
  startDate       DateTime?
  endDate         DateTime?
  status          String     @default("ACTIVE") // ACTIVE, ARCHIVED
  
  // Relations
  instituteId     String     // Made REQUIRED
  institute       Institute  @relation(fields: [instituteId], references: [id], onDelete: Cascade)
  
  // @@unique constraints
  @@unique([instituteId, name]) // Replaces [teacherId, name]
}
```

---

## 2. The "Absentee Test Blast" (Communication Risk)
**The Flaw:** The `Test` model lacks a direct relationship to `Batch`. Eligibility and "Absent" determinations are inferred by checking which students *happened* to get a score.
**The Fix:** Explicitly link `Test` to a target `Batch` (or multiple batches).

### Schema Changes
```prisma
model Test {
  id              String        @id @default(uuid())
  name            String
  subject         String
  date            DateTime
  maxMarks        Float
  
  // Replaces floating 'className'
  batchId         String         // Explicitly targets an audience
  batch           Batch          @relation(fields: [batchId], references: [id])
}

// In getTestEligibleStudents():
// Filter purely by: `where: { batchId: test.batchId, status: 'APPROVED' }`
```

---

## 3. Subscription Cap Loopholes (Billing)
**The Flaw:** `maxStudents` is verified per academic year (`instituteId` + `academicYearId`). Admins can bypass limits by creating endless academic years.
**The Fix:** Disconnect billing limits from `academicYearId`. Determine active seats exclusively based on the `Institute` level.

### Logic Redesign (studentController.ts)
```typescript
const activeInstituteStudents = await prisma.student.count({
    where: {
        instituteId: batch.instituteId,
        status: { in: ['APPROVED', 'PENDING'] } // Ignore DROPPED/LEFT
        // Notice we REMOVED academicYearId from the count
    }
});
```

---

## 4. Student Longitudinal Profiles
**The Flaw:** Currently, a single human child joining in 2024 and 2025 generates two completely disconnected `Student` records.
**The Fix:** While creating a full `StudentProfile` ↔ `Enrollment` split is heavy, we can achieve parity cheaply using the existing `humanId` as the global identifier.

### Schema Enhancements
1. Ensure `humanId` is generated globally per `Institute` (not per year/batch).
2. Establish promotion workflows: Instead of teachers sending new registration links for the next year, introduce a **"Promote to Next Year"** bulk action.
   - It duplicates the `Student` record into the new `currentAcademicYearId`, carrying over the exact same `humanId`.
   - UI reports can group by `humanId` to show 3-year performance charts without structural database migrations.

---

## 5. Security Guardrails & Archival (Safe Deletion)
**The Flaw:** Hard-deleting an academic year nullifies foreign keys (`academicYearId = null`), creating ghost students and bypassing unique constraints.
**The Fix:** Disable hard-deletes. Introduce "Soft Archival" and strict middleware boundaries.

### Architectural Rules
1. **Never Orphan:** `deleteAcademicYear` either completely cascades deletions (if it was an accidental setup) or is replaced by `archiveAcademicYear` which skips queries but keeps data intact for read-only historical viewing.
2. **Boundary Enforcement Middleware:**
   Every controller mutating data (`updateStudent`, `deleteBatch`, etc.) must pass through a utility guard:
   ```typescript
   export const verifyActiveYearBoundary = (entityYearId: string, adminActiveYearId: string) => {
       if (entityYearId !== adminActiveYearId) {
           throw new Error('Cannot modify data outside of the currently active academic year.');
       }
   };
   ```

---

## 6. Frontend Disconnect: Missing Start Dates
**The Flaw:** The Settings UI (`Settings.tsx`) allows users to create a new Academic Year by simply providing a string name (e.g., "2025-26"). It does not prompt for or submit a `startDate`. 
Because of this, all manually created Academic Years have an `undefined` `startDate` in the database. When a student registers, the ID generator algorithm (`studentController.ts`) attempts to use the `startDate` to determine the prefix suffix, but strictly falls back to the *current system calendar year* if missing.
**The Impact:** Students registering for the identical "Math 2025-26" batch right before New Years and right after New Years will receive completely different ID prefixes (e.g., `MTH25-001` vs `MTH26-002`), breaking sorting and visual grouping.
**The Fix:** 
1. **Frontend:** Update the `Settings.tsx` "Create Academic Year" form to include required `startDate` and `endDate` date pickers.
2. **Backend Guard:** Ensure `startDate` is made `@default(now())` or required, and update the ID parsing to extract the year explicitly from the `name` field (e.g., extracting "25" from "2025-26") as an ultimate fallback.

---

## Migration Strategy

To implement this without breaking production:
1. **Phase 1 (Schema):** Add `status` to AcademicYear, `batchId` to Test. Nullable for backward compatibility initially.
2. **Phase 2 (Logic Backfill):** Update `createAcademicYear` to use `instituteId`, and run a data-migration script for legacy years linking them up to the teacher's institute.
3. **Phase 3 (Enforcement):** Drop `className` from tests, make `instituteId` required on `AcademicYear`, and apply strict boundary validations in controllers.
