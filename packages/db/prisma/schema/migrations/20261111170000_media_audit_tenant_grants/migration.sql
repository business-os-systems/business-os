-- ==============================================================================
-- Tenant audit append for shared media (#356, DB-1, DB-2, XV.4)
--
-- The media capability appends its audit rows inside the mutation transaction
-- as the app_tenant runtime identity. audit_logs had never been granted to that
-- identity, so every media usage registration failed with 42501. This forward-
-- only migration grants append/read only, scoped by an RLS policy to the
-- organization in the transaction GUC. UPDATE and DELETE stay revoked.
-- ==============================================================================

SET lock_timeout = '5s';

ALTER TABLE "audit_logs" ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE schemaname = 'public'
          AND tablename = 'audit_logs'
          AND policyname = 'audit_logs_tenant_append'
    ) THEN
        CREATE POLICY "audit_logs_tenant_append" ON "audit_logs"
            FOR ALL
            USING ("organizationId" = CURRENT_SETTING('app.current_organization_id', true))
            WITH CHECK ("organizationId" = CURRENT_SETTING('app.current_organization_id', true));
    END IF;
END $$;

REVOKE ALL ON TABLE "audit_logs" FROM PUBLIC;
REVOKE ALL ON TABLE "audit_logs" FROM app_tenant;
GRANT SELECT, INSERT ON TABLE "audit_logs" TO app_tenant;
