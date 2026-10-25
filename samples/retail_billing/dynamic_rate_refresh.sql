CREATE PROCEDURE dbo.dynamic_rate_refresh
AS
BEGIN
    DECLARE @sql NVARCHAR(MAX);
    SELECT @sql = command_text FROM dbo.rate_sources;
    EXEC(@sql);
END;