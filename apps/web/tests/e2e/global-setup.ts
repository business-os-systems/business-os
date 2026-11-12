import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Playwright global setup (OP-12).
 *
 * The studio, review and media screens are gated on the tenant's installed
 * application (#373), so the fixture tenant must exist in the database the
 * dashboard server reads before any scenario runs. The seed is idempotent and
 * runs through the same command the release-gate job uses; a project without a
 * database is a no-op.
 */
const REPO_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../../.."
);

export default function globalSetup(): void {
  const tenantDatabaseUrl = process.env.TENANT_DATABASE_URL;
  if (tenantDatabaseUrl === undefined || tenantDatabaseUrl === "") {
    return;
  }
  execFileSync(
    "pnpm",
    ["exec", "tsx", "tooling/quality/e2e/setup-release-gates.ts"],
    { cwd: REPO_ROOT, stdio: "inherit", env: process.env }
  );
}
