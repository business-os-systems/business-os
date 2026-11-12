import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Hono } from "hono";
import { PERMISSIONS } from "@suite/core";
import { prisma } from "@suite/db";
import { globalErrorHandler } from "../src/middleware/error-handler.js";
import { createCmsSitesRouter } from "../src/routes/cms/sites.js";
import {
  CREATION_FUNNEL_STAGES,
  creationFunnelCounter,
  recordCreationFunnelStage,
  type CreationFunnelStage,
} from "../src/services/admin/creation-funnel.service.js";
import { openReview } from "../src/services/cms/review-service.js";
import { publishSite } from "../src/services/cms/publish-service.js";

const enabled = Boolean(process.env.DATABASE_URL && process.env.TENANT_DATABASE_URL);
const RUN = Date.now().toString(36).toUpperCase();
const ORG = "org_wt381_funnel_" + RUN;
const PREVIOUS_DOMAIN_ROOT = process.env.DOMAIN_ROOT;

interface Variables {
  user: { permissions?: string[] };
  userId?: string;
  organizationId?: string;
}

async function counterValue(stage: CreationFunnelStage): Promise<number> {
  const metric = await creationFunnelCounter.get();
  const entry = metric.values.find((value) => value.labels.stage === stage);
  return entry?.value ?? 0;
}

async function createSiteThroughRoute(): Promise<{ siteId: string; homePageId: string }> {
  const app = new Hono<{ Variables: Variables }>();
  app.onError(globalErrorHandler);
  app.use("*", async (c, next) => {
    c.set("user", { permissions: [PERMISSIONS.WEBSITE_BUILDER.SITES_WRITE] });
    c.set("userId", "usr_wt381_funnel");
    c.set("organizationId", ORG);
    await next();
  });
  app.route("/api/v1/cms", createCmsSitesRouter());

  const response = await app.request("/api/v1/cms/sites", {
    method: "POST",
    headers: { "Content-Type": "application/json", "Idempotency-Key": "idem-funnel-" + RUN },
    body: JSON.stringify({ title: "Funnel site", slug: "funnel-" + RUN.toLowerCase(), templateId: null }),
  });
  expect(response.status).toBe(201);
  const body = (await response.json()) as {
    data: { site: { id: string }; homePage: { id: string } };
  };
  return { siteId: body.data.site.id, homePageId: body.data.homePage.id };
}

beforeAll(async () => {
  if (!enabled) {
    return;
  }
  process.env.DOMAIN_ROOT = "example.test";
  await prisma.organization.create({
    data: { id: ORG, name: "WT381 funnel", slug: "wt381-funnel-" + RUN },
  });
});

afterAll(async () => {
  if (!enabled) {
    return;
  }
  if (PREVIOUS_DOMAIN_ROOT === undefined) {
    delete process.env.DOMAIN_ROOT;
  } else {
    process.env.DOMAIN_ROOT = PREVIOUS_DOMAIN_ROOT;
  }
  await prisma.cmsAuditTrail.deleteMany({ where: { organizationId: ORG } });
  await prisma.cmsPageVersion.deleteMany({ where: { organizationId: ORG } });
  await prisma.cmsPageContent.deleteMany({ where: { organizationId: ORG } });
  await prisma.cmsPage.deleteMany({ where: { organizationId: ORG } });
  await prisma.cmsSite.deleteMany({ where: { organizationId: ORG } });
  await prisma.organization.deleteMany({ where: { id: ORG } });
});

describe("creation funnel recorder", () => {
  it("increments the closed stage registry", async () => {
    const before = await counterValue(CREATION_FUNNEL_STAGES.SITE_CREATED);

    recordCreationFunnelStage(CREATION_FUNNEL_STAGES.SITE_CREATED);

    expect(await counterValue(CREATION_FUNNEL_STAGES.SITE_CREATED)).toBe(before + 1);
  });
});

describe.skipIf(!enabled)("creation-to-publish funnel wiring", () => {
  it("records creation, review and publish without a replayed double count", async () => {
    const createdBefore = await counterValue(CREATION_FUNNEL_STAGES.SITE_CREATED);
    const reviewedBefore = await counterValue(CREATION_FUNNEL_STAGES.REVIEW_OPENED);
    const publishedBefore = await counterValue(CREATION_FUNNEL_STAGES.SITE_PUBLISHED);

    const { siteId } = await createSiteThroughRoute();
    expect(await counterValue(CREATION_FUNNEL_STAGES.SITE_CREATED)).toBe(createdBefore + 1);

    const review = await openReview({
      organizationId: ORG,
      siteId,
      actorUserId: "usr_wt381_funnel",
    });
    expect(await counterValue(CREATION_FUNNEL_STAGES.REVIEW_OPENED)).toBe(reviewedBefore + 1);

    const input = {
      organizationId: ORG,
      siteId,
      reviewId: review.reviewId,
      publisherUserId: "usr_wt381_funnel",
      idempotencyKey: "idem-funnel-publish-" + RUN,
      changeNote: null,
    };
    await publishSite(input);
    expect(await counterValue(CREATION_FUNNEL_STAGES.SITE_PUBLISHED)).toBe(publishedBefore + 1);

    await publishSite(input);
    expect(await counterValue(CREATION_FUNNEL_STAGES.SITE_PUBLISHED)).toBe(publishedBefore + 1);
  });
});
