-- Ensure atomic calculation by locking the student row
CREATE OR REPLACE FUNCTION calculate_student_balance(p_student_id TEXT)
RETURNS void AS $$
DECLARE
    v_total_fee DOUBLE PRECISION;
    v_total_paid DOUBLE PRECISION;
    v_balance DOUBLE PRECISION;
    v_last_payment TIMESTAMP;
    v_batch_id TEXT;
BEGIN
    -- ATOMIC LOCK: Lock the student row to prevent concurrent recalcs stomping each other
    PERFORM 1 FROM "Student" WHERE id = p_student_id FOR NO KEY UPDATE;

    -- Get batch ID (may be null)
    SELECT s."batchId" INTO v_batch_id
    FROM "Student" s
    WHERE s.id = p_student_id;

    -- If no batch, set defaults and exit
    IF v_batch_id IS NULL THEN
        INSERT INTO "StudentBalance" ("studentId", "totalFee", "totalPaid", "balance", "lastPaymentDate", "updatedAt")
        VALUES (p_student_id, 0, 0, 0, NULL, NOW())
        ON CONFLICT ("studentId") DO UPDATE SET
            "totalFee" = 0,
            "totalPaid" = 0,
            "balance" = 0,
            "updatedAt" = NOW();
        RETURN;
    END IF;

    -- Calculate total fee with custom invoice support
    SELECT 
        COALESCE(
            CASE 
                -- If this batch uses installments at all (sum > 0)
                WHEN COALESCE((SELECT SUM(fi.amount) FROM "FeeInstallment" fi WHERE fi."batchId" = b.id), 0) > 0
                THEN (
                    -- Rule A: Batch-wide installments created on/after student join date OR that the student has paid for
                    COALESCE((
                        SELECT SUM(fi.amount) 
                        FROM "FeeInstallment" fi 
                        WHERE fi."batchId" = b.id 
                          AND fi."studentId" IS NULL 
                          AND (fi."createdAt" >= s."createdAt" OR EXISTS (SELECT 1 FROM "FeePayment" fp WHERE fp."installmentId" = fi.id AND fp."studentId" = s.id))
                    ), 0)
                    +
                    -- Rule B: Custom invoices explicitly assigned to this student
                    COALESCE((
                        SELECT SUM(fi.amount) 
                        FROM "FeeInstallment" fi 
                        WHERE fi."batchId" = b.id 
                          AND fi."studentId" = p_student_id
                    ), 0)
                )
                -- Otherwise, rely on flat fee amount
                ELSE b."feeAmount"
            END,
            0
        ) INTO v_total_fee
    FROM "Student" s
    JOIN "Batch" b ON b.id = s."batchId"
    WHERE s.id = p_student_id;

    v_total_fee := COALESCE(v_total_fee, 0);

    -- Calculate total paid
    SELECT 
        COALESCE((SELECT SUM(fr.amount) FROM "FeeRecord" fr WHERE fr."studentId" = p_student_id AND fr.status = 'PAID'), 0) +
        COALESCE((SELECT SUM(fp."amountPaid") FROM "FeePayment" fp WHERE fp."studentId" = p_student_id), 0)
    INTO v_total_paid;

    v_total_paid := COALESCE(v_total_paid, 0);

    -- Calculate balance (allow negative balances for overpayments)
    v_balance := v_total_fee - v_total_paid;

    -- Get last payment date
    SELECT MAX(latest_date) INTO v_last_payment
    FROM (
        SELECT MAX(fr.date) as latest_date FROM "FeeRecord" fr WHERE fr."studentId" = p_student_id
        UNION ALL
        SELECT MAX(fp.date) as latest_date FROM "FeePayment" fp WHERE fp."studentId" = p_student_id
    ) dates;

    -- Upsert balance
    INSERT INTO "StudentBalance" ("studentId", "totalFee", "totalPaid", "balance", "lastPaymentDate", "updatedAt")
    VALUES (p_student_id, v_total_fee, v_total_paid, v_balance, v_last_payment, NOW())
    ON CONFLICT ("studentId") DO UPDATE SET
        "totalFee" = EXCLUDED."totalFee",
        "totalPaid" = EXCLUDED."totalPaid",
        "balance" = EXCLUDED."balance",
        "lastPaymentDate" = EXCLUDED."lastPaymentDate",
        "updatedAt" = NOW();
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION trigger_update_balance_installment()
RETURNS TRIGGER AS $$
BEGIN
    -- If this installment is student-specific, only recalculate that student
    IF NEW."studentId" IS NOT NULL THEN
        PERFORM calculate_student_balance(NEW."studentId");
    ELSE
        -- Batch-wide installment changed: recalculate all students in that batch
        PERFORM calculate_student_balance(s.id)
        FROM "Student" s
        WHERE s."batchId" = NEW."batchId" AND s.status = 'APPROVED';
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DO $$
DECLARE
    student_record RECORD;
BEGIN
    FOR student_record IN 
        SELECT id FROM "Student" WHERE status = 'APPROVED'
    LOOP
        PERFORM calculate_student_balance(student_record.id);
    END LOOP;
END;
$$;
