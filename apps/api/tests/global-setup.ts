import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { PrismaClient } from "@suite/db";

const CORRECTION = fileURLToPath(
  new URL(
    "../../../packages/db/prisma/schema/migrations/20261111190000_platform_usage_media_storage_fix/migration.sql",
    import.meta.url
  )
);

/**
 * The API suites read platform.v_tenant_usage for media quota assertions. A
 * database that recorded an earlier view revision must be corrected before the
 * suites run, so the harness applies the forward-only correction to the same
 * DATABASE_URL the tests use. Production receives the same SQL through
 * migration deploy.
 */
export default async function setup(): Promise<void> {
  const url = process.env.DATABASE_URL;
  if (url === undefined) return;

  const sql = readFileSync(CORRECTION, "utf8");
  const view = /CREATE OR REPLACE VIEW[\s\S]*?;\s*\n/.exec(sql)?.[0];
  if (view === undefined) {
    throw new Error("The usage projection correction has no CREATE OR REPLACE VIEW statement.");
  }

  const prisma = new PrismaClient({ datasources: { db: { url } } });
  try {
    await prisma.$executeRawUnsafe(view);
  } finally {
    await prisma.$disconnect();
  }
}
