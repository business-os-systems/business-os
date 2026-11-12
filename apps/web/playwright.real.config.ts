import { defineConfig } from "@playwright/test";
import { REAL_JOURNEY_PORTS } from "./tests/e2e-real/helpers/journey-environment";
import { buildJourneyServerEnvironment } from "./tests/e2e-real/helpers/server-environment";

/**
 * Real-API first-website journey (#379, T180).
 *
 * Unlike the release-gate config, nothing here is fulfilled in the page: the
 * API, the dashboard and the storefront are the real applications, and they
 * read and write the scratch database provisioned by
 *   pnpm exec tsx tooling/quality/e2e/scripts/provision-real-journey-database.ts
 * The project fails before the first assertion when that database or the
 * declared secrets are missing.
 *
 *   pnpm --filter @suite/web exec playwright test -c playwright.real.config.ts
 *
 * Ports are dedicated so a running development stack is never reused, and the
 * tenant host is generated per run, so no fixed site or origin is baked in.
 */

const API_PORT = REAL_JOURNEY_PORTS.api;
const DASHBOARD_PORT = REAL_JOURNEY_PORTS.dashboard;
const WEB_PORT = REAL_JOURNEY_PORTS.web;
const SERVERS = "pnpm";

export default defineConfig({
  testDir: "./tests/e2e-real",
  fullyParallel: false,
  workers: 1,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI === undefined ? 0 : 1,
  timeout: 180_000,
  expect: { timeout: 20_000 },
  reporter: [
    ["list"],
    ["html", { outputFolder: "test-results/real-journey-html", open: "never" }],
    ["json", { outputFile: "test-results/real-journey-results.json" }],
  ],
  outputDir: "test-results/real-journey-artifacts",
  use: {
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "off",
  },
  projects: [{ name: "real-journey", testMatch: /.*\.spec\.ts/ }],
  webServer: [
    {
      command: SERVERS + " --filter @suite/api exec tsx src/server.ts",
      port: API_PORT,
      reuseExistingServer: false,
      timeout: 180_000,
      env: buildJourneyServerEnvironment({ PORT: String(API_PORT) }),
    },
    {
      command: SERVERS + " --filter @suite/dashboard exec next dev -p " + String(DASHBOARD_PORT),
      port: DASHBOARD_PORT,
      reuseExistingServer: false,
      timeout: 300_000,
      env: buildJourneyServerEnvironment({}),
    },
    {
      // The storefront renders published pages through the real renderer,
      // which needs the server build: the development bundle cannot load the
      // sanitizer's jsdom stylesheet. CI builds it in the job before this runs.
      command: SERVERS + " --filter @suite/web exec next start -p " + String(WEB_PORT),
      port: WEB_PORT,
      reuseExistingServer: false,
      timeout: 300_000,
      env: buildJourneyServerEnvironment({ NODE_ENV: "production" }),
    },
  ],
});
