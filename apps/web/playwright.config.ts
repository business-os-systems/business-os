import { defineConfig } from "@playwright/test";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Release-gate runner (T124/T125/T129).
 *
 * The storefront and dashboard are the real Next.js applications. Only their
 * upstream data is replaced: the storefront reads a deterministic fixture API
 * and the dashboard's client API calls are fulfilled in-page. No test opens an
 * external network connection.
 */

const CONFIG_DIR = dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = resolve(CONFIG_DIR, "../..");
const WEB_PORT = 3003;
const DASHBOARD_PORT = 3001;
const FIXTURE_PORT = 4310;
const TENANT_HOST = "acme.localhost";
const SCRATCH_TENANT_DATABASE_URL =
  "postgresql://app_tenant:app_tenant_password@localhost:5432/business_os_wt357";

function readDeclaredEnv(filePath: string): Record<string, string> {
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
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write("Could not read " + filePath + ": " + message + "\n");
    return {};
  }
}

function buildServerEnv(overrides: Record<string, string>): Record<string, string> {
  const declared = { ...ROOT_ENV, ...process.env };
  const strings = Object.fromEntries(
    Object.entries(declared).filter((entry): entry is [string, string] => typeof entry[1] === "string")
  );
  return {
    ...strings,
    NODE_ENV: "development",
    DOMAIN_ROOT: "localhost",
    TENANT_DATABASE_URL: strings.TENANT_DATABASE_URL ?? SCRATCH_TENANT_DATABASE_URL,
    ...overrides,
  };
}

const ROOT_ENV = readDeclaredEnv(resolve(ROOT_DIR, ".env"));
for (const [key, value] of Object.entries(ROOT_ENV)) {
  if (process.env[key] === undefined) {
    process.env[key] = value;
  }
}

if (process.env.BETTER_AUTH_SECRET === undefined) {
  throw new Error(
    "BETTER_AUTH_SECRET must be pre-declared in the root .env or the CI environment for the release-gate session fixture."
  );
}

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: false,
  workers: 1,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI === undefined ? 0 : 1,
  timeout: 90_000,
  expect: { timeout: 15_000 },
  reporter: [
    ["list"],
    ["html", { outputFolder: "test-results/html", open: "never" }],
    ["json", { outputFile: "test-results/results.json" }],
  ],
  outputDir: "test-results/artifacts",
  use: {
    baseURL: "http://" + TENANT_HOST + ":" + String(WEB_PORT),
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    launchOptions: {
      args: ["--host-resolver-rules=MAP " + TENANT_HOST + " 127.0.0.1"],
    },
  },
  projects: [
    { name: "accessibility", testMatch: /accessibility\.spec\.ts/ },
    { name: "performance", testMatch: /performance\.spec\.ts/ },
    { name: "quickstart", testMatch: /quickstart\.spec\.ts/ },
  ],
  webServer: [
    {
      command: "node tests/e2e/fixtures/fixture-server.mjs",
      port: FIXTURE_PORT,
      reuseExistingServer: process.env.CI === undefined,
      timeout: 30_000,
      env: buildServerEnv({ NODE_ENV: "test", E2E_FIXTURE_PORT: String(FIXTURE_PORT) }),
    },
    {
      command: "pnpm build && pnpm start",
      port: WEB_PORT,
      reuseExistingServer: process.env.CI === undefined,
      timeout: 240_000,
      env: buildServerEnv({
        NODE_ENV: "production",
        API_URL: "http://127.0.0.1:" + String(FIXTURE_PORT),
        NEXT_PUBLIC_API_URL: "http://127.0.0.1:" + String(FIXTURE_PORT),
      }),
    },
    {
      command: "pnpm exec tsx ../../tooling/quality/e2e/setup-release-gates.ts && pnpm --filter @suite/dashboard dev",
      port: DASHBOARD_PORT,
      reuseExistingServer: process.env.CI === undefined,
      timeout: 240_000,
      env: buildServerEnv({
        API_URL: "http://127.0.0.1:" + String(FIXTURE_PORT),
        NEXT_PUBLIC_API_URL: "http://127.0.0.1:" + String(FIXTURE_PORT),
        APP_VERSION: "0.0.0-release-gates",
        GIT_COMMIT_SHA: "release-gate-fixture",
        BUILD_TIMESTAMP: "2026-11-11T00:00:00.000Z",
      }),
    },
  ],
});
