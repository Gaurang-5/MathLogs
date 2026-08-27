-- Attendance was never activated in production. Refuse to remove its schema if
-- either table has acquired data since the production audit.
DO $$
BEGIN
  IF to_regclass('"AttendanceRecord"') IS NOT NULL
     AND EXISTS (SELECT 1 FROM "AttendanceRecord" LIMIT 1) THEN
    RAISE EXCEPTION 'ATTENDANCE_DATA_PRESENT: AttendanceRecord is not empty';
  END IF;

  IF to_regclass('"AttendanceSweepRun"') IS NOT NULL
     AND EXISTS (SELECT 1 FROM "AttendanceSweepRun" LIMIT 1) THEN
    RAISE EXCEPTION 'ATTENDANCE_DATA_PRESENT: AttendanceSweepRun is not empty';
  END IF;
END $$;

DROP TABLE IF EXISTS "AttendanceRecord";
DROP TABLE IF EXISTS "AttendanceSweepRun";
DROP TYPE IF EXISTS "AttendanceSource";
