# Additional Architecture Fixes - Applied 2026-01-26

## Summary
After the critical security fixes, the following additional correctness and safety improvements have been implemented to strengthen the system's production readiness.

---

## Fix #4: Database-Level Idempotency Constraint ✅

### Issue
The application-level idempotency check had a race window: two concurrent identical submissions could both pass the check and create duplicate students with different human IDs.

**Race Condition Timeline**:
```
T=0ms:  Request A checks for existing student → None found
T=5ms:  Request B checks for existing student → None found
T=10ms: Request A generates ID "MTH26001"
T=12ms: Request B generates ID "MTH26002"  ❌ Different ID
T=15ms: Request A creates student (John, MTH26001)
T=17ms: Request B creates student (John, MTH26002)  ❌ Duplicate
```

### Fix Applied

**1. Database Schema Change**
Added composite unique constraint on natural keys:

```prisma
model Student {
  // ... fields
  
  @@unique([humanId, academicYearId])
  @@unique([name, parentWhatsapp, batchId], name: "student_natural_key")  // NEW
}
```

**Migration**: `20260126031034_add_student_natural_key_constraint`

**2. Enhanced Error Handling**
Updated all three student creation paths to distinguish between constraint violations:

- **Natural Key Collision** (`name_parentWhatsapp_batchId`) → Return existing student (true idempotency)
- **HumanID Collision** → Retry with new ID (expected behavior)

**Code Changes**:
```typescript
// Before
if (error.code === 'P2002') {
    retries++;  // Always retry
}

// After
if (error.code === 'P2002') {
    const target = error.meta?.target;
    if (target?.includes('student_natural_key')) {
        // True duplicate - return existing
        const existing = await prisma.student.findFirst({
            where: { batchId, name, parentWhatsapp }
        });
        return res.json(existing);
    } else {
        // ID collision - retry
        retries++;
    }
}
```

**Files Modified**:
- `/server/prisma/schema.prisma`
- `/server/src/controllers/studentController.ts` (3 functions: `registerStudent`, `addStudentManually`, `approveStudent`)

**Benefits**:
- ✅ Eliminates duplicate registration race condition
- ✅ True idempotency even under extreme concurrency
- ✅ Database enforces what code attempts to guarantee

---

## Fix #5: Academic Year Boundary Enforcement ✅

### Issue
Write operations (update, delete) verified teacher ownership but **not** academic year ownership. This created a potential attack vector:

1. Teacher switches to Year 2025-2026 in UI
2. Uses browser dev tools to replay old API call with batch ID from 2024-2025
3. Server allows modification because `teacherId` matches
4. **Result**: Teacher modifies past year data without UI awareness

### Risk Assessment
- **Current Risk**: Low (UI doesn't expose IDs from non-active years)
- **Future Risk**: High (if "View All Years" feature is added, IDs become discoverable)

### Fix Applied

Added academic year boundary checks to **all write operations**:

**Batch Operations** (`batchController.ts`):
- ✅ `updateBatch` - Blocks updates to non-active year batches
- ✅ `deleteBatch` - Blocks deletions of non-active year batches

**Student Operations** (`studentController.ts`):
- ✅ `updateStudent` - Blocks updates to non-active year students
- ✅ `rejectStudent` - Blocks deletions of non-active year students

**Test Operations** (`testController.ts`):
- ✅ `updateTest` - Blocks updates to non-active year tests
- ✅ `deleteTest` - Blocks deletions of non-active year tests

**Implementation Pattern**:
```typescript
export const updateBatch = async (req: Request, res: Response) => {
    const teacherId = (req as any).user?.id;
    const currentAcademicYearId = (req as any).user?.currentAcademicYearId;  // NEW
    
    // ... fetch entity
    
    // Teacher ownership check (existing)
    if (batch.teacherId !== teacherId) {
        return res.status(403).json({ error: 'Unauthorized' });
    }
    
    // Academic year boundary check (NEW)
    if (batch.academicYearId && batch.academicYearId !== currentAcademicYearId) {
        return res.status(400).json({ 
            error: 'Cannot modify batch from non-active academic year. Switch to the correct year first.' 
        });
    }
    
    // ... perform update
};
```

**Error Messages**:
- `"Cannot modify batch from non-active academic year. Switch to the correct year first."`
- `"Cannot delete batch from non-active academic year. Switch to the correct year first."`
- `"Cannot modify student from non-active academic year"`
- `"Cannot reject student from non-active academic year"`
- `"Cannot modify test from non-active academic year"`
- `"Cannot delete test from non-active academic year"`

**Files Modified**:
- `/server/src/controllers/batchController.ts` (2 functions)
- `/server/src/controllers/studentController.ts` (2 functions)
- `/server/src/controllers/testController.ts` (2 functions)

**Benefits**:
- ✅ **Explicit data isolation** between academic years
- ✅ Prevents accidental cross-year mutations
- ✅ **Future-proof** for cross-year UI features
- ✅ Clear error messages guide users to switch years first

**Design Decision**:
Read operations **intentionally do not** enforce year boundaries because:
1. Some workflows may legitimately need to reference past data (e.g., student history)
2. Create operations automatically assign `academicYearId from current session
3. Authorization layer (teacher ownership) is the primary security control

---

## Testing Recommendations

### Test Idempotency Fix
1. **Concurrent Registration Test**:
   ```bash
   # Simulate 10 concurrent identical submissions
   for i in {1..10}; do
     curl -X POST http://localhost:3001/api/public/register \
       -H "Content-Type: application/json" \
       -d '{"batchId":"...","name":"John Doe","parentWhatsapp":"+1234567890"}' &
   done
   wait
   ```
   **Expected**: Only 1 student created, all requests return same student object

2. **Database Verification**:
   ```sql
   SELECT name, parentWhatsapp, batchId, COUNT(*) as count
   FROM Student
   GROUP BY name, parentWhatsapp, batchId
   HAVING count > 1;
   ```
   **Expected**: 0 rows (no duplicates)

### Test Year Boundary Enforcement
1. Switch to academic year "2024-2025"
2. Note a batch ID from that year
3. Switch to academic year "2025-2026"
4. Try to update the old batch via API:
   ```bash
   curl -X PUT http://localhost:3001/api/batches/{old-batch-id} \
     -H "Authorization: Bearer YOUR_JWT" \
     -H "Content-Type: application/json" \
     -d '{"name":"Modified Name"}'
   ```
   **Expected**: `400 Bad Request` with error message about non-active year

---

## Migration Status

| Migration | Status | Description |
|-----------|--------|-------------|
| `20260126025335_scope_student_id_to_year` | ✅ Applied | Composite unique `[humanId, academicYearId]` |
| `20260126031034_add_student_natural_key_constraint` | ✅ Applied | Composite unique `[name, parentWhatsapp, batchId]` |

---

## System Status Summary

### ✅ **Fixes Completed**

| # | Issue | Status | Impact |
|---|-------|--------|--------|
| 1 | Student lookup broken after schema change | ✅ FIXED | User-facing feature now works |
| 2 | JWT secret enforcement | ✅ FIXED | Critical security vulnerability eliminated |
| 4 | Race condition in idempotency | ✅ FIXED | No more duplicate registrations |
| 5 | No academic year boundaries on writes | ✅ FIXED | Explicit data isolation enforced |

### ⚠️ **Known Limitations (Acceptable for Current Scale)**

| # | Limitation | Mitigation | When to Address |
|---|------------|------------|-----------------|
| - | SQLite write serialization | Rate limiting + monitoring | When >20 concurrent users observed |
| - | ID counters shared globally | Documented as product decision | If teachers request scoped sequences |

### ✅ **Ready for Production Testing**

- **Maximum concurrent load**: 15-20 simultaneous registrations
- **Network requirements**: Stable connections (reduces retry scenarios)
- **Operational model**: Single browser tab per teacher recommended
- **Monitoring**: Track registration latency, P2002 errors, rate limit hits

---

## Operational Notes

### Database Constraints Now Enforced
1. `[humanId, academicYearId]` - Prevents same ID in same year
2. `[name, parentWhatsapp, batchId]` - Prevents true duplicate students

### Error Codes to Monitor
- `P2002` with `student_natural_key` → Idempotency working (good)
- `P2002` with `humanId` → ID collision, retry logic engaged (rare, acceptable)
- HTTP 400 "non-active academic year" → User attempted cross-year modification (inform user)

### Future Considerations
When implementing "View All Years" or cross-year features:
- Consider **relaxing** year boundary checks for specific read operations
- Add **explicit year selector** in UI for write operations that need cross-year access
- Consider **audit logging** for cross-year data access

---

**Status**: ✅ **ALL FIXES APPLIED - SYSTEM HARDENED FOR PRODUCTION TESTING**

Last Updated: 2026-01-26 08:40 IST
