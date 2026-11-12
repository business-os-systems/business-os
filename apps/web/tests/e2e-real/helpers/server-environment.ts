import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { REAL_JOURNEY_DOMAIN_ROOT, REAL_JOURNEY_PORTS } from "./journey-environment";

/**
 * Environment for the three servers the real-API journey boots (#379).
 *
 * The API, the dashboard and the storefront read the same declared variables
 * the development stack reads; only the API address, the ports and the origin
 * whitelist change, so the journey cannot pass by configuring something the
 * real deployment never sets.
 */

const WORKSPACE_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../../../../..");

export const REAL_JOURNEY_API_ORIGIN = "http://127.0.0.1:" + String(REAL_JOURNEY_PORTS.api);
export const REAL_JOURNEY_DASHBOARD_URL = "http://localhost:" + String(REAL_JOURNEY_PORTS.dashboard);

/**
 * The journey host carries a per-run suffix, so the whitelist matches the host
 * pattern rather than one literal origin. The API's matcher supports a single
 * wildcard label by design.
 */
const JOURNEY_BROWSER_ORIGINS = [
  "http://*." + REAL_JOURNEY_DOMAIN_ROOT + ":" + String(REAL_JOURNEY_PORTS.dashboard),
  "http://*." + REAL_JOURNEY_DOMAIN_ROOT + ":" + String(REAL_JOURNEY_PORTS.web),
  "http://localhost:" + String(REAL_JOURNEY_PORTS.dashboard),
  "http://localhost:" + String(REAL_JOURNEY_PORTS.web),
] as const;

function isMissingFileError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    Reflect.get(error, "code") === "ENOENT"
  );
}

function readDeclaredEnvFile(filePath: string): Record<string, string> {
  try {
    const content = readFileSync(filePath, "utf8");
    const entries: Record<string, string> = {};
    for (const line of content.split("\n")) {
      const match = /^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/.exec(line.trim());
      if (match === null) continue;
      const [, key, rawValue] = match;
      if (key === undefined || rawValue === undefined) continue;
      entries[key] = rawValue.replace(/^['"]|['"]$/g, "");
    }
    return entries;
  } catch (error: unknown) {
    // A worktree has no .env of its own: the caller exports the variables.
    if (isMissingFileError(error)) {
      return {};
    }
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write("Could not read " + filePath + ": " + message + "\n");
    return {};
  }
}

const ROOT_ENV = readDeclaredEnvFile(resolve(WORKSPACE_ROOT, ".env"));

function declaredEnvironmentStrings(): Record<string, string> {
  const declared = { ...ROOT_ENV, ...process.env };
  return Object.fromEntries(
    Object.entries(declared).filter(
      (entry): entry is [string, string] => typeof entry[1] === "string"
    )
  );
}

export function buildJourneyServerEnvironment(
  overrides: Record<string, string>
): Record<string, string> {
  return {
    ...declaredEnvironmentStrings(),
    NODE_ENV: "development",
    DOMAIN_ROOT: REAL_JOURNEY_DOMAIN_ROOT,
    API_URL: REAL_JOURNEY_API_ORIGIN,
    NEXT_PUBLIC_API_URL: REAL_JOURNEY_API_ORIGIN,
    DASHBOARD_URL: REAL_JOURNEY_DASHBOARD_URL,
    CORS_ALLOWED_ORIGINS: JOURNEY_BROWSER_ORIGINS.join(","),
    // The dashboard delivers verification mail to the local drop in this
    // project, which is exactly what the journey proves a tester can read.
    EMAIL_PROVIDER: "capture",
    ...overrides,
  };
}
