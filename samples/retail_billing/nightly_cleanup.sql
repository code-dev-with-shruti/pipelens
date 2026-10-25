CREATE PROCEDURE dbo.nightly_cleanup
AS
BEGIN
    DELETE FROM dbo.expired_sessions;

    INSERT INTO dbo.audit_log (event_name)
    SELECT cleanup_name FROM dbo.cleanup_policy;
END;