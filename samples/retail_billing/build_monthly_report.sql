CREATE PROCEDURE dbo.build_monthly_report
AS
BEGIN
    INSERT INTO dbo.monthly_report (invoice_id, payment_id, status)
    SELECT invoice_id, payment_id, status
    FROM dbo.reconciled
    JOIN dbo.payments ON dbo.payments.payment_id = dbo.reconciled.payment_id;
END;