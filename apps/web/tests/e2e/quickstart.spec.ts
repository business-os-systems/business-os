import { test, expect, type Page } from "@playwright/test";
import {
  CATALOG_SECTION_FIXTURE,
  FIXTURE_PAGE_ID,
  FIXTURE_SITE_ID,
  PAGE_CONTENT_FIXTURE,
  mockDashboardApi,
  reviewResultFixture,
} from "./helpers/dashboard-fixtures";
import { DASHBOARD_ORIGIN, installTenantSession } from "./helpers/session";

/**
 * The seven quickstart scenarios (T129), expressed against the real release
 * screens and deterministic API fixtures.
 *
 * Scenario 5 (media usage) has no release-one workspace screen: media is a
 * workspace-wide library exposed through the picker, not a route in this
 * release. Its contract stays covered by the media package and API suites; the
 * page here fails closed instead of pretending to exercise a missing screen.
 */

const STUDIO_PATH = "/dashboard/sites/" + FIXTURE_SITE_ID + "/studio/" + FIXTURE_PAGE_ID;
const REVIEW_PATH = "/dashboard/sites/" + FIXTURE_SITE_ID + "/review";
const INQUIRIES_PATH = "/dashboard/websites/inquiries";
const ADD_SECTION_LABEL = "Add section";

async function jsonRoute(page: Page, pattern: string, body: unknown): Promise<void> {
  await page.route(pattern, (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(body),
    })
  );
}

async function openConflictStudio(
  page: Page,
  context: import("@playwright/test").BrowserContext
): Promise<void> {
  await installTenantSession(context);
  await mockDashboardApi(page);
  await jsonRoute(page, "**/api/v1/cms/catalog/sections", {
    success: true,
    data: { items: [CATALOG_SECTION_FIXTURE] },
    requestId: "req_quickstart",
    timestamp: "2026-11-11T00:00:00.000Z",
  });
  await page.route("**/api/v1/cms/pages/" + FIXTURE_PAGE_ID + "/content", (route) => {
    if (route.request().method() === "PATCH") {
      return route.fulfill({
        status: 409,
        contentType: "application/json",
        body: JSON.stringify({
          type: "/errors/revision-conflict",
          title: "Revision conflict",
          status: 409,
          detail: "A newer version of this page was saved.",
          code: "REVISION_CONFLICT",
        }),
      });
    }
    return route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        success: true,
        data: { content: PAGE_CONTENT_FIXTURE },
        requestId: "req_quickstart",
        timestamp: "2026-11-11T00:00:00.000Z",
      }),
    });
  });
  await page.goto(DASHBOARD_ORIGIN + STUDIO_PATH);
  await expect(page.getByRole("link", { name: "Exit studio" })).toBeVisible();
  await expect(page.getByRole("region", { name: "Canvas" })).toBeVisible();
  await expect(page.getByRole("button", { name: ADD_SECTION_LABEL })).toBeEnabled();
}

async function openReview(page: Page, context: import("@playwright/test").BrowserContext): Promise<void> {
  await installTenantSession(context);
  await mockDashboardApi(page);
  await page.goto(DASHBOARD_ORIGIN + REVIEW_PATH);
  await expect(page.getByRole("heading", { name: "Review & publish" })).toBeVisible();
}

test.describe("quickstart — authoring and review (scenarios 1-4)", () => {
  test("scenario 1: the curated catalog section is offered to the studio", async ({ page, context }) => {
    await installTenantSession(context);
    await mockDashboardApi(page);
    await jsonRoute(page, "**/api/v1/cms/catalog/sections", {
      success: true,
      data: { items: [CATALOG_SECTION_FIXTURE] },
      requestId: "req_quickstart",
      timestamp: "2026-11-11T00:00:00.000Z",
    });
    await page.goto(DASHBOARD_ORIGIN + STUDIO_PATH);
    await expect(page.getByRole("link", { name: "Exit studio" })).toBeVisible();
    await expect(page.getByRole("region", { name: "Canvas" })).toBeVisible();
    await expect(page.getByRole("button", { name: ADD_SECTION_LABEL })).toBeEnabled();
    await page.getByRole("button", { name: ADD_SECTION_LABEL }).click();
    await expect(page.getByRole("heading", { name: "Add a section" })).toBeVisible();
    await expect(page.getByText("Hero banner")).toBeVisible();
  });

  test("scenario 2: a changed page is reviewed and published from the review surface", async ({ page, context }) => {
    await openReview(page, context);
    await expect(page.getByRole("button", { name: /Home/ }).first()).toBeVisible();
    await page.getByTestId("review-publish-control").click();
    await expect(page.getByText("Published 1 page(s)")).toBeVisible();
  });

  test("scenario 3: a stale review still publishes; review is informational", async ({ page, context }) => {
    await installTenantSession(context);
    await mockDashboardApi(page);
    await jsonRoute(page, "**/api/v1/cms/sites/" + FIXTURE_SITE_ID + "/review", reviewResultFixture("STALE"));
    await page.goto(DASHBOARD_ORIGIN + REVIEW_PATH);
    await expect(page.getByText("Fresh review required")).toBeVisible();
    await expect(page.getByTestId("review-publish-control")).toBeEnabled();
  });

  test("scenario 4: a stale save opens the two-version conflict dialog", async ({ page, context }) => {
    await openConflictStudio(page, context);
    await page.getByRole("button", { name: ADD_SECTION_LABEL }).click();
    await page.getByText("Hero banner").click();
    await expect(page.getByRole("heading", { name: "A newer version of this page was saved" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Keep my version" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Keep their version" })).toBeVisible();
  });

});

test.describe("quickstart — media, inquiries and isolation (scenarios 5-7)", () => {
  test("scenario 5: an asset uploaded once is used by two pages", async ({ page, context }) => {
    await installTenantSession(context);
    await mockDashboardApi(page);
    await page.goto(DASHBOARD_ORIGIN + "/media");

    await expect(page.getByRole("heading", { name: "Media library", level: 1 })).toBeVisible();
    await expect(page.getByText("ridge-hero.jpg")).toBeVisible();

    await page.getByRole("button", { name: "Inspect asset" }).first().click();
    const detail = page.getByRole("dialog", { name: "Asset details and usage" });
    await expect(detail).toBeVisible();
    // Two references to the one asset, so the library never counts an upload twice.
    await expect(detail.getByText("website-builder / page")).toHaveCount(2);
    await expect(detail.getByText("DRAFT")).toBeVisible();
    await expect(detail.getByText("PUBLISHED")).toBeVisible();
    await expect(detail.getByText(/not referenced by any content/)).toHaveCount(0);
  });

  test("scenario 6: an inquiry is read from the workspace without notifications", async ({ page, context }) => {
    await installTenantSession(context);
    await mockDashboardApi(page);
    await page.goto(DASHBOARD_ORIGIN + INQUIRIES_PATH);
    await expect(page.getByRole("heading", { name: "Inquiries", level: 1 })).toBeVisible();
    await page.getByRole("button", { name: "Open inquiry" }).first().click();
    await expect(page.getByRole("heading", { name: "Inquiry" })).toBeVisible();
    await expect(page.getByRole("dialog")).toBeVisible();
    await expect(page.getByText(/email sent|notification/i)).toHaveCount(0);
  });

  test("scenario 7: another host and a signed-out workspace are denied", async ({ page }) => {
    await page.goto("http://other.localhost:3003/");
    await expect(page.getByRole("heading", { name: "This website is not available right now." })).toBeVisible();
    await page.goto(DASHBOARD_ORIGIN + INQUIRIES_PATH);
    await expect(page).toHaveURL(/\/login\?redirect=/);
    await expect(page.getByRole("heading", { name: /sign in/i })).toBeVisible();
  });
});
