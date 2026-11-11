import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@suite/db";
import { getHostModelConfig } from "@suite/core";
import { NotFoundError } from "@suite/core/errors";
import { PageAstSchema } from "@suite/website-builder/ast";
import { CMS_AUDIT_ACTIONS } from "@suite/website-builder/audit";
import { createSite, getSite } from "../../src/services/cms/site-service.js";
import { getPageContent } from "../../src/services/cms/page-content.service.js";

const enabled = Boolean(process.env.DATABASE_URL && process.env.TENANT_DATABASE_URL);
const RUN = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
const ORG = "org_wt371_" + RUN;
const OTHER_ORG = "org_wt371_other_" + RUN;
const BRANCH = "br_wt371_" + RUN;
const ACTOR = "usr_wt371_actor";
const TEMPLATE_SLUG = "wt371-template-" + RUN;
const BRANCH_TIMEZONE = "America/New_York";

function requireHostRoot(): string {
  const hostRoot = getHostModelConfig().tenantRootDomain;
  if (hostRoot === null) {
    throw new Error(
      "DOMAIN_ROOT must be configured to exercise the site host model (CI exports localhost).",
    );
  }
  return hostRoot;
}

const HERO_SECTION = {
  id: "sec_wt371_hero",
  name: "Hero",
  blocks: [
    {
      id: "blk_wt371_hero",
      type: "hero",
      props: {
        headline: "Mountain air, every morning",
        subheadline: "A quiet stay above the valley.",
        primaryCta: { label: "Book now", target: { url: "/book" } },
      },
    },
  ],
};

const FEATURES_SECTION = {
  id: "sec_wt371_features",
  name: "Features",
  blocks: [
    {
      id: "blk_wt371_features",
      type: "features",
      props: {
        headline: "Why stay with us",
        features: [
          { id: "feat_wt371_1", title: "Valley views", description: "Every room faces the ridge." },
        ],
      },
    },
  ],
};

const BLUEPRINT = {
  schemaVersion: "2026-03",
  pages: [
    {
      version: 1,
      schemaVersion: "2026-03",
      meta: { title: "Home" },
      sections: [HERO_SECTION],
    },
    {
      version: 1,
      schemaVersion: "2026-03",
      meta: { title: "About" },
      sections: [FEATURES_SECTION],
    },
  ],
};

async function cleanup(): Promise<void> {
  const organizations = [ORG, OTHER_ORG];
  await prisma.cmsAuditTrail.deleteMany({ where: { organizationId: { in: organizations } } });
  await prisma.cmsPageContent.deleteMany({ where: { organizationId: { in: organizations } } });
  await prisma.cmsPageVersion.deleteMany({ where: { organizationId: { in: organizations } } });
  await prisma.cmsPage.deleteMany({ where: { organizationId: { in: organizations } } });
  await prisma.cmsDomain.deleteMany({ where: { organizationId: { in: organizations } } });
  await prisma.cmsSite.deleteMany({ where: { organizationId: { in: organizations } } });
  await prisma.cmsCatalogItemVersion.deleteMany({
    where: { item: { slug: { startsWith: TEMPLATE_SLUG } } },
  });
  await prisma.cmsCatalogItem.deleteMany({ where: { slug: { startsWith: TEMPLATE_SLUG } } });
  await prisma.branch.deleteMany({ where: { organizationId: { in: organizations } } });
  await prisma.organization.deleteMany({ where: { id: { in: organizations } } });
}

let templateId = "";

beforeAll(async () => {
  if (!enabled) {
    return;
  }
  requireHostRoot();
  await cleanup();
  await prisma.organization.create({
    data: { id: ORG, name: "WT-371 tenant", slug: "wt371-" + RUN },
  });
  await prisma.organization.create({
    data: { id: OTHER_ORG, name: "WT-371 other tenant", slug: "wt371-other-" + RUN },
  });
  await prisma.branch.create({
    data: {
      id: BRANCH,
      organizationId: ORG,
      name: "WT-371 branch",
      code: "WT371-" + RUN,
      type: "hospitality",
      timezone: BRANCH_TIMEZONE,
    },
  });
  const template = await prisma.cmsCatalogItem.create({
    data: {
      kind: "TEMPLATE",
      scope: "GLOBAL",
      organizationId: null,
      name: "WT-371 template",
      slug: TEMPLATE_SLUG,
      category: "hospitality",
      industries: ["hospitality"],
      definition: BLUEPRINT,
      status: "ACTIVE",
      currentVersion: 1,
      createdBy: ACTOR,
      updatedBy: ACTOR,
    },
  });
  await prisma.cmsCatalogItemVersion.create({
    data: {
      itemId: template.id,
      version: 1,
      definition: BLUEPRINT,
      status: "ACTIVE",
      publishedAt: new Date(),
      publishedBy: ACTOR,
      createdBy: ACTOR,
    },
  });
  templateId = template.id;
});

afterAll(async () => {
  if (!enabled) {
    return;
  }
  await cleanup();
  await prisma.$disconnect();
});

function createInput(slug: string, idempotencyKey: string) {
  return {
    organizationId: ORG,
    branchId: BRANCH,
    actorUserId: ACTOR,
    idempotencyKey,
    body: {
      title: "WT-371 Riverview",
      slug,
      templateId,
    },
  };
}

describe.skipIf(!enabled)("create a site from a published catalog template", () => {
  it("copies the template pages and their sections into the new home page", async () => {
    const result = await createSite(createInput("wt371-home-" + RUN, "idem-wt371-home-" + RUN));

    expect(result.pageCount).toBe(2);
    expect(result.homePage.path).toBe("/");

    const homeContent = await getPageContent({
      organizationId: ORG,
      pageId: result.homePage.id,
    });
    const homeAst = PageAstSchema.parse(homeContent.draftAst);
    expect(homeAst.sections).toHaveLength(1);
    expect(PageAstSchema.safeParse(homeContent.draftAst).success).toBe(true);
    expect(homeAst.sections[0]?.blocks[0]).toMatchObject({
      type: "hero",
      props: { headline: "Mountain air, every morning" },
    });

    const aboutPage = await prisma.cmsPage.findFirst({
      where: { organizationId: ORG, siteId: result.site.id, slug: "/about" },
      include: { content: true },
    });
    expect(aboutPage?.isHomePage).toBe(false);
    expect(aboutPage?.content?.draftAst).toMatchObject({ sections: [FEATURES_SECTION] });
  });

  it("stamps the primary host from the declared host root and the tenant branch timezone", async () => {
    const slug = "wt371-host-" + RUN;
    const result = await createSite(createInput(slug, "idem-wt371-host-" + RUN));
    const hostRoot = requireHostRoot();

    expect(result.site.timezone).toBe(BRANCH_TIMEZONE);
    const domains = await prisma.cmsDomain.findMany({
      where: { organizationId: ORG, siteId: result.site.id },
    });
    expect(domains).toHaveLength(1);
    expect(domains[0]).toMatchObject({
      hostname: slug + "." + hostRoot,
      isPrimary: true,
      isSubdomain: true,
    });
    expect(domains[0]?.hostname).not.toContain("business-os.site");
  });

  it("writes the creation audit row with the verified actor", async () => {
    const result = await createSite(createInput("wt371-audit-" + RUN, "idem-wt371-audit-" + RUN));
    const audit = await prisma.cmsAuditTrail.findFirst({
      where: { organizationId: ORG, siteId: result.site.id },
    });
    expect(audit).toMatchObject({
      action: CMS_AUDIT_ACTIONS.SITE_CREATED,
      actorUserId: ACTOR,
      entityId: result.site.id,
    });
  });

  it("keeps another tenant's new home page unreadable", async () => {
    const result = await createSite(
      createInput("wt371-private-" + RUN, "idem-wt371-private-" + RUN),
    );

    expect(await getSite({ organizationId: OTHER_ORG, siteId: result.site.id })).toBeNull();
    await expect(
      getPageContent({ organizationId: OTHER_ORG, pageId: result.homePage.id }),
    ).rejects.toBeInstanceOf(NotFoundError);
  });
});
