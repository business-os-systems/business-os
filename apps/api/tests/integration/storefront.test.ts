import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Prisma, prisma } from "@suite/db";
import {
  DEFAULT_APPEARANCE_TOKENS,
  type AppearanceTokens,
} from "@suite/website-builder/appearance";
import { createApp } from "../../src/app.js";
import {
  STOREFRONT_ERROR_CODE,
  storefrontPageResponseSchema,
  storefrontResolveResponseSchema,
} from "../../src/services/storefront/contract.js";

const enabled = Boolean(process.env.DATABASE_URL && process.env.TENANT_DATABASE_URL);
const pageSuite = enabled ? describe : describe.skip;
const RUN = Date.now().toString(36);

const RESOLVE_ENDPOINT = "/api/v1/storefront/resolve";
const PAGE_ENDPOINT = "/api/v1/storefront/page";
const HOST_SUFFIX = ".businessos.app";
const SITE_PREFIX = "site_wt352_";
const STATUS_PUBLISHED = "PUBLISHED";
const STATUS_DRAFT = "DRAFT";
const STATUS_SUSPENDED = "SUSPENDED";
const STATUS_ARCHIVED = "ARCHIVED";
const ACME_HOME = "Acme home";
const ABOUT_TITLE = "About Acme";
const DRAFT_TITLE = "Draft page";
const SET_COOKIE = "set-cookie";

const HOST_A = "acme-wt352-" + RUN + HOST_SUFFIX;
const HOST_B = "beta-wt352-" + RUN + HOST_SUFFIX;
const HOST_DRAFT = "draft-wt352-" + RUN + HOST_SUFFIX;
const HOST_SUSPENDED = "suspended-wt352-" + RUN + HOST_SUFFIX;
const HOST_ARCHIVED = "archived-wt352-" + RUN + HOST_SUFFIX;
const HOST_UNKNOWN = "unknown-wt352-" + RUN + HOST_SUFFIX;

const ORG_A = "org_wt352_a_" + RUN;
const ORG_B = "org_wt352_b_" + RUN;
const ORG_DRAFT = "org_wt352_draft_" + RUN;
const ORG_SUSPENDED = "org_wt352_suspended_" + RUN;
const ORG_ARCHIVED = "org_wt352_archived_" + RUN;
const ORGS = [ORG_A, ORG_B, ORG_DRAFT, ORG_SUSPENDED, ORG_ARCHIVED];
const SITE_A = SITE_PREFIX + "a_" + RUN;
const SITE_B = SITE_PREFIX + "b_" + RUN;
const SITE_DRAFT = SITE_PREFIX + "draft_" + RUN;
const SITE_SUSPENDED = SITE_PREFIX + "suspended_" + RUN;
const SITE_ARCHIVED = SITE_PREFIX + "archived_" + RUN;

const TOKENS_A: AppearanceTokens = { ...DEFAULT_APPEARANCE_TOKENS, colorPrimary: "#123456" };
const TOKENS_B: AppearanceTokens = { ...DEFAULT_APPEARANCE_TOKENS, colorPrimary: "#654321" };

function pageAst(title: string, headline: string) {
  const key = title.toLowerCase().replace(/[^a-z0-9]+/g, "_");
  return {
    version: 1,
    schemaVersion: "2026-03",
    meta: { title },
    sections: [
      {
        id: "sec_" + key,
        blocks: [{ id: "hero_" + key, type: "hero", props: { headline } }],
      },
    ],
  };
}

interface SiteFixtureInput {
  readonly organizationId: string;
  readonly siteId: string;
  readonly host: string;
  readonly title: string;
  readonly status: "PUBLISHED" | "DRAFT" | "SUSPENDED" | "ARCHIVED";
  readonly tokens: AppearanceTokens;
}

async function createTenant(input: SiteFixtureInput): Promise<void> {
  await prisma.organization.create({
    data: { id: input.organizationId, name: input.title, slug: "wt352-" + input.siteId },
  });
  await prisma.cmsSite.create({
    data: {
      id: input.siteId,
      organizationId: input.organizationId,
      title: input.title,
      slug: "site-" + input.siteId,
      status: input.status,
      timezone: "UTC",
      primaryLocale: "en",
    },
  });
  await prisma.cmsSiteAppearance.create({
    data: {
      organizationId: input.organizationId,
      siteId: input.siteId,
      draftTokens: input.tokens,
      publishedTokens: input.tokens,
      sourceTokens: input.tokens,
    },
  });
  await prisma.cmsDomain.create({
    data: {
      organizationId: input.organizationId,
      siteId: input.siteId,
      hostname: input.host,
      isPrimary: true,
      isSubdomain: true,
      status: "ACTIVE",
      verificationToken: "wt352-" + input.siteId,
    },
  });
}

interface PageFixtureInput {
  readonly organizationId: string;
  readonly siteId: string;
  readonly path: string;
  readonly title: string;
  readonly status: "PUBLISHED" | "DRAFT";
  readonly publishedAst: Prisma.InputJsonValue | typeof Prisma.DbNull;
  readonly draftAst: Prisma.InputJsonValue;
}

async function createPage(input: PageFixtureInput): Promise<void> {
  const page = await prisma.cmsPage.create({
    data: {
      organizationId: input.organizationId,
      siteId: input.siteId,
      title: input.title,
      slug: input.path,
      isHomePage: input.path === "/",
      status: input.status,
      revision: 1,
    },
  });
  await prisma.cmsPageContent.create({
    data: {
      organizationId: input.organizationId,
      pageId: page.id,
      draftAst: input.draftAst,
      publishedAst: input.publishedAst,
      publishedAt: input.publishedAst === Prisma.DbNull ? null : new Date(),
    },
  });
}

async function cleanup(): Promise<void> {
  await prisma.cmsDomain.deleteMany({ where: { organizationId: { in: ORGS } } });
  await prisma.cmsSiteAppearance.deleteMany({ where: { organizationId: { in: ORGS } } });
  await prisma.cmsPageVersion.deleteMany({ where: { organizationId: { in: ORGS } } });
  await prisma.cmsPageContent.deleteMany({ where: { organizationId: { in: ORGS } } });
  await prisma.cmsPage.deleteMany({ where: { organizationId: { in: ORGS } } });
  await prisma.cmsSite.deleteMany({ where: { organizationId: { in: ORGS } } });
  await prisma.organization.deleteMany({ where: { id: { in: ORGS } } });
}

async function seedAcme(): Promise<void> {
  await createTenant({
    organizationId: ORG_A,
    siteId: SITE_A,
    host: HOST_A,
    title: "Acme Bistro",
    status: STATUS_PUBLISHED,
    tokens: TOKENS_A,
  });
  await createPage({
    organizationId: ORG_A,
    siteId: SITE_A,
    path: "/",
    title: ACME_HOME,
    status: STATUS_PUBLISHED,
    publishedAst: pageAst(ACME_HOME, "Acme published headline"),
    draftAst: pageAst(ACME_HOME, "Acme draft headline"),
  });
  await createPage({
    organizationId: ORG_A,
    siteId: SITE_A,
    path: "/about",
    title: ABOUT_TITLE,
    status: STATUS_PUBLISHED,
    publishedAst: pageAst(ABOUT_TITLE, "About Acme published"),
    draftAst: pageAst(ABOUT_TITLE, "About Acme draft"),
  });
  await createPage({
    organizationId: ORG_A,
    siteId: SITE_A,
    path: "/draft",
    title: DRAFT_TITLE,
    status: STATUS_DRAFT,
    publishedAst: pageAst(DRAFT_TITLE, "Previously published draft"),
    draftAst: pageAst(DRAFT_TITLE, "Draft only headline"),
  });
  await createPage({
    organizationId: ORG_A,
    siteId: SITE_A,
    path: "/never-published",
    title: "Never published",
    status: STATUS_PUBLISHED,
    publishedAst: Prisma.DbNull,
    draftAst: pageAst("Never published", "Never published draft"),
  });
}

async function seedBeta(): Promise<void> {
  await createTenant({
    organizationId: ORG_B,
    siteId: SITE_B,
    host: HOST_B,
    title: "Beta Studio",
    status: STATUS_PUBLISHED,
    tokens: TOKENS_B,
  });
  await createPage({
    organizationId: ORG_B,
    siteId: SITE_B,
    path: "/",
    title: "Beta home",
    status: STATUS_PUBLISHED,
    publishedAst: pageAst("Beta home", "Beta published headline"),
    draftAst: pageAst("Beta home", "Beta draft headline"),
  });
  await createPage({
    organizationId: ORG_B,
    siteId: SITE_B,
    path: "/beta-only",
    title: "Beta only",
    status: STATUS_PUBLISHED,
    publishedAst: pageAst("Beta only", "Beta only headline"),
    draftAst: pageAst("Beta only", "Beta only draft"),
  });
}

async function seedUnavailable(): Promise<void> {
  await createTenant({
    organizationId: ORG_DRAFT,
    siteId: SITE_DRAFT,
    host: HOST_DRAFT,
    title: "Draft Site",
    status: STATUS_DRAFT,
    tokens: DEFAULT_APPEARANCE_TOKENS,
  });
  await createPage({
    organizationId: ORG_DRAFT,
    siteId: SITE_DRAFT,
    path: "/",
    title: "Draft site home",
    status: STATUS_PUBLISHED,
    publishedAst: pageAst("Draft site home", "Draft site headline"),
    draftAst: pageAst("Draft site home", "Draft site draft"),
  });
  await createTenant({
    organizationId: ORG_SUSPENDED,
    siteId: SITE_SUSPENDED,
    host: HOST_SUSPENDED,
    title: "Suspended Site",
    status: STATUS_SUSPENDED,
    tokens: DEFAULT_APPEARANCE_TOKENS,
  });
  await createTenant({
    organizationId: ORG_ARCHIVED,
    siteId: SITE_ARCHIVED,
    host: HOST_ARCHIVED,
    title: "Archived Site",
    status: STATUS_ARCHIVED,
    tokens: DEFAULT_APPEARANCE_TOKENS,
  });
}

const app = createApp({ enableRateLimiting: false });

function request(path: string, query: Record<string, string>, headers: Record<string, string> = {}) {
  return app.request("http://localhost" + path + "?" + new URLSearchParams(query).toString(), {
    headers,
  });
}

async function problemBody(response: Response): Promise<Record<string, unknown>> {
  expect(response.headers.get("content-type")).toContain("application/problem+json");
  return (await response.json()) as Record<string, unknown>;
}

beforeAll(async () => {
  if (!enabled) {
    return;
  }
  await cleanup();
  await seedAcme();
  await seedBeta();
  await seedUnavailable();
});

afterAll(async () => {
  if (!enabled) {
    return;
  }
  await cleanup();
});

pageSuite("storefront published delivery (T054, FR-035, FR-036)", () => {
  it("serves a published host to a signed-out visitor without tenant identifiers", async () => {
    const response = await request(RESOLVE_ENDPOINT, { host: HOST_A });
    const body: unknown = await response.json();

    expect(response.status).toBe(200);
    expect(storefrontResolveResponseSchema.parse(body)).toEqual({
      title: "Acme Bistro",
      status: STATUS_PUBLISHED,
      homePath: "/",
      defaultLocale: "en",
      theme: { tokens: TOKENS_A },
    });
    expect(JSON.stringify(body)).not.toContain(ORG_A);
    expect(JSON.stringify(body)).not.toContain(SITE_A);
    expect(response.headers.get(SET_COOKIE)).toBeNull();
  });

  it("serves the published AST and appearance snapshot for a page", async () => {
    const response = await request(PAGE_ENDPOINT, { host: HOST_A, path: "/about" });
    const page = storefrontPageResponseSchema.parse(await response.json());

    expect(response.status).toBe(200);
    expect(page.title).toBe("About Acme");
    expect(page.path).toBe("/about");
    expect(page.tokens).toEqual(TOKENS_A);
    expect(JSON.stringify(page.ast)).toContain("About Acme published");
    expect(JSON.stringify(page.ast)).not.toContain("About Acme draft");
    expect(response.headers.get(SET_COOKIE)).toBeNull();
  });

  it("never serves a draft page or a page without published content", async () => {
    const draft = await request(PAGE_ENDPOINT, { host: HOST_A, path: "/draft" });
    const neverPublished = await request(PAGE_ENDPOINT, {
      host: HOST_A,
      path: "/never-published",
    });

    expect(draft.status).toBe(404);
    expect(neverPublished.status).toBe(404);
    expect(JSON.stringify(await draft.json())).not.toContain("Draft page");
    expect(JSON.stringify(await neverPublished.json())).not.toContain("Never published");
  });
});

pageSuite("storefront unavailable delivery (FR-039, FR-043)", () => {
  it("answers an unpublished site with the same neutral 404 as an unknown host", async () => {
    const draftSite = await request(RESOLVE_ENDPOINT, { host: HOST_DRAFT });
    const unknownHost = await request(RESOLVE_ENDPOINT, { host: HOST_UNKNOWN });
    const draftProblem = await problemBody(draftSite);
    const unknownProblem = await problemBody(unknownHost);

    expect(draftSite.status).toBe(404);
    expect(unknownHost.status).toBe(404);
    expect(draftProblem).toMatchObject({
      code: STOREFRONT_ERROR_CODE.NOT_FOUND,
      status: 404,
      detail: unknownProblem.detail,
    });
    expect(JSON.stringify(unknownProblem)).not.toContain(HOST_UNKNOWN);
    expect(unknownHost.headers.get(SET_COOKIE)).toBeNull();
  });

  it("answers suspended and archived sites with GONE", async () => {
    const suspended = await request(RESOLVE_ENDPOINT, { host: HOST_SUSPENDED });
    const archived = await request(PAGE_ENDPOINT, { host: HOST_ARCHIVED, path: "/" });

    expect(suspended.status).toBe(410);
    expect(archived.status).toBe(410);
    expect(await problemBody(suspended)).toMatchObject({
      code: STOREFRONT_ERROR_CODE.GONE,
      status: 410,
    });
  });
});

pageSuite("storefront cache isolation and cookieless delivery (FR-042)", () => {
  it("never serves one host's content from another host's address", async () => {
    const betaHome = await request(PAGE_ENDPOINT, { host: HOST_B, path: "/" });
    const acmeBetaPath = await request(PAGE_ENDPOINT, { host: HOST_A, path: "/beta-only" });
    const betaAbout = await request(PAGE_ENDPOINT, { host: HOST_B, path: "/about" });
    const beta = storefrontPageResponseSchema.parse(await betaHome.json());

    expect(betaHome.status).toBe(200);
    expect(JSON.stringify(beta.ast)).toContain("Beta published headline");
    expect(JSON.stringify(beta.ast)).not.toContain("Acme");
    expect(beta.tokens).toEqual(TOKENS_B);
    expect(acmeBetaPath.status).toBe(404);
    expect(betaAbout.status).toBe(404);
  });

  it("ignores a supplied session cookie and never sets one", async () => {
    const response = await request(
      PAGE_ENDPOINT,
      { host: HOST_A, path: "/" },
      { cookie: "__Host-bos_session=forged-token", "x-user-id": "usr_forged" }
    );
    const body = await response.text();

    expect(response.status).toBe(200);
    expect(response.headers.get(SET_COOKIE)).toBeNull();
    expect(body).not.toContain("forged-token");
    expect(body).not.toContain("usr_forged");
  });
});
