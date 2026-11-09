import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * Integration suites read the local .env once. Real CI supplies the variables
 * directly, so an absent file is not an error (OP-12: deterministic fixtures).
 */
const PLATFORM_TEST_KEYS = new Set([
  "DATABASE_URL",
  "DIRECT_URL",
  "PLATFORM_DATABASE_URL",
  "TENANT_DATABASE_URL",
  "CONTROL_SESSION_SECRET",
  "CONTROL_PLANE_ORIGIN",
  "IMPERSONATION_MAX_MINUTES",
  "CONTROL_WEBAUTHN_RP_ID",
  "APP_VERSION",
  "GIT_COMMIT_SHA",
  "BUILD_TIMESTAMP",
]);

export function loadPlatformTestEnv(): void {
  const envPath = resolve(process.cwd(), ".env");
  if (!existsSync(envPath)) {
    return;
  }

  for (const line of readFileSync(envPath, "utf8").split("\n")) {
    const trimmed = line.trim();
    if (trimmed === "" || trimmed.startsWith("#") || !trimmed.includes("=")) {
      continue;
    }
    const separator = trimmed.indexOf("=");
    const key = trimmed.slice(0, separator).trim();
    if (!PLATFORM_TEST_KEYS.has(key) || process.env[key] !== undefined) {
      continue;
    }
    process.env[key] = trimmed
      .slice(separator + 1)
      .trim()
      .replace(/^["']|["']$/g, "");
  }
}
