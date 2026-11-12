import { createHmac, hkdfSync } from "node:crypto";

// The signed preview link is keyed by the session secret. Other suites unset it
// to exercise the production guard, so this file restores a deterministic key
// before it reads one instead of depending on file order.
const declaredSecret = process.env.BETTER_AUTH_SECRET;
if (declaredSecret === undefined || declaredSecret === "") {
  process.env.BETTER_AUTH_SECRET = "suite-test-preview-link-secret-32-chars";
}
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { Hono } from "hono";
import { PERMISSIONS, type PermissionCode } from "@suite/core";
import { prisma } from "@suite/db";
import { DEFAULT_APPEARANCE_TOKENS } from "@suite/website-builder/appearance";
import { PageAstSchema } from "@suite/website-builder/ast";
import { globalErrorHandler } from "../../src/middleware/error-handler.js";
import { createCmsSitesRouter } from "../../src/routes/cms/sites.js";
import {
  createStorefrontRouter,
  STOREFRONT_READ_RATE_LIMIT_KEY,
} from "../../src/routes/storefront/read.js";
import { clearRateLimitStore } from "../../src/middleware/rate-limit.js";
import { getBetterAuthSecret } from "../../src/lib/env.js";
import { STOREFRONT_ERROR_CODE } from "../../src/services/storefront/contract.js";
import { storefrontPreviewService } from "../../src/services/storefront/storefront.service.js";
import type {
  StorefrontPageOutcome,
  StorefrontPreviewService,
  StorefrontReadService,
} from "../../src/services/storefront/contract.js";
import {
  cleanupCmsFixture,
  cmsTestEnabled,
  createCmsFixture,
  type CmsFixture,
} from "../helpers/cms-fixtures.js";

const RUN = Date.now().toString(36).toUpperCase();
const HOST = "preview-" + RUN.toLowerCase() + ".example.test";
const PREVIEW_PATH = "/api/v1/cms/sites/";
const HOME_DRAFT_TITLE = "Draft home";

interface Variables {
  user: { permissions?: string[] };
  userId?: string;
  organizationId?: string;
}

function createSiteApp(permissions: readonly PermissionCode[]) {
  const app = new Hono<{ Variables: Variables }>();
  app.onError(globalErrorHandler);
  app.use("*", async (c, next) => {
    c.set("user", { permissions: [...permissions] });
    c.set("userId", "usr_wt381_preview");
    c.set("organizationId", fixture.organizationId);
    await next();
  });
  app.route("/api/v1/cms", createCmsSitesRouter());
  return app;
}

function draftAst(title: string) {
  return {
    version: 1,
    schemaVersion: "2026-03",
    meta: { title },
    sections: [
      {
        id: "sec_preview",
        blocks: [{ id: "hero_preview", type: "hero", props: { headline: "Draft headline" } }],
      },
    ],
  };
}

function signToken(payload: { v: number; host: string; exp: number }): string {
  const key = Buffer.from(
    hkdfSync(
      "sha256",
      Buffer.from(getBetterAuthSecret(), "utf8"),
      Buffer.from("business-os.cms.preview-link", "utf8"),
      Buffer.from("preview-token.v1", "utf8"),
      32
    )
  );
  const body = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
  return body + "." + createHmac("sha256", key).update(body).digest("base64url");
}

function signRawBody(raw: string): string {
  const body = Buffer.from(raw, "utf8").toString("base64url");
  const key = Buffer.from(
    hkdfSync(
      "sha256",
      Buffer.from(getBetterAuthSecret(), "utf8"),
      Buffer.from("business-os.cms.preview-link", "utf8"),
      Buffer.from("preview-token.v1", "utf8"),
      32
    )
  );
  return body + "." + createHmac("sha256", key).update(body).digest("base64url");
}

const fakeReadService: StorefrontReadService = {
  resolveHost: () => Promise.resolve({ kind: "not_found" }),
  readPage: () => Promise.resolve({ kind: "not_found" }),
};

function previewServiceWith(outcome: StorefrontPageOutcome): StorefrontPreviewService {
  return {
    createLink: () =>
      Promise.resolve({ url: "https://example.test/", expiresAt: new Date().toISOString() }),
    readPage: () => Promise.resolve(outcome),
  };
}

let fixture: CmsFixture;

/** Publishes the fixture host the preview reads resolve against. */
async function attachPreviewHost(activeFixture: CmsFixture): Promise<void> {
  await prisma.cmsDomain.create({
    data: {
      organizationId: activeFixture.organizationId,
      siteId: activeFixture.siteId,
      hostname: HOST,
      isPrimary: true,
      status: "ACTIVE",
      verificationToken: "verify-" + RUN,
      sslActive: true,
    },
  });
}

beforeAll(async () => {
  if (!cmsTestEnabled) {
    return;
  }
  // Other storefront suites share the per-IP read bucket; start from empty so a
  // full coverage run cannot answer one of these reads with 429.
  await clearRateLimitStore(STOREFRONT_READ_RATE_LIMIT_KEY);
  fixture = await createCmsFixture({
    suffix: "preview_" + RUN,
    pageCount: 1,
    changedPageCount: 1,
  });
  await attachPreviewHost(fixture);
  await prisma.cmsPageContent.update({
    where: {
      pageId_organizationId: {
        pageId: fixture.pageIds[0] ?? "",
        organizationId: fixture.organizationId,
      },
    },
    data: { draftAst: draftAst(HOME_DRAFT_TITLE) },
  });
  await prisma.cmsSiteAppearance.create({
    data: {
      organizationId: fixture.organizationId,
      siteId: fixture.siteId,
      draftTokens: {},
      publishedTokens: {},
      sourceTokens: {},
    },
  });
  await prisma.cmsPage.create({
    data: {
      organizationId: fixture.organizationId,
      siteId: fixture.siteId,
      title: "No content",
      slug: "/no-content",
      orderIndex: 2,
      status: "DRAFT",
    },
  });
  await prisma.cmsPage.create({
    data: {
      organizationId: fixture.organizationId,
      siteId: fixture.siteId,
      title: "Broken content",
      slug: "/broken-content",
      orderIndex: 3,
      status: "DRAFT",
      content: { create: { draftAst: { not: "a page" } } },
    },
  });
});

async function mintToken(path = "/"): Promise<string> {
  const link = await storefrontPreviewService.createLink({
    organizationId: fixture.organizationId,
    siteId: fixture.siteId,
    path,
  });
  return new URL(link.url).searchParams.get("preview") ?? "";
}

afterAll(async () => {
  if (!cmsTestEnabled) {
    return;
  }
  await cleanupCmsFixture(fixture.organizationId);
});

describe.skipIf(!cmsTestEnabled)("signed preview link", () => {
  it("issues a link that names only the host and an expiry", async () => {
    const link = await storefrontPreviewService.createLink({
      organizationId: fixture.organizationId,
      siteId: fixture.siteId,
      path: "/",
    });

    const url = new URL(link.url);
    expect(url.hostname).toBe(HOST);
    expect(url.searchParams.get("preview")).not.toBeNull();
    expect(new Date(link.expiresAt).getTime()).toBeGreaterThan(Date.now());
    const payload = JSON.parse(
      Buffer.from(url.searchParams.get("preview")?.split(".")[0] ?? "", "base64url").toString("utf8")
    ) as Record<string, unknown>;
    expect(Object.keys(payload).sort()).toEqual(["exp", "host", "v"]);
    expect(JSON.stringify(payload)).not.toContain(fixture.organizationId);
    expect(JSON.stringify(payload)).not.toContain(fixture.siteId);
  });

  it("serves the draft page and the draft appearance to the token holder", async () => {
    const link = await storefrontPreviewService.createLink({
      organizationId: fixture.organizationId,
      siteId: fixture.siteId,
      path: "/",
    });
    const token = new URL(link.url).searchParams.get("preview") ?? "";

    const outcome = await storefrontPreviewService.readPage({ token, path: "/" });

    if (outcome.kind !== "published") {
      throw new Error("Expected a published preview outcome, received " + outcome.kind);
    }
    expect(outcome.page.title).toBe("Page 0");
    expect(outcome.page.ast.meta?.title).toBe(HOME_DRAFT_TITLE);
    expect(outcome.page.tokens).toBeDefined();
  });

});

describe.skipIf(!cmsTestEnabled)("signed preview link validation", () => {
  it("refuses a tampered token", async () => {
    const link = await storefrontPreviewService.createLink({
      organizationId: fixture.organizationId,
      siteId: fixture.siteId,
      path: "/",
    });
    const token = new URL(link.url).searchParams.get("preview") ?? "";

    const outcome = await storefrontPreviewService.readPage({
      token: token.slice(0, -1) + (token.endsWith("a") ? "b" : "a"),
      path: "/",
    });

    expect(outcome).toEqual({ kind: "not_found" });
  });

  it("refuses an expired token", async () => {
    const expired = signToken({
      v: 1,
      host: HOST,
      exp: Math.floor(Date.now() / 1000) - 60,
    });

    const outcome = await storefrontPreviewService.readPage({ token: expired, path: "/" });

    expect(outcome).toEqual({ kind: "not_found" });
  });

  it("refuses a site without an active address", async () => {
    await prisma.cmsDomain.updateMany({
      where: { siteId: fixture.siteId },
      data: { status: "PENDING_VERIFICATION" },
    });
    try {
      await expect(
        storefrontPreviewService.createLink({
          organizationId: fixture.organizationId,
          siteId: fixture.siteId,
          path: "/",
        })
      ).rejects.toMatchObject({ status: 422 });
    } finally {
      await prisma.cmsDomain.updateMany({
        where: { siteId: fixture.siteId },
        data: { status: "ACTIVE" },
      });
    }
  });
});

describe.skipIf(!cmsTestEnabled)("signed preview link refusals", () => {
  it("refuses a site that belongs to another workspace", async () => {
    await expect(
      storefrontPreviewService.createLink({
        organizationId: "org_wt381_preview_other_" + RUN,
        siteId: fixture.siteId,
        path: "/",
      })
    ).rejects.toMatchObject({ status: 404 });
  });

  it("refuses an invalid page address at mint time", async () => {
    await expect(
      storefrontPreviewService.createLink({
        organizationId: fixture.organizationId,
        siteId: fixture.siteId,
        path: "/preview",
      })
    ).rejects.toMatchObject({ status: 422 });
  });

  it("returns not-found for a page that does not exist", async () => {
    const token = await mintToken();

    expect(await storefrontPreviewService.readPage({ token, path: "/missing" })).toEqual({
      kind: "not_found",
    });
  });

  it("returns not-found for a page without stored content", async () => {
    const token = await mintToken();

    expect(await storefrontPreviewService.readPage({ token, path: "/no-content" })).toEqual({
      kind: "not_found",
    });
  });

  it("returns not-found for an invalid draft body", async () => {
    const errors = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const token = await mintToken();

    expect(await storefrontPreviewService.readPage({ token, path: "/broken-content" })).toEqual({
      kind: "not_found",
    });
    expect(errors).toHaveBeenCalled();
    errors.mockRestore();
  });

});

describe.skipIf(!cmsTestEnabled)("signed preview link read refusals", () => {
  it("returns not-found for a reserved address", async () => {
    const token = await mintToken();

    expect(await storefrontPreviewService.readPage({ token, path: "/preview" })).toEqual({
      kind: "not_found",
    });
  });

  it("returns gone for a suspended site", async () => {
    const token = await mintToken();
    await prisma.cmsSite.update({ where: { id: fixture.siteId }, data: { status: "SUSPENDED" } });
    try {
      expect(await storefrontPreviewService.readPage({ token, path: "/" })).toEqual({
        kind: "gone",
      });
    } finally {
      await prisma.cmsSite.update({ where: { id: fixture.siteId }, data: { status: "DRAFT" } });
    }
  });

  it("invalidates a link when its host is no longer active", async () => {
    const token = await mintToken();
    await prisma.cmsDomain.updateMany({
      where: { siteId: fixture.siteId },
      data: { status: "PENDING_VERIFICATION" },
    });
    try {
      expect(await storefrontPreviewService.readPage({ token, path: "/" })).toEqual({
        kind: "not_found",
      });
    } finally {
      await prisma.cmsDomain.updateMany({
        where: { siteId: fixture.siteId },
        data: { status: "ACTIVE" },
      });
    }
  });
});

describe.skipIf(!cmsTestEnabled)("signed preview token shape", () => {
  it("rejects empty, oversized and malformed tokens", async () => {
    const cases = [
      "",
      "x".repeat(4097),
      "no-dot-token",
      ".signature-only",
      "body-only.",
    ];
    const outcomes = await Promise.all(
      cases.map((token) => storefrontPreviewService.readPage({ token, path: "/" }))
    );
    for (const outcome of outcomes) {
      expect(outcome).toEqual({ kind: "not_found" });
    }
  });

  it("rejects a signed body that is not JSON", async () => {
    const token = signRawBody("not-json");

    expect(await storefrontPreviewService.readPage({ token, path: "/" })).toEqual({
      kind: "not_found",
    });
  });

  it("rejects a signed payload with an unknown version", async () => {
    const token = signToken({ v: 2, host: HOST, exp: Math.floor(Date.now() / 1000) + 60 });

    expect(await storefrontPreviewService.readPage({ token, path: "/" })).toEqual({
      kind: "not_found",
    });
  });
});

describe.skipIf(!cmsTestEnabled)("preview link route", () => {
  it("issues the link for a preview-capable actor", async () => {
    const app = createSiteApp([PERMISSIONS.WEBSITE_BUILDER.PAGES_PREVIEW]);

    const response = await app.request(PREVIEW_PATH + fixture.siteId + "/preview-link");

    expect(response.status).toBe(200);
    const body = (await response.json()) as {
      data: { preview: { url: string; expiresAt: string } };
    };
    expect(new URL(body.data.preview.url).hostname).toBe(HOST);
    expect(new Date(body.data.preview.expiresAt).getTime()).toBeGreaterThan(Date.now());
  });

  it("denies an actor without the preview capability", async () => {
    const app = createSiteApp([PERMISSIONS.WEBSITE_BUILDER.SITES_READ]);

    const response = await app.request(PREVIEW_PATH + fixture.siteId + "/preview-link");

    expect(response.status).toBe(403);
  });
});

describe("public preview route", () => {
  it("renders a published preview outcome", async () => {
    const app = createStorefrontRouter(
      fakeReadService,
      previewServiceWith({
        kind: "published",
        page: {
          title: "Home",
          path: "/",
          ast: PageAstSchema.parse(draftAst("Preview")),
          media: {},
          tokens: DEFAULT_APPEARANCE_TOKENS,
        },
      })
    );

    const response = await app.request("/preview?token=any-token&path=/");

    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
    const body = (await response.json()) as { ast: { meta?: { title?: string } } };
    expect(body.ast.meta?.title).toBe("Preview");
  });

  it("answers 410 when the preview service reports the site is gone", async () => {
    const app = createStorefrontRouter(
      fakeReadService,
      previewServiceWith({ kind: "gone" })
    );

    const response = await app.request("/preview?token=any-token&path=/");

    expect(response.status).toBe(410);
    expect(response.headers.get("Content-Type")).toContain("application/problem+json");
    const body = (await response.json()) as { code?: string };
    expect(body.code).toBe(STOREFRONT_ERROR_CODE.GONE);
  });

  it("answers a neutral 404 for an invalid token", async () => {
    const app = createStorefrontRouter(
      fakeReadService,
      previewServiceWith({ kind: "not_found" })
    );

    const response = await app.request("/preview?token=invalid");

    expect(response.status).toBe(404);
  });
});
