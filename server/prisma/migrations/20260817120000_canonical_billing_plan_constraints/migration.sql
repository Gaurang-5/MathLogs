DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'BillingPayment_canonical_plan' AND conrelid = '"BillingPayment"'::regclass) THEN
    ALTER TABLE "BillingPayment" ADD CONSTRAINT "BillingPayment_canonical_plan" CHECK (
      "plan" IS NULL OR "plan"::text IN ('MARKETPLACE', 'QUIZ', 'ENTERPRISE')
    );
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'PlanTrialClaim_canonical_plan' AND conrelid = '"PlanTrialClaim"'::regclass) THEN
    ALTER TABLE "PlanTrialClaim" ADD CONSTRAINT "PlanTrialClaim_canonical_plan" CHECK (
      "plan"::text IN ('QUIZ', 'ENTERPRISE')
    );
  END IF;
END $$;
