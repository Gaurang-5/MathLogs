-- Disable DDL Transaction
CREATE INDEX CONCURRENTLY "FeePayment_date_installmentId_idx" ON "FeePayment"("date", "installmentId");
