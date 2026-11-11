import { test, expect } from "@playwright/test";
import { readFocus, scanPage, tabTo } from "./helpers/a11y";
import { DASHBOARD_ORIGIN, installTenantSession } from "./helpers/session";
import {
  FIXTURE_PAGE_ID,
  FIXTURE_SITE_ID,
  mockDashboardApi,
} from "./helpers/dashboard-fixtures";

const STUDIO_PATH = "/dashboard/sites/" + FIXTURE_SITE_ID + "/studio/" + FIXTURE_PAGE_ID;
const REVIEW_PATH = "/dashboard/sites/" + FIXTURE_SITE_ID + "/review";
const INQUIRIES_PATH = "/dashboard/websites/inquiries";

test.describe("storefront accessibility", () => {
  test("home page passes WCAG A/AA and is keyboard operably navigable", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator("main[data-cms-page]")).toBeVisible();
    const summary = await scanPage(page, "storefront-home", "/");
    expect(summary.violationCount, summary.violationIds.join(", ")).toBe(0);

    await page.keyboard.press("Tab");
    await expect(page.getByRole("link", { name: "Home" })).toBeFocused();
    const reachedAbout = await tabTo(page, (focus) => focus.text === "About");
    expect(reachedAbout).toBe(true);
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(/\/about$/);
  });

  test("secondary page passes WCAG A/AA", async ({ page }) => {
    await page.goto("/about");
    await expect(page.getByRole("heading", { name: "A small studio with a long view" })).toBeVisible();
    const summary = await scanPage(page, "storefront-about", "/about");
    expect(summary.violationCount, summary.violationIds.join(", ")).toBe(0);
  });

  test("contact page passes WCAG A/AA and its form is reachable by keyboard", async ({ page }) => {
    await page.goto("/contact");
    await expect(page.getByRole("heading", { name: "Tell us about your project" })).toBeVisible();
    const summary = await scanPage(page, "storefront-contact", "/contact");
    expect(summary.violationCount, summary.violationIds.join(", ")).toBe(0);

    const reachedName = await tabTo(page, (focus) => focus.id === "name", 60);
    expect(reachedName).toBe(true);
    await expect(page.getByLabel("Your name")).toBeFocused();
  });
});

test.describe("holding and review surfaces", () => {
  test("holding page passes WCAG A/AA and exposes no keyboard trap", async ({ page }) => {
    await page.goto("/unpublished-page");
    await expect(page.getByRole("heading", { name: "Website unavailable" })).toBeVisible();
    await expect(page.getByText("This website is no longer available.")).toBeVisible();
    const summary = await scanPage(page, "storefront-not-found", "/unpublished-page");
    expect(summary.violationCount, summary.violationIds.join(", ")).toBe(0);
    await expect(page.getByRole("main")).toHaveCount(1);
    const focusables = await page
      .locator("a, button, input, select, textarea, [tabindex]:not([tabindex='-1'])")
      .count();
    expect(focusables).toBeLessThanOrEqual(1);
  });

  test("review passes WCAG A/AA and publish is reachable by keyboard", async ({ page, context }) => {
    await installTenantSession(context);
    await mockDashboardApi(page);
    await page.goto(DASHBOARD_ORIGIN + REVIEW_PATH);
    await expect(page.getByRole("heading", { name: "Review & publish" })).toBeVisible();
    await expect(page.getByTestId("review-publish-control")).toBeVisible();
    const summary = await scanPage(page, "dashboard-review", REVIEW_PATH);
    expect(summary.violationCount, summary.violationIds.join(", ")).toBe(0);

    const reachedPublish = await tabTo(
      page,
      (focus) => focus.text.includes("Publish live"),
      30
    );
    expect(reachedPublish).toBe(true);
    await page.keyboard.press("Enter");
    await expect(page.getByText("Published 1 page(s)")).toBeVisible();
  });
});

test.describe("workspace accessibility", () => {
  test("studio passes WCAG A/AA and its page tree is keyboard reachable", async ({ page, context }) => {
    await installTenantSession(context);
    await mockDashboardApi(page);
    await page.goto(DASHBOARD_ORIGIN + STUDIO_PATH);
    await expect(page.getByRole("link", { name: "Exit studio" })).toBeVisible();
    const summary = await scanPage(page, "dashboard-studio", STUDIO_PATH);
    expect(summary.violationCount, summary.violationIds.join(", ")).toBe(0);

    await page.keyboard.press("Tab");
    await expect(page.getByRole("link", { name: "Exit studio" })).toBeFocused();
    const reachedPageTree = await tabTo(page, (focus) => focus.text.includes("Home"), 30);
    expect(reachedPageTree).toBe(true);
  });

  test("inquiries pass WCAG A/AA and the filters are keyboard reachable", async ({ page, context }) => {
    await installTenantSession(context);
    await mockDashboardApi(page);
    await page.goto(DASHBOARD_ORIGIN + INQUIRIES_PATH);
    await expect(page.getByRole("heading", { name: "Inquiries", level: 1 })).toBeVisible();
    const summary = await scanPage(page, "dashboard-inquiries", INQUIRIES_PATH);
    expect(summary.violationCount, summary.violationIds.join(", ")).toBe(0);

    const reachedFilters = await tabTo(
      page,
      (focus) => focus.ariaLabel?.startsWith("Status") ?? false,
      120
    );
    expect(reachedFilters).toBe(true);
    await expect(page.locator('button[aria-label^="Status"]')).toBeFocused();
  });
});

test.describe("scanner proof", () => {
  test("axe reports a known-violation fixture, so the gate cannot pass silently", async ({ page }) => {
    await page.goto("http://127.0.0.1:4310/fixtures/known-violation.html");
    const summary = await scanPage(page, "known-violation-fixture", "/fixtures/known-violation.html");
    expect(summary.violationCount).toBeGreaterThan(0);
    for (const rule of ["image-alt", "color-contrast", "button-name", "label"]) {
      expect(summary.violationIds, "expected axe rule " + rule).toContain(rule);
    }
    const focus = await readFocus(page);
    expect(focus.tag).not.toBe("html");
  });
});
