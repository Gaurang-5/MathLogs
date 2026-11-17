-- Legacy application instances continued creating students after the enrollment schema
-- was expanded. Preserve their current batch membership before switching readers.
INSERT INTO "Enrollment" (id,"instituteId","studentId","batchId",status,"startedAt","createdAt","updatedAt")
SELECT md5('cutover:' || s.id || ':' || s."batchId")::uuid::text,s."instituteId",s.id,s."batchId",'ACTIVE',s."createdAt",NOW(),NOW()
FROM "Student" s JOIN "Batch" b ON b.id=s."batchId" AND b."instituteId"=s."instituteId"
WHERE s.status IN ('APPROVED','ACTIVE') AND NOT EXISTS
(SELECT 1 FROM "Enrollment" e WHERE e."studentId"=s.id AND e."batchId"=s."batchId" AND e.status='ACTIVE');
UPDATE "StudentMonthCoverageProfile" p SET "enrollmentId"=e.id FROM "Enrollment" e
WHERE p."enrollmentId" IS NULL AND p."studentId"=e."studentId" AND p."batchId"=e."batchId" AND e.status='ACTIVE';
UPDATE "MonthCoveragePayment" p SET "enrollmentId"=e.id FROM "Enrollment" e
WHERE p."enrollmentId" IS NULL AND p."studentId"=e."studentId" AND p."batchId"=e."batchId" AND e.status='ACTIVE';
UPDATE "MonthCoverageAllocation" p SET "enrollmentId"=e.id FROM "Enrollment" e
WHERE p."enrollmentId" IS NULL AND p."studentId"=e."studentId" AND p."batchId"=e."batchId" AND e.status='ACTIVE';
