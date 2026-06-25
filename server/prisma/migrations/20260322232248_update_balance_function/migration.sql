-- Update calculate_student_balance to only consider fee installments created AFTER the student joined the institute

CREATE OR REPLACE FUNCTION calculate_student_balance(p_student_id TEXT)
RETURNS void AS $$
DECLARE
    v_total_fee DOUBLE PRECISION;
    v_total_paid DOUBLE PRECISION;
    v_balance DOUBLE PRECISION;
    v_last_payment TIMESTAMP;
    v_batch_id TEXT;
BEGIN
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

    -- Calculate total fee (batch fee or sum of installments starting ON OR AFTER student creation)
    SELECT 
        COALESCE(
            CASE 
                -- If this batch uses installments at all (sum > 0)
                WHEN COALESCE((SELECT SUM(fi.amount) FROM "FeeInstallment" fi WHERE fi."batchId" = b.id), 0) > 0
                -- ONLY charge the student for installments created AFTER their join date
                THEN COALESCE((SELECT SUM(fi.amount) FROM "FeeInstallment" fi WHERE fi."batchId" = b.id AND fi."createdAt" >= s."createdAt"), 0)
                -- Otherwise, rely on flat fee amount
                ELSE b."feeAmount"
            END,
            0
        ) INTO v_total_fee
    FROM "Student" s
    JOIN "Batch" b ON b.id = s."batchId"
    WHERE s.id = p_student_id;

    -- Default to 0 if still null
    v_total_fee := COALESCE(v_total_fee, 0);

    -- Calculate total paid
    SELECT 
        COALESCE((SELECT SUM(fr.amount) FROM "FeeRecord" fr WHERE fr."studentId" = p_student_id AND fr.status = 'PAID'), 0) +
        COALESCE((SELECT SUM(fp."amountPaid") FROM "FeePayment" fp WHERE fp."studentId" = p_student_id), 0)
    INTO v_total_paid;

    v_total_paid := COALESCE(v_total_paid, 0);

    -- Calculate balance
    v_balance := GREATEST(0, v_total_fee - v_total_paid);

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
        "totalFee" = v_total_fee,
        "totalPaid" = v_total_paid,
        "balance" = v_balance,
        "lastPaymentDate" = EXCLUDED."lastPaymentDate",
        "updatedAt" = NOW();
END;
$$ LANGUAGE plpgsql;

-- Also update existing balances based on the new logic
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
