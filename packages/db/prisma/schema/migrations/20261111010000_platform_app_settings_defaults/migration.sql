-- ==============================================================================
-- App-level settings defaults (T018, FR-014)
--
-- Definitions stay in code; this table stores only values. The tenant override
-- remains InstalledApp.settings, so the resolver reads two stores and never a
-- second per-app settings store.
-- ==============================================================================

SET lock_timeout = '5s';

CREATE TABLE "platform"."app_settings_defaults" (
    "id" TEXT NOT NULL,
    "appId" VARCHAR(64) NOT NULL,
    "settings" JSONB NOT NULL DEFAULT '{}',
    "version" INTEGER NOT NULL DEFAULT 0,
    "updatedBy" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "app_settings_defaults_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "app_settings_defaults_appId_key"
  ON "platform"."app_settings_defaults"("appId");

ALTER TABLE "platform"."app_settings_defaults"
  ADD CONSTRAINT "app_settings_defaults_updatedBy_fkey"
  FOREIGN KEY ("updatedBy") REFERENCES "platform"."operators"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

COMMENT ON TABLE "platform"."app_settings_defaults"
  IS 'One row per application: validated default values resolved before tenant overrides.';

REVOKE ALL ON TABLE "platform"."app_settings_defaults" FROM PUBLIC;
REVOKE ALL ON TABLE "platform"."app_settings_defaults" FROM app_tenant;
GRANT SELECT, INSERT, UPDATE ON TABLE "platform"."app_settings_defaults" TO app_platform;
REVOKE DELETE, TRUNCATE ON TABLE "platform"."app_settings_defaults" FROM app_platform;
