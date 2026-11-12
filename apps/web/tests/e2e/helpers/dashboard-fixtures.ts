import type { Page, Route } from "@playwright/test";

/**
 * Deterministic dashboard fixtures (T125).
 *
 * The real screens render; every client-side CMS read and write is answered
 * here so a suite never reaches a real API, database or network.
 */

export const FIXTURE_SITE_ID = "fixture-site";
export const FIXTURE_PAGE_ID = "fixture-page-home";
export const FIXTURE_REVIEW_ID = "fixture-review";
export const FIXTURE_INQUIRY_ID = "fixture-inquiry";

const UPDATED_AT = "2026-11-11T09:00:00.000Z";
const CMS_BASE = "/api/v1/cms";
const SITE_BASE = CMS_BASE + "/sites/" + FIXTURE_SITE_ID;
const PAGE_CONTENT_PATH = CMS_BASE + "/pages/" + FIXTURE_PAGE_ID + "/content";
const ABOUT_CONTENT_PATH = CMS_BASE + "/pages/fixture-page-about/content";

const ENVELOPE_META = {
  success: true as const,
  requestId: "req_release_gates",
  timestamp: "2026-11-11T00:00:00.000Z",
};

const SITE = {
  id: FIXTURE_SITE_ID,
  organizationId: "org_release_gates",
  branchId: null,
  title: "Northwind Studio",
  slug: "northwind-studio",
  status: "DRAFT",
  timezone: "UTC",
  primaryLocale: "en",
  pagesCount: 2,
  createdAt: "2026-11-10T09:00:00.000Z",
  updatedAt: UPDATED_AT,
};

const HOME_PAGE = {
  id: FIXTURE_PAGE_ID,
  siteId: FIXTURE_SITE_ID,
  parentId: null,
  title: "Home",
  path: "/",
  orderIndex: 0,
  status: "DRAFT",
  isHomePage: true,
  revision: 3,
  createdAt: "2026-11-10T09:00:00.000Z",
  updatedAt: UPDATED_AT,
};

const ABOUT_PAGE = {
  ...HOME_PAGE,
  id: "fixture-page-about",
  title: "About",
  path: "/about",
  orderIndex: 1,
  isHomePage: false,
  revision: 2,
};

const DRAFT_AST = {
  version: 1,
  schemaVersion: "2026-03",
  meta: { title: "Home" },
  sections: [
    {
      id: "sec_hero",
      blocks: [
        {
          id: "blk_hero",
          type: "hero",
          props: { headline: "A site ready to publish" },
        },
      ],
    },
  ],
};

const REVIEW_PAGE = {
  pageId: FIXTURE_PAGE_ID,
  title: "Home",
  path: "/",
  orderIndex: 0,
  status: "CHANGED",
  revision: 3,
  contentUpdatedAt: UPDATED_AT,
  changed: true,
  reviewed: false,
  stale: false,
  draftAst: DRAFT_AST,
  publishedAst: null,
};

const REVIEW = {
  reviewId: FIXTURE_REVIEW_ID,
  siteId: FIXTURE_SITE_ID,
  status: "OPEN",
  createdAt: UPDATED_AT,
  reviewerUserId: "usr_release_gates",
  publishedAt: null,
  changedPageCount: 1,
  reviewedPageCount: 0,
  pages: [REVIEW_PAGE],
  media: {},
};

export const CATALOG_SECTION_FIXTURE = {
  id: "catalog-hero",
  name: "Hero banner",
  slug: "hero-banner",
  category: "marketing",
  industries: ["hospitality"],
  currentVersion: 1,
  previewRef: null,
  definition: {
    schemaVersion: "2026-03",
    block: {
      id: "catalog-hero-block",
      type: "hero",
      props: { headline: "A catalog-provided hero" },
    },
  },
};

export const REVIEW_PAGE_FIXTURE = REVIEW_PAGE;

export function reviewResultFixture(status: "OPEN" | "STALE"): Record<string, unknown> {
  return envelope({
    review: {
      ...REVIEW,
      status,
      pages: [{ ...REVIEW_PAGE, stale: status === "STALE" }],
    },
    canPublish: true,
    actions: [{ id: "publish", label: "Publish live" }],
  });
}

export const PAGE_CONTENT_FIXTURE = {
  pageId: FIXTURE_PAGE_ID,
  revision: 3,
  draftAst: DRAFT_AST,
  publishedAst: null,
  updatedAt: UPDATED_AT,
  lastEditedByUserId: "usr_release_gates",
  lastEditedAt: UPDATED_AT,
};

const SITE_SUMMARY = {
  id: FIXTURE_SITE_ID,
  title: "Northwind Studio",
  slug: "northwind-studio",
  status: "DRAFT",
  timezone: "UTC",
  primaryDomain: null,
  pageCount: 2,
  homePageId: FIXTURE_PAGE_ID,
  updatedAt: UPDATED_AT,
};

const INQUIRY = {
  id: FIXTURE_INQUIRY_ID,
  siteId: FIXTURE_SITE_ID,
  pageId: FIXTURE_PAGE_ID,
  blockId: "blk_contact_form",
  status: "NEW",
  preview: "We would like a quote for a new website.",
  submittedAt: "2026-11-11T08:00:00.000Z",
  readAt: null,
  archivedAt: null,
  retentionExpiresAt: "2027-11-11T08:00:00.000Z",
};

function envelope(data: unknown): Record<string, unknown> {
  return { ...ENVELOPE_META, data };
}

/* --- Shared media library (FR-123, quickstart scenario 5) ------------------
 * One uploaded asset is referenced by two pages. The library must list the
 * asset once and the detail view must show both references, so "uploaded once,
 * used twice" is observable without a second upload.
 */
const MEDIA_ASSET = {
  id: "fixture-media-ridge",
  kind: "IMAGE" as const,
  fileName: "ridge-hero.jpg",
  mimeType: "image/jpeg",
  sizeBytes: 184_320,
  checksum: "sha256:release-gates-ridge",
  width: 1600,
  height: 900,
  url: "https://media.example.test/ridge-hero.jpg",
  status: "ACTIVE" as const,
  usageCount: 2,
  createdAt: "2026-11-10T08:00:00.000Z",
};

const MEDIA_USAGES = [
  {
    id: "fixture-usage-home",
    assetId: MEDIA_ASSET.id,
    appId: "website-builder",
    resourceType: "page",
    resourceId: FIXTURE_PAGE_ID,
    subKey: "hero",
    status: "DRAFT" as const,
    createdAt: "2026-11-10T08:05:00.000Z",
  },
  {
    id: "fixture-usage-about",
    assetId: MEDIA_ASSET.id,
    appId: "website-builder",
    resourceType: "page",
    resourceId: "fixture-page-about",
    subKey: "hero",
    status: "PUBLISHED" as const,
    createdAt: "2026-11-10T08:06:00.000Z",
  },
];

async function handleMediaRoutes(
  route: Route,
  pathname: string,
  method: string
): Promise<void> {
  if (pathname === "/api/v1/media/assets" && method === "GET") {
    await json(route, envelope({ items: [MEDIA_ASSET], nextCursor: null }));
    return;
  }
  if (pathname === "/api/v1/media/assets/" + MEDIA_ASSET.id && method === "GET") {
    await json(route, envelope({ ...MEDIA_ASSET, usages: MEDIA_USAGES }));
    return;
  }
  await json(route, { code: "NOT_FOUND" }, 404);
}

function json(route: Route, body: unknown, status = 200): Promise<void> {
  return route.fulfill({
    status,
    contentType: "application/json",
    body: JSON.stringify(body),
  });
}

function handleReviewRoutes(route: Route, pathname: string, method: string): Promise<void> | null {
  if (pathname.endsWith("/review")) {
    return json(route, envelope({ review: REVIEW, canPublish: true, actions: [{ id: "publish", label: "Publish live" }] }));
  }
  if (pathname.includes("/review/" + FIXTURE_REVIEW_ID + "/pages/")) {
    return json(route, envelope({ pageId: FIXTURE_PAGE_ID, revision: 3, reviewed: true, stale: false }));
  }
  if (pathname.includes("/review/" + FIXTURE_REVIEW_ID) && method === "GET") {
    return json(route, envelope({ review: REVIEW, canPublish: true, actions: [{ id: "publish", label: "Publish live" }] }));
  }
  if (pathname.endsWith("/publish") && method === "POST") {
    return json(route, envelope({
      siteId: FIXTURE_SITE_ID,
      reviewId: FIXTURE_REVIEW_ID,
      reviewerUserId: "usr_release_gates",
      publisherUserId: "usr_release_gates",
      publishedAt: "2026-11-11T09:05:00.000Z",
      pages: [{ pageId: FIXTURE_PAGE_ID, versionNumber: 1, revision: 3 }],
      replayed: false,
    }));
  }
  return null;
}

function handleSiteRoutes(route: Route, pathname: string, method: string): Promise<void> | null {
  if (pathname === SITE_BASE && method === "GET") {
    return json(route, envelope({ site: SITE }));
  }
  if (pathname === SITE_BASE + "/pages" && method === "GET") {
    return json(route, envelope({ items: [HOME_PAGE, ABOUT_PAGE], nextCursor: null }));
  }
  if (pathname === CMS_BASE + "/catalog/sections") {
    return json(route, envelope({ items: [CATALOG_SECTION_FIXTURE] }));
  }
  return null;
}

function handlePageRoutes(route: Route, pathname: string, method: string): Promise<void> | null {
  if (pathname === PAGE_CONTENT_PATH && method === "GET") {
    return json(route, envelope({
      content: {
        pageId: FIXTURE_PAGE_ID,
        revision: 3,
        draftAst: DRAFT_AST,
        publishedAst: null,
        updatedAt: UPDATED_AT,
        lastEditedByUserId: "usr_release_gates",
        lastEditedAt: UPDATED_AT,
      },
    }));
  }
  if (pathname === ABOUT_CONTENT_PATH && method === "GET") {
    return json(route, envelope({
      content: {
        pageId: "fixture-page-about",
        revision: 2,
        draftAst: { ...DRAFT_AST, meta: { title: "About" } },
        publishedAst: null,
        updatedAt: UPDATED_AT,
        lastEditedByUserId: "usr_release_gates",
        lastEditedAt: UPDATED_AT,
      },
    }));
  }
  return null;
}

function handleCms(route: Route, pathname: string, method: string): Promise<void> {
  const handled =
    handleSiteRoutes(route, pathname, method) ??
    handlePageRoutes(route, pathname, method) ??
    handleReviewRoutes(route, pathname, method);
  if (handled !== null) {
    return handled;
  }
  return json(route, { type: "/errors/not-found", title: "Not found", status: 404, detail: "No fixture for " + pathname, code: "NOT_FOUND" }, 404);
}

function handleDashboardApi(route: Route, pathname: string): Promise<void> {
  if (pathname === "/api/cms/sites") {
    return json(route, { sites: [SITE_SUMMARY], nextCursor: null });
  }
  if (pathname === "/api/cms/inquiries/unread-count") {
    return json(route, { count: 1 });
  }
  if (pathname === "/api/cms/inquiries/" + FIXTURE_INQUIRY_ID) {
    return json(route, {
      ...INQUIRY,
      payload: { message: INQUIRY.preview },
      contact: { name: "Release Visitor", email: "visitor@example.test", phone: null },
      contactRedacted: false,
    });
  }
  if (pathname === "/api/cms/inquiries") {
    return json(route, { items: [INQUIRY], nextCursor: null });
  }
  return json(route, { type: "/errors/not-found", title: "Not found", status: 404, detail: "No fixture for " + pathname, code: "NOT_FOUND" }, 404);
}

export async function mockDashboardApi(page: Page): Promise<void> {
  await page.route("**/api/v1/media/**", (route) => {
    const url = new URL(route.request().url());
    return handleMediaRoutes(route, url.pathname, route.request().method());
  });
  await page.route("**/api/v1/cms/**", (route) => {
    const url = new URL(route.request().url());
    return handleCms(route, url.pathname, route.request().method());
  });
  await page.route("**/api/cms/**", (route) => {
    const url = new URL(route.request().url());
    return handleDashboardApi(route, url.pathname);
  });
}
