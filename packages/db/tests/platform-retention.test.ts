import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  PLATFORM_RETENTION,
  UnknownRetentionPolicyError,
  getPlatformRetentionPolicy,
} from "../src/platform-retention.js";
import { parsePrismaModels } from "./helpers/prisma-schema.js";

const PACKAGE_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const PRISMA_DIR = join(PACKAGE_ROOT, "prisma/schema");
const REPO_ROOT = resolve(PACKAGE_ROOT, "../..");

const PLATFORM_TABLES = [
  ...parsePrismaModels(join(PRISMA_DIR, "platform.prisma")),
  ...parsePrismaModels(join(PRISMA_DIR, "feature-flags.prisma")),
].map((model) => model.table);

const CMS_TABLES = parsePrismaModels(join(PRISMA_DIR, "cms.prisma")).map(
  (model) => model.table,
);

describe("platform retention declarations", () => {
  it("declares a policy for every Platform-owned and cms table", () => {
    const policyTables = new Set<string>(PLATFORM_RETENTION.map((policy) => policy.table));
    for (const table of [...PLATFORM_TABLES, ...CMS_TABLES]) {
      expect(policyTables.has(table), `Missing retention policy: ${table}`).toBe(true);
    }
    expect(policyTables.size).toBe(PLATFORM_RETENTION.length);
  });

  it("declares a cms retention window with a non-retain disposition for personal data", () => {
    for (const table of CMS_TABLES) {
      const policy = getPlatformRetentionPolicy(table);
      expect(policy.enforcedBy.trim().length, table).toBeGreaterThan(0);
      if (policy.personalData) {
        expect(policy.disposition, table).not.toBe("retain");
      }
    }
  });

  it("gives every policy a retention window, basis and enforcement path", () => {
    for (const policy of PLATFORM_RETENTION) {
      expect(policy.retention.trim().length, policy.table).toBeGreaterThan(0);
      expect(policy.basis.trim().length, policy.table).toBeGreaterThan(0);
      expect(policy.enforcedBy.trim().length, policy.table).toBeGreaterThan(0);
    }
  });

  it("never retains personal data indefinitely", () => {
    for (const policy of PLATFORM_RETENTION) {
      if (!policy.personalData) {
        continue;
      }
      expect(policy.disposition, policy.table).not.toBe("retain");
      expect(policy.retention.toLowerCase(), policy.table).not.toContain("indefinite");
    }
  });

  it("keeps the audit chain archive-then-delete, never a plain delete", () => {
    const policy = getPlatformRetentionPolicy("audit_events");
    expect(policy.disposition).toBe("archive_then_delete");
    expect(policy.personalData).toBe(true);
  });

  it("declares retention for the shared media tables (T022, OP-6)", () => {
    const assets = getPlatformRetentionPolicy("media_assets");
    expect(assets.disposition).toBe("delete");
    expect(assets.personalData).toBe(true);
    expect(assets.enforcedBy).toContain("DELETE /api/v1/media/assets/{id}");

    const usages = getPlatformRetentionPolicy("media_usages");
    expect(usages.disposition).toBe("delete");
    expect(usages.personalData).toBe(false);
  });
});

describe("platform retention enforcement", () => {
  it("has an owner prune path for the flag audit log", () => {
    const policy = getPlatformRetentionPolicy("system_feature_flag_audit_logs");
    const apiScript = join(REPO_ROOT, "apps/api/scripts/prune-flag-audit.ts");
    const sqlScript = join(REPO_ROOT, "deploy/platform/prune-flag-audit-logs.sql");
    const workflow = join(REPO_ROOT, ".github/workflows/prune-flag-audit.yml");

    expect(policy.disposition).toBe("delete");
    expect(existsSync(apiScript)).toBe(true);
    expect(existsSync(sqlScript)).toBe(true);
    expect(existsSync(workflow)).toBe(true);
    expect(readFileSync(apiScript, "utf8")).toContain("RETENTION_MONTHS = 24");
    expect(readFileSync(sqlScript, "utf8")).toContain("interval '24 months'");
    expect(readFileSync(workflow, "utf8")).toContain("prune-flag-audit");
  });

  it("fails loudly for a table without a retention policy", () => {
    expect(() => getPlatformRetentionPolicy("missing_table")).toThrow(UnknownRetentionPolicyError);
  });
});
