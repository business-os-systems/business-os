-- ==============================================================================
-- Platform and Reference foundation (T013, T014)
-- Creates two schemas, three enums, thirteen tables, runtime roles and grants.
-- Forward-only; no data backfill.
-- ==============================================================================

-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "platform";

-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "reference";

-- CreateEnum
CREATE TYPE "platform"."PlatformOperatorStatus" AS ENUM ('INVITED', 'ACTIVE', 'SUSPENDED', 'REVOKED');

-- CreateEnum
CREATE TYPE "platform"."PlatformAppAvailability" AS ENUM ('HIDDEN', 'PREVIEW', 'AVAILABLE', 'RETIRED');

-- CreateEnum
CREATE TYPE "platform"."PlatformOutboxStatus" AS ENUM ('PENDING', 'PROCESSING', 'DONE', 'DEAD');

-- CreateTable
CREATE TABLE "platform"."operators" (
    "id" TEXT NOT NULL,
    "email" VARCHAR(191) NOT NULL,
    "displayName" VARCHAR(100) NOT NULL,
    "status" "platform"."PlatformOperatorStatus" NOT NULL DEFAULT 'INVITED',
    "mfaEnrolled" BOOLEAN NOT NULL DEFAULT false,
    "invitedBy" TEXT,
    "lastSeenAt" TIMESTAMPTZ(6),
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "operators_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "platform"."operator_passkeys" (
    "id" TEXT NOT NULL,
    "operatorId" TEXT NOT NULL,
    "credentialId" TEXT NOT NULL,
    "publicKey" TEXT NOT NULL,
    "counter" INTEGER NOT NULL DEFAULT 0,
    "deviceType" VARCHAR(32),
    "backedUp" BOOLEAN NOT NULL DEFAULT false,
    "transports" VARCHAR(255),
    "name" VARCHAR(100),
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastUsedAt" TIMESTAMPTZ(6),

    CONSTRAINT "operator_passkeys_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "platform"."operator_sessions" (
    "id" TEXT NOT NULL,
    "operatorId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "issuedAt" TIMESTAMPTZ(6) NOT NULL,
    "expiresAt" TIMESTAMPTZ(6) NOT NULL,
    "idleExpiresAt" TIMESTAMPTZ(6) NOT NULL,
    "revokedAt" TIMESTAMPTZ(6),
    "ip" INET,
    "userAgent" TEXT,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "operator_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "platform"."operator_capabilities" (
    "id" TEXT NOT NULL,
    "operatorId" TEXT NOT NULL,
    "capability" VARCHAR(64) NOT NULL,
    "grantedBy" TEXT,
    "grantedAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revokedAt" TIMESTAMPTZ(6),

    CONSTRAINT "operator_capabilities_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "platform"."operator_invitations" (
    "id" TEXT NOT NULL,
    "email" VARCHAR(191) NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "invitedBy" TEXT NOT NULL,
    "expiresAt" TIMESTAMPTZ(6) NOT NULL,
    "acceptedAt" TIMESTAMPTZ(6),
    "revokedAt" TIMESTAMPTZ(6),
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "operator_invitations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "platform"."lifecycle_events" (
    "id" TEXT NOT NULL,
    "organizationId" VARCHAR(191) NOT NULL,
    "fromStatus" VARCHAR(16) NOT NULL,
    "toStatus" VARCHAR(16) NOT NULL,
    "reason" VARCHAR(255) NOT NULL,
    "actorOperatorId" TEXT NOT NULL,
    "requestId" VARCHAR(64) NOT NULL,
    "occurredAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "lifecycle_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "platform"."quotas" (
    "id" TEXT NOT NULL,
    "organizationId" VARCHAR(191) NOT NULL,
    "resourceKey" VARCHAR(64) NOT NULL,
    "limitValue" BIGINT NOT NULL,
    "isEnforced" BOOLEAN NOT NULL DEFAULT true,
    "updatedBy" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "quotas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "platform"."app_overrides" (
    "id" TEXT NOT NULL,
    "appId" VARCHAR(64) NOT NULL,
    "availability" "platform"."PlatformAppAvailability" NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "category" VARCHAR(64),
    "updatedBy" TEXT NOT NULL,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "app_overrides_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "platform"."impersonation_sessions" (
    "id" TEXT NOT NULL,
    "ticketId" UUID NOT NULL,
    "operatorId" TEXT NOT NULL,
    "organizationId" VARCHAR(191) NOT NULL,
    "targetUserId" VARCHAR(191),
    "reason" VARCHAR(255) NOT NULL,
    "ticketRef" VARCHAR(100) NOT NULL,
    "startedAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMPTZ(6) NOT NULL,
    "endedAt" TIMESTAMPTZ(6),
    "endedBy" VARCHAR(191),
    "ip" INET,
    "userAgent" TEXT,

    CONSTRAINT "impersonation_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "platform"."audit_events" (
    "id" TEXT NOT NULL,
    "actorOperatorId" TEXT,
    "action" VARCHAR(64) NOT NULL,
    "entityType" VARCHAR(64) NOT NULL,
    "entityId" VARCHAR(128) NOT NULL,
    "organizationId" VARCHAR(191),
    "before" JSONB,
    "after" JSONB,
    "reason" VARCHAR(255),
    "requestId" VARCHAR(64) NOT NULL,
    "prevHash" VARCHAR(64),
    "recordHash" VARCHAR(64) NOT NULL,
    "occurredAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "platform"."outbox_events" (
    "id" TEXT NOT NULL,
    "eventType" VARCHAR(64) NOT NULL,
    "payload" JSONB NOT NULL,
    "status" "platform"."PlatformOutboxStatus" NOT NULL DEFAULT 'PENDING',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "availableAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processedAt" TIMESTAMPTZ(6),
    "lastError" TEXT,

    CONSTRAINT "outbox_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reference"."catalogs" (
    "key" VARCHAR(64) NOT NULL,
    "label" VARCHAR(100) NOT NULL,
    "description" TEXT,
    "isSystem" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "catalogs_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "reference"."catalog_values" (
    "id" TEXT NOT NULL,
    "catalogKey" VARCHAR(64) NOT NULL,
    "code" VARCHAR(64) NOT NULL,
    "label" VARCHAR(191) NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdBy" VARCHAR(191),
    "updatedBy" VARCHAR(191),
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "catalog_values_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "operators_email_key" ON "platform"."operators"("email");

-- CreateIndex
CREATE INDEX "operators_status_idx" ON "platform"."operators"("status");

-- CreateIndex
CREATE UNIQUE INDEX "operator_passkeys_credentialId_key" ON "platform"."operator_passkeys"("credentialId");

-- CreateIndex
CREATE INDEX "operator_passkeys_operatorId_idx" ON "platform"."operator_passkeys"("operatorId");

-- CreateIndex
CREATE UNIQUE INDEX "operator_sessions_tokenHash_key" ON "platform"."operator_sessions"("tokenHash");

-- CreateIndex
CREATE INDEX "operator_sessions_operatorId_revokedAt_idx" ON "platform"."operator_sessions"("operatorId", "revokedAt");

-- CreateIndex
CREATE INDEX "operator_sessions_expiresAt_idx" ON "platform"."operator_sessions"("expiresAt");

-- CreateIndex
CREATE INDEX "operator_capabilities_operatorId_revokedAt_idx" ON "platform"."operator_capabilities"("operatorId", "revokedAt");

-- CreateIndex
CREATE UNIQUE INDEX "operator_invitations_tokenHash_key" ON "platform"."operator_invitations"("tokenHash");

-- CreateIndex
CREATE INDEX "operator_invitations_email_expiresAt_idx" ON "platform"."operator_invitations"("email", "expiresAt");

-- CreateIndex
CREATE INDEX "lifecycle_events_organizationId_occurredAt_idx" ON "platform"."lifecycle_events"("organizationId", "occurredAt" DESC);

-- CreateIndex
CREATE INDEX "lifecycle_events_occurredAt_idx" ON "platform"."lifecycle_events"("occurredAt");

-- CreateIndex
CREATE UNIQUE INDEX "quotas_organizationId_resourceKey_key" ON "platform"."quotas"("organizationId", "resourceKey");

-- CreateIndex
CREATE UNIQUE INDEX "app_overrides_appId_key" ON "platform"."app_overrides"("appId");

-- CreateIndex
CREATE UNIQUE INDEX "impersonation_sessions_ticketId_key" ON "platform"."impersonation_sessions"("ticketId");

-- CreateIndex
CREATE INDEX "impersonation_sessions_organizationId_startedAt_idx" ON "platform"."impersonation_sessions"("organizationId", "startedAt" DESC);

-- CreateIndex
CREATE INDEX "impersonation_sessions_operatorId_startedAt_idx" ON "platform"."impersonation_sessions"("operatorId", "startedAt" DESC);

-- CreateIndex
CREATE INDEX "impersonation_sessions_expiresAt_idx" ON "platform"."impersonation_sessions"("expiresAt");

-- CreateIndex
CREATE INDEX "audit_events_occurredAt_idx" ON "platform"."audit_events"("occurredAt" DESC);

-- CreateIndex
CREATE INDEX "audit_events_organizationId_occurredAt_idx" ON "platform"."audit_events"("organizationId", "occurredAt" DESC);

-- CreateIndex
CREATE INDEX "audit_events_actorOperatorId_occurredAt_idx" ON "platform"."audit_events"("actorOperatorId", "occurredAt" DESC);

-- CreateIndex
CREATE INDEX "audit_events_action_occurredAt_idx" ON "platform"."audit_events"("action", "occurredAt" DESC);

-- CreateIndex
CREATE INDEX "outbox_events_status_availableAt_idx" ON "platform"."outbox_events"("status", "availableAt");

-- CreateIndex
CREATE INDEX "outbox_events_createdAt_idx" ON "platform"."outbox_events"("createdAt");

-- CreateIndex
CREATE INDEX "catalog_values_catalogKey_isActive_sortOrder_idx" ON "reference"."catalog_values"("catalogKey", "isActive", "sortOrder");

-- CreateIndex
CREATE UNIQUE INDEX "catalog_values_catalogKey_code_key" ON "reference"."catalog_values"("catalogKey", "code");

-- AddForeignKey
ALTER TABLE "platform"."operators" ADD CONSTRAINT "operators_invitedBy_fkey" FOREIGN KEY ("invitedBy") REFERENCES "platform"."operators"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "platform"."operator_passkeys" ADD CONSTRAINT "operator_passkeys_operatorId_fkey" FOREIGN KEY ("operatorId") REFERENCES "platform"."operators"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "platform"."operator_sessions" ADD CONSTRAINT "operator_sessions_operatorId_fkey" FOREIGN KEY ("operatorId") REFERENCES "platform"."operators"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "platform"."operator_capabilities" ADD CONSTRAINT "operator_capabilities_operatorId_fkey" FOREIGN KEY ("operatorId") REFERENCES "platform"."operators"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "platform"."operator_capabilities" ADD CONSTRAINT "operator_capabilities_grantedBy_fkey" FOREIGN KEY ("grantedBy") REFERENCES "platform"."operators"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "platform"."operator_invitations" ADD CONSTRAINT "operator_invitations_invitedBy_fkey" FOREIGN KEY ("invitedBy") REFERENCES "platform"."operators"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "platform"."lifecycle_events" ADD CONSTRAINT "lifecycle_events_actorOperatorId_fkey" FOREIGN KEY ("actorOperatorId") REFERENCES "platform"."operators"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "platform"."quotas" ADD CONSTRAINT "quotas_updatedBy_fkey" FOREIGN KEY ("updatedBy") REFERENCES "platform"."operators"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "platform"."app_overrides" ADD CONSTRAINT "app_overrides_updatedBy_fkey" FOREIGN KEY ("updatedBy") REFERENCES "platform"."operators"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "platform"."impersonation_sessions" ADD CONSTRAINT "impersonation_sessions_operatorId_fkey" FOREIGN KEY ("operatorId") REFERENCES "platform"."operators"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "platform"."audit_events" ADD CONSTRAINT "audit_events_actorOperatorId_fkey" FOREIGN KEY ("actorOperatorId") REFERENCES "platform"."operators"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reference"."catalog_values" ADD CONSTRAINT "catalog_values_catalogKey_fkey" FOREIGN KEY ("catalogKey") REFERENCES "reference"."catalogs"("key") ON DELETE RESTRICT ON UPDATE CASCADE;


-- ==============================================================================
-- Lower-case emails
-- Prisma has no citext scalar. A check constraint plus the unique index gives
-- the same case-insensitive uniqueness without schema drift.
-- ==============================================================================
ALTER TABLE "platform"."operators"
  ADD CONSTRAINT "operators_email_lowercase_check" CHECK ("email" = lower("email"));
ALTER TABLE "platform"."operator_invitations"
  ADD CONSTRAINT "operator_invitations_email_lowercase_check" CHECK ("email" = lower("email"));

-- ==============================================================================
-- Partial indexes Prisma cannot express
-- ==============================================================================
CREATE UNIQUE INDEX "operator_capabilities_operatorId_capability_active_key"
  ON "platform"."operator_capabilities" ("operatorId", "capability")
  WHERE "revokedAt" IS NULL;

CREATE INDEX "impersonation_sessions_expiresAt_active_idx"
  ON "platform"."impersonation_sessions" ("expiresAt")
  WHERE "endedAt" IS NULL;

-- ==============================================================================
-- Runtime roles (T014)
-- Passwords are set by the deployment secret store, never in a migration.
-- Roles are created idempotently because app_tenant may already exist.
-- ==============================================================================
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_platform') THEN
    CREATE ROLE app_platform LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_tenant') THEN
    CREATE ROLE app_tenant LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE;
  END IF;
END $$;

-- ==============================================================================
-- Grants (T014)
-- app_platform: platform + reference read/write, append-only tables are immutable.
-- app_tenant: no access to platform; reference is read-only and the view grant
-- lands with T015 when reference.v_active_catalog_values is created.
-- ==============================================================================
REVOKE ALL ON SCHEMA "platform" FROM PUBLIC;
REVOKE ALL ON SCHEMA "reference" FROM PUBLIC;

GRANT USAGE ON SCHEMA "platform" TO app_platform;
REVOKE ALL ON SCHEMA "platform" FROM app_tenant;
GRANT USAGE ON SCHEMA "reference" TO app_platform, app_tenant;

REVOKE ALL ON ALL TABLES IN SCHEMA "platform" FROM PUBLIC;
REVOKE ALL ON ALL TABLES IN SCHEMA "platform" FROM app_tenant;
REVOKE ALL ON ALL TABLES IN SCHEMA "reference" FROM PUBLIC;
REVOKE ALL ON ALL TABLES IN SCHEMA "reference" FROM app_tenant;

GRANT SELECT, INSERT, UPDATE ON ALL TABLES IN SCHEMA "platform" TO app_platform;
REVOKE UPDATE ON TABLE "platform"."audit_events", "platform"."lifecycle_events" FROM app_platform;
REVOKE DELETE, TRUNCATE ON ALL TABLES IN SCHEMA "platform" FROM app_platform;

GRANT SELECT, INSERT, UPDATE ON ALL TABLES IN SCHEMA "reference" TO app_platform;
REVOKE DELETE, TRUNCATE ON ALL TABLES IN SCHEMA "reference" FROM app_platform;
