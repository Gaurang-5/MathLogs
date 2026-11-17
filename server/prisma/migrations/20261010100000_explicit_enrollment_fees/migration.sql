-- Preserve existing enrollment rules; new teacher-confirmed plans opt into explicit fees.
ALTER TABLE "Enrollment" ADD COLUMN "feeDecision" TEXT NOT NULL DEFAULT 'LEGACY';
ALTER TABLE "Enrollment" ADD COLUMN "applyFutureInstallments" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "Enrollment" ADD CONSTRAINT "Enrollment_feeDecision_check" CHECK ("feeDecision" IN ('LEGACY', 'SELECTED', 'NO_FEE', 'LATER'));
ALTER TABLE "FeeInstallment" ADD COLUMN "lockedAt" TIMESTAMP(3);
-- Enforce invite fee immutability even when edit/delete races with sending an invite.
CREATE FUNCTION protect_invited_installment() RETURNS trigger AS $$
BEGIN
  IF OLD."lockedAt" IS NOT NULL THEN
    IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'INVITED_INSTALLMENT_LOCKED'; END IF;
    IF NEW.amount IS DISTINCT FROM OLD.amount OR NEW."lockedAt" IS NULL THEN
      RAISE EXCEPTION 'INVITED_INSTALLMENT_LOCKED';
    END IF;
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER protect_invited_installment BEFORE UPDATE OR DELETE ON "FeeInstallment"
FOR EACH ROW EXECUTE FUNCTION protect_invited_installment();

-- Keep the historical balance function for students with no explicit fee plan.
ALTER FUNCTION calculate_student_balance(TEXT) RENAME TO calculate_legacy_student_balance;
CREATE FUNCTION calculate_student_balance(p_student_id TEXT) RETURNS void AS $$
DECLARE
  v_fee DOUBLE PRECISION;
  v_paid DOUBLE PRECISION;
  v_last TIMESTAMP;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM "Student" WHERE id = p_student_id) THEN RETURN; END IF;
  IF NOT EXISTS (SELECT 1 FROM "Enrollment" WHERE "studentId" = p_student_id AND "feeDecision" <> 'LEGACY') THEN
    PERFORM calculate_legacy_student_balance(p_student_id);
    RETURN;
  END IF;
  PERFORM 1 FROM "Student" WHERE id = p_student_id FOR NO KEY UPDATE;
  WITH applicable AS (
    SELECT DISTINCT fi.id, fi.amount FROM "Enrollment" e
    JOIN "FeeInstallment" fi ON fi."batchId" = e."batchId"
    WHERE e."studentId" = p_student_id AND e.status = 'ACTIVE' AND (
      fi."studentId" = p_student_id OR (fi."studentId" IS NULL AND (
        (e."feeDecision" = 'LEGACY' AND fi."createdAt" >= e."startedAt")
        OR EXISTS (SELECT 1 FROM "FeeInstallmentAssignment" fa WHERE fa."studentId" = p_student_id AND fa."installmentId" = fi.id)
        OR EXISTS (SELECT 1 FROM "FeePayment" fp WHERE fp."studentId" = p_student_id AND fp."installmentId" = fi.id)
      ))
    )
  )
  SELECT COALESCE((SELECT SUM(amount) FROM applicable), 0)
    + COALESCE((SELECT SUM(b."feeAmount") FROM "Enrollment" e JOIN "Batch" b ON b.id = e."batchId"
      WHERE e."studentId" = p_student_id AND e.status = 'ACTIVE' AND e."feeDecision" = 'LEGACY'
      AND NOT EXISTS (SELECT 1 FROM "FeeInstallment" fi WHERE fi."batchId" = b.id AND fi."studentId" IS NULL)), 0),
    COALESCE((SELECT SUM(fp."amountPaid") FROM "FeePayment" fp JOIN applicable a ON a.id = fp."installmentId" WHERE fp."studentId" = p_student_id), 0)
    + COALESCE((SELECT SUM(amount) FROM "FeeRecord" WHERE "studentId" = p_student_id AND status = 'PAID'), 0)
  INTO v_fee, v_paid;
  SELECT MAX(d) INTO v_last FROM (
    SELECT date AS d FROM "FeePayment" WHERE "studentId" = p_student_id
    UNION ALL SELECT date FROM "FeeRecord" WHERE "studentId" = p_student_id AND status = 'PAID'
  ) payments;
  INSERT INTO "StudentBalance" ("studentId", "totalFee", "totalPaid", balance, "lastPaymentDate", "updatedAt")
  VALUES (p_student_id, v_fee, v_paid, v_fee - v_paid, v_last, NOW())
  ON CONFLICT ("studentId") DO UPDATE SET "totalFee" = EXCLUDED."totalFee", "totalPaid" = EXCLUDED."totalPaid",
    balance = EXCLUDED.balance, "lastPaymentDate" = EXCLUDED."lastPaymentDate", "updatedAt" = NOW();
END;
$$ LANGUAGE plpgsql;
CREATE FUNCTION refresh_enrollment_fee_balance() RETURNS trigger AS $$
BEGIN
  IF TG_OP <> 'INSERT' THEN PERFORM calculate_student_balance(OLD."studentId"); END IF;
  IF TG_OP <> 'DELETE' THEN PERFORM calculate_student_balance(NEW."studentId"); END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER refresh_balance_after_enrollment AFTER INSERT OR UPDATE OR DELETE ON "Enrollment"
FOR EACH ROW EXECUTE FUNCTION refresh_enrollment_fee_balance();
CREATE TRIGGER refresh_balance_after_assignment AFTER INSERT OR UPDATE OR DELETE ON "FeeInstallmentAssignment"
FOR EACH ROW EXECUTE FUNCTION refresh_enrollment_fee_balance();

-- Replace the older assignment-only trigger, which misses newly created custom invoices.
CREATE OR REPLACE FUNCTION trigger_update_balance_installment() RETURNS trigger AS $$
DECLARE
  v_batch TEXT;
  v_student TEXT;
  affected RECORD;
BEGIN
  v_batch := CASE WHEN TG_OP = 'DELETE' THEN OLD."batchId" ELSE NEW."batchId" END;
  v_student := CASE WHEN TG_OP = 'DELETE' THEN OLD."studentId" ELSE NEW."studentId" END;
  FOR affected IN
    SELECT "studentId" AS id FROM "Enrollment" WHERE "batchId" = v_batch
    UNION SELECT id FROM "Student" WHERE "batchId" = v_batch OR id = v_student
  LOOP
    PERFORM calculate_student_balance(affected.id);
  END LOOP;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS trg_fee_assignment_balance ON "FeeInstallmentAssignment";
