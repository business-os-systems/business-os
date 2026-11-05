-- P-15 (#224) convergence: the Platform flag API replaces a flag's targeting
-- rules transactionally, so app_platform needs DELETE on the rules table only.
-- Retention is declared on the audit table (OP-6) and pruned by the owner.

SET lock_timeout = '5s';

REVOKE ALL ON TABLE "system_feature_flag_rules" FROM PUBLIC;
REVOKE ALL ON TABLE "system_feature_flag_rules" FROM app_tenant;

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "system_feature_flag_rules" TO app_platform;
REVOKE TRUNCATE ON TABLE "system_feature_flag_rules" FROM app_platform;

COMMENT ON TABLE "system_feature_flags" IS
  'Control-plane feature flags. Owner, expiry and removal ticket are mandatory for new and updated rows (OP-8).';
COMMENT ON TABLE "system_feature_flag_audit_logs" IS
  'Flag mutation audit. Retain 24 months; prune with deploy/platform/prune-flag-audit-logs.sql (OP-6).';
