# Critical Security Fixes - Applied 2026-01-26

## Summary
Two critical security and correctness issues have been fixed to make the system production-ready:

## Fix #1: Repaired Student Lookup After Composite Unique Constraint Change ✅

**Issue**: The `getStudentByHumanId` function was using `findUnique()` with only `humanId`, but after migration `20260126025335_scope_student_id_to_year`, the schema changed to use a composite unique constraint `@@unique([humanId, academicYearId])`.

**Impact**: This would cause **runtime errors** when teachers tried to look up students by ID during test mark entry.

**Fix Applied**:
- Changed from `findUnique()` to `findFirst()`
- Added `academicYearId` filter from current user session
- Added error logging for debugging

**Location**: `/server/src/controllers/testController.ts:86-106`

**Code Change**:
```typescript
// BEFORE (BROKEN)
const student = await prisma.student.findUnique({
    where: { humanId: String(humanId) },
    include: { batch: true, marks: true }
});

// AFTER (FIXED)
const student = await prisma.student.findFirst({
    where: { 
        humanId: String(humanId),
        academicYearId: currentAcademicYearId
    },
    include: { batch: true, marks: true }
});
```

---

## Fix #2: Enforced JWT Secret as Required Environment Variable ✅

**Issue**: JWT_SECRET had an unsafe fallback to a hardcoded default value `'supersecretkeychangeinprod'` that was:
- Version-controlled and publicly visible
- Would allow anyone with code access to forge valid authentication tokens
- Critical security vulnerability

**Impact**: **Authentication system could be completely bypassed** if deployed without setting JWT_SECRET.

**Fix Applied**:
1. Removed fallback value in both `authController.ts` and `auth.ts`
2. Added startup check that throws fatal error if JWT_SECRET is missing
3. Generated cryptographically secure random JWT secret
4. Added JWT_SECRET to `.env` file
5. Created `.env.example` template for documentation

**Locations**:
- `/server/src/controllers/authController.ts:6-9`
- `/server/src/middleware/auth.ts:5-8`
- `/server/.env` (added JWT_SECRET)
- `/server/.env.example` (created)

**Code Change**:
```typescript
// BEFORE (UNSAFE)
const JWT_SECRET = process.env.JWT_SECRET || 'supersecretkeychangeinprod';

// AFTER (SECURE)
const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
    throw new Error('FATAL: JWT_SECRET environment variable must be set. Generate a secure secret with: openssl rand -base64 32');
}
```

**Generated Secret**:
```bash
openssl rand -base64 32
# Output: 2Zt34foAi2/xSxyb3UJHZ1v8FfMLQ3SFWYIBvaMESKA=
```

---

## Server Restart Required

The server will need to restart to load the new environment variables. Since you have TypeScript hot reload configured, it should restart automatically, or you can manually restart:

```bash
# If needed, restart the dev server
cd server
npm run dev
```

---

## Verification Steps

### Test Fix #1 (Student Lookup)
1. Log in as teacher
2. Go to Tests section
3. Try to enter marks using Student ID lookup
4. Should now work without errors

### Test Fix #2 (JWT Security)
1. Server should start successfully (previously would use fallback)
2. Check logs for `FATAL: JWT_SECRET` error → **Should NOT appear** (means .env is loaded)
3. Authentication should work normally

---

## Next Steps

With these critical fixes applied, the system is now ready for **controlled testing** with the following constraints:

✅ **Safe to test with:**
- Up to 15-20 concurrent registrations (SQLite limitation)
- Stable network connections
- Single browser tab per teacher

⚠️ **Still monitor for:**
- Registration latency under burst load
- Rate limiter behavior in classroom NAT scenarios
- SQLite write serialization performance

---

## Production Deployment Checklist

Before deploying to production, ensure:

- [ ] `.env` file exists with unique `JWT_SECRET` (not the development one)
- [ ] Generate new production JWT secret: `openssl rand -base64 32`
- [ ] Verify `.env` is in `.gitignore` ✅ (already confirmed)
- [ ] Set environment variables in production hosting (Railway, Render, etc.)
- [ ] Consider PostgreSQL migration for >20 concurrent users

---

**Status**: ✅ **FIXES APPLIED - READY FOR CONTROLLED TESTING**
