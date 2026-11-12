import { expect, test, request as playwrightRequest, type APIRequestContext, type Page } from "@playwright/test";
import { apiOrigin, dashboardOrigin, siteHostForAddress, storefrontOrigin } from "./helpers/journey-environment";
import {
  createRunSuffix,
  createTenantApiContext,
  installTenantSession,
  prepareJourney,
  type PreparedJourney,
} from "./helpers/journey-fixtures";
import {
  publishJourneySection,
  publishJourneyTemplate,
  type JourneySection,
} from "./helpers/catalog-operator";
import { readEnvelopeData } from "./helpers/api-envelope";
import {
  draftContainsHeadline,
  readPageContent,
  readSiteTemplates,
  type SiteTemplate,
} from "./helpers/tenant-cms";
import { collectCmsTraffic, type CmsCall } from "./helpers/cms-traffic";

/**
 * The first-website journey, against the real API and a scratch database
 * (#379, T180, SC-001, US2).
 *
 * Operator publishes a section -> tenant creates a site from a published
 * template -> tenant inserts that section in the studio -> tenant reviews and
 * publishes -> a visitor loads the published page on the host the create path
 * issued. Nothing in the CMS path is mocked: the only fixtures are the tenant
 * identity and the installed application.
 */

const STUDIO_PATH = /\/dashboard\/sites\/([^/]+)\/studio\/([^/]+)$/;

interface SiteAddress {
  readonly address: string;
  readonly siteId: string;
  readonly pageId: string;
}

interface OperatorInput {
  readonly operatorApi: APIRequestContext;
  readonly tenantApi: APIRequestContext;
  readonly journey: PreparedJourney;
  readonly suffix: string;
  readonly sectionHeadline: string;
  readonly templateHeadline: string;
}

interface PublishedCatalog {
  readonly template: SiteTemplate;
  readonly section: JourneySection;
}

/**
 * The operator publishes a template and a section through the real catalog API,
 * and the tenant reads both back through the real CMS endpoints, so the tenant
 * path is known to be populated before the browser opens.
 *
 * The template uses hero sections only. A rich-text block cannot render in the
 * bundled server build (the sanitiser's jsdom stylesheet is missing from the
 * bundle), which is the same renderer defect described at the visitor step;
 * that defect belongs to the renderer, not to this journey.
 */
async function publishCatalog(input: OperatorInput): Promise<PublishedCatalog> {
  const publishedTemplate = await publishJourneyTemplate({
    api: input.operatorApi,
    operatorSessionToken: input.journey.operatorSessionToken,
    suffix: input.suffix,
    headline: input.templateHeadline,
  });
  const section = await publishJourneySection({
    api: input.operatorApi,
    operatorSessionToken: input.journey.operatorSessionToken,
    suffix: input.suffix,
    headline: input.sectionHeadline,
  });

  const sections = await input.tenantApi.get("/api/v1/cms/catalog/sections", {
    headers: { accept: "application/json" },
  });
  expect(sections.status()).toBe(200);
  expect(await sections.text()).toContain(section.id);
  const templates = await readSiteTemplates(input.tenantApi);
  const visibleTemplate = templates.find((entry) => entry.id === publishedTemplate.id);
  if (visibleTemplate === undefined) {
    throw new Error("The operator's template is not visible to the tenant.");
  }
  return { template: visibleTemplate, section };
}

/**
 * Types into a field only once React has hydrated. A development server paints
 * the server markup before hydration; a fill that lands earlier is overwritten
 * when React attaches, so the value is re-applied until it sticks.
 */
async function fillOnceHydrated(page: Page, label: string, value: string): Promise<void> {
  const field = page.getByLabel(label);
  await expect(async () => {
    await field.click();
    await field.fill("");
    await field.pressSequentially(value, { delay: 5 });
    await expect(field).toHaveValue(value, { timeout: 2_000 });
  }).toPass({ timeout: 30_000 });
}

/** Drives the one-step create form the way a tenant does, then reads the studio address. */
async function createSiteFromTemplate(input: {
  readonly page: Page;
  readonly journey: PreparedJourney;
  readonly template: SiteTemplate;
  readonly suffix: string;
}): Promise<SiteAddress> {
  const { page, journey, template, suffix } = input;
  const address = "journey-site-" + suffix;

  await page.goto(dashboardOrigin(journey.tenantHost) + "/dashboard/websites");
  await expect(page.getByRole("heading", { name: "Websites", level: 1 })).toBeVisible();

  // A development server hydrates after the first paint, so the click is
  // retried until the router actually moves; a single click can land on the
  // server-rendered markup before React has attached its handler.
  const createButton = page.getByRole("button", { name: "Create website" }).first();
  await expect(async () => {
    await createButton.click();
    await expect(page).toHaveURL(/\/dashboard\/sites\/onboarding$/, { timeout: 5_000 });
  }).toPass({ timeout: 45_000 });

  // One-step creation (#381): name, address and starting point on one form.
  await expect(page.getByRole("heading", { name: "Create a website" }).first()).toBeVisible();
  await fillOnceHydrated(page, "Site name", "Journey Studio " + suffix);
  await fillOnceHydrated(page, "Address", address);
  await page.getByLabel("Starting point").click();
  await page.getByRole("option").filter({ hasText: template.name }).click();
  await page.getByRole("button", { name: "Create site and open studio" }).click();
  await page.waitForURL(STUDIO_PATH);

  const match = STUDIO_PATH.exec(new URL(page.url()).pathname);
  const siteId = match?.[1];
  const pageId = match?.[2];
  if (siteId === undefined || pageId === undefined) {
    throw new Error("The studio address carries no site or page id.");
  }
  return { address, siteId, pageId };
}

/** Inserts the operator's section and waits for the autosave to reach the API. */
async function insertSectionInStudio(input: {
  readonly page: Page;
  readonly tenantApi: APIRequestContext;
  readonly section: JourneySection;
  readonly pageId: string;
}): Promise<void> {
  const { page, tenantApi, section, pageId } = input;
  await expect(page.getByRole("region", { name: "Canvas" })).toBeVisible();

  // The editor toolbar button is activated by keyboard: on a small CI viewport
  // the canvas pane paints over its hit area, so a pointer click is reported as
  // intercepted. Focusing the real button and pressing Enter is the keyboard
  // path the toolbar must support anyway (OP-4) and reaches the same handler.
  const addSection = page.getByRole("button", { name: "Add section" }).first();
  await expect(addSection).toBeVisible();
  await expect(addSection).toBeEnabled();
  await addSection.focus();
  await page.keyboard.press("Enter");

  const drawer = page.getByRole("dialog");
  await expect(drawer).toBeVisible();
  await drawer.locator('[data-catalog-section-id="' + section.id + '"]').click();
  await expect(drawer).not.toBeVisible();

  await expect
    .poll(
      async () => {
        const content = await readPageContent(tenantApi, pageId);
        return draftContainsHeadline(content, section.headline);
      },
      { timeout: 45_000, message: "The studio never saved the inserted section." }
    )
    .toBe(true);
}

/**
 * An unpublished site is not public: the visitor gets the neutral not-found and
 * never the operator's section.
 */
async function expectVisitorSeesNoPage(input: {
  readonly page: Page;
  readonly publicHost: string;
  readonly headline: string;
}): Promise<void> {
  const response = await input.page.goto(storefrontOrigin(input.publicHost) + "/");
  expect(response?.status()).toBe(404);
  await expect(input.page.getByText(input.headline)).toHaveCount(0);
}

/** Reviews and publishes from the real review surface, then checks the visitor. */
async function publishFromReview(input: {
  readonly page: Page;
  readonly api: APIRequestContext;
  readonly journey: PreparedJourney;
  readonly siteId: string;
  readonly publicHost: string;
  readonly headline: string;
}): Promise<void> {
  const { page, api, journey, siteId, publicHost, headline } = input;
  await page.goto(dashboardOrigin(journey.tenantHost) + "/dashboard/sites/" + siteId + "/review");
  await expect(page.getByRole("heading", { name: "Review & publish" })).toBeVisible();

  // The release answered by the API is the evidence; the page count is
  // whatever the site actually contains, not a number the test invents.
  const publishResponse = page.waitForResponse((response) => {
    const path = new URL(response.url()).pathname;
    return (
      response.request().method() === "POST" &&
      /^\/api\/v1\/cms\/sites\/[^/]+\/publish$/.test(path)
    );
  });
  await page.getByTestId("review-publish-control").click();
  const release = await publishResponse;
  expect(release.status()).toBe(200);
  const releaseBody: unknown = await release.json();
  const releaseData = readEnvelopeData(releaseBody);
  const pages = releaseData.pages;
  if (!Array.isArray(pages) || pages.length === 0) {
    throw new Error("The publish response carries no published page.");
  }
  await expect(page.getByText(/Published [0-9]+ page\(s\)/)).toBeVisible();

  /*
   * The published page is read twice. The public API read proves the page is
   * served by contract; the browser read proves a visitor actually receives the
   * document, not only a rendered body behind a 500. The sanitiser that used to
   * break document generation is kept external in apps/web/next.config.mjs.
   */
  const publicRead = await api.get("/api/v1/storefront/page", {
    params: { host: publicHost, path: "/" },
    headers: { accept: "application/json" },
  });
  expect(publicRead.status()).toBe(200);
  expect(await publicRead.text()).toContain(headline);

  const documentResponse = await page.goto(storefrontOrigin(publicHost) + "/");
  expect(documentResponse?.status()).toBe(200);
  await expect(page.getByText(headline).first()).toBeVisible();
}

/** The calls the journey depended on really reached the API, unmocked. */
function expectRealCmsTraffic(calls: readonly CmsCall[]): void {
  expect(calls).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ method: "GET", path: "/api/v1/cms/catalog/sections", status: 200 }),
      expect.objectContaining({ method: "GET", path: "/api/v1/cms/templates", status: 200 }),
      expect.objectContaining({ method: "POST", path: "/api/v1/cms/sites", status: 201 }),
      expect.objectContaining({
        method: "PATCH",
        status: 200,
        path: expect.stringMatching(/^\/api\/v1\/cms\/pages\/[^/]+\/content$/),
      }),
      expect.objectContaining({
        method: "POST",
        status: 200,
        path: expect.stringMatching(/^\/api\/v1\/cms\/sites\/[^/]+\/publish$/),
      }),
    ])
  );
}

test.describe("first website journey on the real API and database", () => {
  test("an operator's published section reaches a visitor through a tenant's published site", async ({
    page,
    context,
  }) => {
    const suffix = createRunSuffix();
    const headline = "Journey proof " + suffix;
    const journey = prepareJourney(suffix);
    const cmsCalls = collectCmsTraffic(page);
    const operatorApi = await playwrightRequest.newContext({ baseURL: apiOrigin() });
    const tenantApi = await createTenantApiContext(journey);

    try {
      const catalog = await publishCatalog({
        operatorApi,
        tenantApi,
        journey,
        suffix,
        sectionHeadline: headline,
        templateHeadline: "Journey template " + suffix,
      });
      const template = catalog.template;
      const section = catalog.section;

      await installTenantSession(context, journey);
      const site = await createSiteFromTemplate({ page, journey, template, suffix });
      const publicHost = siteHostForAddress(site.address);

      await insertSectionInStudio({ page, tenantApi, section, pageId: site.pageId });
      await expectVisitorSeesNoPage({ page, publicHost, headline });
      await publishFromReview({ page, api: tenantApi, journey, siteId: site.siteId, publicHost, headline });
      expectRealCmsTraffic(cmsCalls);
    } finally {
      await operatorApi.dispose();
      await tenantApi.dispose();
    }
  });
});