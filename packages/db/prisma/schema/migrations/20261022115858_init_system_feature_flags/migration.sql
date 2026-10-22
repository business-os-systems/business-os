-- DropForeignKey
ALTER TABLE "cms_sites" DROP CONSTRAINT "cms_sites_branchId_fkey";

-- DropForeignKey
ALTER TABLE "cms_sites" DROP CONSTRAINT "cms_sites_organizationId_fkey";

-- DropIndex
DROP INDEX "cms_form_submissions_created_at_brin_idx";

-- CreateTable
CREATE TABLE "system_feature_flags" (
    "id" TEXT NOT NULL,
    "key" VARCHAR(64) NOT NULL,
    "name" VARCHAR(128) NOT NULL,
    "description" VARCHAR(255),
    "environment" VARCHAR(32) NOT NULL DEFAULT 'development',
    "isEnabled" BOOLEAN NOT NULL DEFAULT true,
    "defaultEnabled" BOOLEAN NOT NULL DEFAULT false,
    "version" INTEGER NOT NULL DEFAULT 1,
    "metadata" JSONB DEFAULT '{}',
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "system_feature_flags_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "system_feature_flag_rules" (
    "id" TEXT NOT NULL,
    "flag_id" TEXT NOT NULL,
    "rule_type" VARCHAR(32) NOT NULL,
    "target_id" VARCHAR(128) NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "priority" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "system_feature_flag_rules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "system_feature_flag_audit_logs" (
    "id" TEXT NOT NULL,
    "flag_id" TEXT NOT NULL,
    "flag_key" VARCHAR(64) NOT NULL,
    "environment" VARCHAR(32) NOT NULL,
    "actor_user_id" VARCHAR(64),
    "actor_email" VARCHAR(255),
    "source" VARCHAR(32) NOT NULL DEFAULT 'API',
    "previous_state" JSONB NOT NULL,
    "new_state" JSONB NOT NULL,
    "reason" VARCHAR(255),
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "system_feature_flag_audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "system_feature_flags_environment_idx" ON "system_feature_flags"("environment");

-- CreateIndex
CREATE INDEX "system_feature_flags_key_idx" ON "system_feature_flags"("key");

-- CreateIndex
CREATE UNIQUE INDEX "system_feature_flags_environment_key_key" ON "system_feature_flags"("environment", "key");

-- CreateIndex
CREATE INDEX "system_feature_flag_rules_flag_id_idx" ON "system_feature_flag_rules"("flag_id");

-- CreateIndex
CREATE INDEX "system_feature_flag_rules_rule_type_target_id_idx" ON "system_feature_flag_rules"("rule_type", "target_id");

-- CreateIndex
CREATE INDEX "system_feature_flag_audit_logs_flag_id_idx" ON "system_feature_flag_audit_logs"("flag_id");

-- CreateIndex
CREATE INDEX "system_feature_flag_audit_logs_flag_key_environment_idx" ON "system_feature_flag_audit_logs"("flag_key", "environment");

-- CreateIndex
CREATE INDEX "system_feature_flag_audit_logs_createdAt_idx" ON "system_feature_flag_audit_logs"("createdAt");

-- AddForeignKey
ALTER TABLE "system_feature_flag_rules" ADD CONSTRAINT "system_feature_flag_rules_flag_id_fkey" FOREIGN KEY ("flag_id") REFERENCES "system_feature_flags"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "system_feature_flag_audit_logs" ADD CONSTRAINT "system_feature_flag_audit_logs_flag_id_fkey" FOREIGN KEY ("flag_id") REFERENCES "system_feature_flags"("id") ON DELETE CASCADE ON UPDATE CASCADE;
