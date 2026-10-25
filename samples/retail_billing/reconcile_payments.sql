CREATE PROCEDURE dbo.reconcile_payments
AS
BEGIN
    INSERT INTO dbo.reconciled (invoice_id, payment_id, status)
    SELECT invoice_id, payment_id, status
    FROM dbo.clean_invoices
    JOIN dbo.payment_matches ON dbo.payment_matches.invoice_id = dbo.clean_invoices.invoice_id;

    UPDATE dbo.payments
    SET reconciled = 1
    WHERE payment_id IN (SELECT payment_id FROM dbo.payment_matches);

    EXEC dbo.build_monthly_report;
END;