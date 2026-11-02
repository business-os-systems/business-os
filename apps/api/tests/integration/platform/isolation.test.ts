import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PrismaClient } from "@suite/db";

function loadLocalPlatformEnv(): void {
  const envPath = resolve(process.cwd(), ".env");
  if (!existsSync(envPath)) return;
  const keys = new Set(["TENANT_DATABASE_URL"]);
  for (const line of readFileSync(envPath, "utf8").split("\n")) {
    const trimmed = line.trim();
    if (trimmed === "" || trimmed.startsWith("#") || !trimmed.includes("=")) {
      continue;
    }
    const separator = trimmed.indexOf("=");
    const key = trimmed.slice(0, separator).trim();
    if (!keys.has(key) || process.env[key] !== undefined) continue;
    process.env[key] = trimmed
      .slice(separator + 1)
      .trim()
      .replace(/^["']|["']$/g, "");
  }
}

loadLocalPlatformEnv();

const tenantDatabaseUrl = process.env.TENANT_DATABASE_URL;
const enabled = Boolean(tenantDatabaseUrl);

describe.skipIf(!enabled)("Platform database boundary (DB-2)", () => {
  let tenantPrisma: PrismaClient;

  beforeAll(() => {
    tenantPrisma = new PrismaClient({
      datasourceUrl: tenantDatabaseUrl ?? "",
      log: ["error"],
    });
  });

  afterAll(async () => {
    await tenantPrisma.$disconnect();
  });

  it("denies the tenant identity access to platform.operators", async () => {
    await expect(
      tenantPrisma.$queryRawUnsafe(
        'SELECT "id" FROM "platform"."operators" LIMIT 1'
      )
    ).rejects.toThrow(/permission denied|42501/i);
  });

  it("denies the tenant identity access to platform.audit_events", async () => {
    await expect(
      tenantPrisma.$queryRawUnsafe(
        'SELECT "id" FROM "platform"."audit_events" LIMIT 1'
      )
    ).rejects.toThrow(/permission denied|42501/i);
  });

  it("reports no USAGE privilege on the platform schema", async () => {
    const rows = await tenantPrisma.$queryRawUnsafe<
      Array<{ allowed: boolean }>
    >("SELECT has_schema_privilege(current_user, 'platform', 'USAGE') AS allowed");

    expect(rows[0]?.allowed).toBe(false);
  });
});
