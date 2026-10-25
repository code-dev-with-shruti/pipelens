CREATE PROCEDURE dbo.archive_monthly_reports
AS
BEGIN
    INSERT INTO dbo.report_archive (report_month, report_data)
    SELECT report_month, report_data FROM dbo.monthly_report;
END;