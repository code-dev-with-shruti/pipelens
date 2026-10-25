CREATE PROCEDURE dbo.clean_invoice_records
AS
BEGIN
    SELECT payment_id FROM dbo.payments;

    UPDATE dbo.payments
    SET invoice_id = invoices.invoice_id
    FROM dbo.payment_imports AS imports
    JOIN dbo.clean_invoices AS invoices ON invoices.invoice_id = imports.invoice_id;

    EXEC dbo.reconcile_payments;
END;