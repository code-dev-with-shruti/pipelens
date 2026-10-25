CREATE PROCEDURE dbo.load_invoices
AS
BEGIN
    CREATE TABLE #temp_invoices (
        invoice_id INT,
        customer_id INT
    );

    INSERT INTO #temp_invoices (invoice_id, customer_id)
    SELECT invoice_id, customer_id
    FROM staging.raw_invoices;

    UPDATE dbo.clean_invoices
    SET status = 'loaded'
    WHERE invoice_id IN (SELECT invoice_id FROM #temp_invoices);

    TRY
    BEGIN
        DELETE FROM dbo.audit_log WHERE created_at < '2024-01-01';
    END
    CATCH
    BEGIN
        INSERT INTO dbo.error_log (message) VALUES ('error');
    END

    EXEC dbo.clean_invoice_records;
END;
