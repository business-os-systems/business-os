-- Flag audit retention (OP-6). Manual owner fallback; the scheduled workflow
-- runs apps/api/scripts/prune-flag-audit.ts instead, because the API image is
-- built from a pruned workspace that does not carry the deploy directory.
-- The app_platform identity intentionally has no DELETE grant on the audit table.

DELETE FROM "system_feature_flag_audit_logs"
WHERE "createdAt" < now() - interval '24 months';
