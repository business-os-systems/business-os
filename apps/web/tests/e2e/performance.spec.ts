import { test, expect } from "@playwright/test";
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import { EVIDENCE_DIR, writePerfResults } from "./helpers/evidence";
import {
  installMetricObservers,
  measureInteraction,
  percentile95,
  readStorefrontMetrics,
} from "./helpers/release-metrics";
import { DASHBOARD_ORIGIN, installTenantSession } from "./helpers/session";
import {
  FIXTURE_PAGE_ID,
  FIXTURE_SITE_ID,
  mockDashboardApi,
} from "./helpers/dashboard-fixtures";

test.describe.configure({ mode: "serial" });

const STUDIO_PATH = "/dashboard/sites/" + FIXTURE_SITE_ID + "/studio/" + FIXTURE_PAGE_ID;
const REVIEW_PATH = "/dashboard/sites/" + FIXTURE_SITE_ID + "/review";
const INQUIRIES_PATH = "/dashboard/websites/inquiries";
const RESULTS_PATH = resolve(EVIDENCE_DIR, "perf-results.json");
const REPORT_PATH = resolve(EVIDENCE_DIR, "perf-report.json");
const BUDGETS_PATH = resolve(process.cwd(), "../../tooling/quality/perf-budgets.json");
const VALIDATOR_PATH = resolve(process.cwd(), "../../tooling/quality/validate-perf-budgets.mjs");

const measured: Record<string, unknown> = {};

async function captureStorefront(
  page: import("@playwright/test").Page,
  surface: string,
  path: string,
  ready: () => Promise<void>
): Promise<void> {
  await installMetricObservers(page);
  await page.goto(path, { waitUntil: "networkidle" });
  await ready();
  measured[surface] = await readStorefrontMetrics(page);
}

test("storefront home stays inside its page budget", async ({ page }) => {
  await captureStorefront(page, "storefront-home", "/", async () => {
    await expect(page.locator("main[data-cms-page]")).toBeVisible();
  });
});

test("storefront secondary page stays inside its page budget", async ({ page }) => {
  await captureStorefront(page, "storefront-about", "/about", async () => {
    await expect(page.getByRole("heading", { name: "A small studio with a long view" })).toBeVisible();
  });
});

test("storefront contact page stays inside its page budget", async ({ page }) => {
  await captureStorefront(page, "storefront-contact", "/contact", async () => {
    await expect(page.getByRole("heading", { name: "Tell us about your project" })).toBeVisible();
  });
});

test("holding page stays inside its page budget", async ({ page }) => {
  await captureStorefront(page, "storefront-not-found", "/unpublished-page", async () => {
    await expect(page.getByRole("heading", { name: "This website is not available right now." })).toBeVisible();
  });
});

test("studio page selection meets the dashboard interaction budget", async ({ page, context }) => {
  await installTenantSession(context);
  await mockDashboardApi(page);
  await page.goto(DASHBOARD_ORIGIN + STUDIO_PATH);
  await expect(page.getByRole("link", { name: "Exit studio" })).toBeVisible();

  const durations: number[] = [];
  for (let index = 0; index < 6; index += 1) {
    const targetPath = index % 2 === 0 ? "**/fixture-page-about" : "**/fixture-page-home";
    const targetName = index % 2 === 0 ? /About/ : /Home/;
    const interaction = await measureInteraction(page, async () => {
      await Promise.all([
        page.waitForURL(targetPath),
        page.getByRole("button", { name: targetName }).first().click(),
      ]);
      await expect(page.getByRole("region", { name: "Canvas" })).toBeVisible();
    });
    durations.push(interaction.durationMs);
  }
  measured["dashboard-studio"] = { interactionP95Ms: percentile95(durations) };
});

test("review view toggle meets the dashboard interaction budget", async ({ page, context }) => {
  await installTenantSession(context);
  await mockDashboardApi(page);
  await page.goto(DASHBOARD_ORIGIN + REVIEW_PATH);
  await expect(page.getByRole("heading", { name: "Review & publish" })).toBeVisible();

  const durations: number[] = [];
  for (let index = 0; index < 8; index += 1) {
    const label = index % 2 === 0 ? "Live site" : "Pending changes";
    const interaction = await measureInteraction(page, async () => {
      const control = page.getByRole("button", { name: label, exact: true });
      await control.click();
      await expect(control).toHaveAttribute("aria-pressed", "true");
    });
    durations.push(interaction.durationMs);
  }
  measured["dashboard-review"] = { interactionP95Ms: percentile95(durations) };
});

test("inquiry filter meets the dashboard interaction budget", async ({ page, context }) => {
  await installTenantSession(context);
  await mockDashboardApi(page);
  await page.goto(DASHBOARD_ORIGIN + INQUIRIES_PATH);
  await expect(page.getByRole("heading", { name: "Inquiries", level: 1 })).toBeVisible();

  const durations: number[] = [];
  for (let index = 0; index < 6; index += 1) {
    const label = index % 2 === 0 ? "Read" : "Archived";
    const interaction = await measureInteraction(page, async () => {
      await Promise.all([
        page.waitForResponse((response) => response.url().includes("/api/cms/inquiries?")),
        (async () => {
          await page.locator('button[aria-label^="Status:"]').click();
          await page.getByRole("option", { name: label }).click();
        })(),
      ]);
    });
    durations.push(interaction.durationMs);
  }
  measured["dashboard-inquiries"] = { interactionP95Ms: percentile95(durations) };
});

test("the measured values pass the declared performance budgets", () => {
  writePerfResults({
    generatedAt: new Date().toISOString(),
    surfaces: measured,
  });
  const result = spawnSync(
    process.execPath,
    [
      VALIDATOR_PATH,
      "--budgets",
      BUDGETS_PATH,
      "--results",
      RESULTS_PATH,
      "--report",
      REPORT_PATH,
    ],
    { encoding: "utf8" }
  );
  expect(result.status, result.stdout + result.stderr).toBe(0);
  expect(result.stdout).toContain("result: PASS");
});
