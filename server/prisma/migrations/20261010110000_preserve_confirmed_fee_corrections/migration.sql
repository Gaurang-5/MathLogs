-- Only the individually audited corrections already approved and logged by the teacher
-- switch to explicit fee policy. Other legacy students retain their existing policy.
WITH corrected AS (
  SELECT a."instituteId", row->>'id' AS "studentId"
  FROM "EnrollmentAction" a, LATERAL jsonb_array_elements(a.result->'before') row
  WHERE a.action='FEE_CORRECTION' AND a."idempotencyKey" LIKE 'october-only-%-repair-2026-10-10-v1'
  UNION
  SELECT a."instituteId",a.result->>'targetStudentId' FROM "EnrollmentAction" a
  WHERE a.action='STUDENT_MERGE' AND a."idempotencyKey"='agamya-identity-and-october-repair-2026-10-10-v1'
)
UPDATE "Enrollment" e SET "feeDecision"='SELECTED',"applyFutureInstallments"=false
FROM corrected c WHERE e."studentId"=c."studentId" AND e."instituteId"=c."instituteId" AND e.status='ACTIVE';
