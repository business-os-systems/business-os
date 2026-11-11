import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma, Prisma, withTenantContext } from "@suite/db";
import { getHostModelConfig } from "@suite/core";
import { NotFoundError, ServiceUnavailableError, ValidationError } from "@suite/core/errors";
import { PageAstSchema } from "../../src/ast/schema.js";
import { provisionSiteFromTemplate, siteHostname } from "../../src/services/site-provisioning.js";
import { SiteService } from "../../src/services/site-service.js";
import {
  publishedDefinitionKey,
  readPublishedDefinitions,
} from "../../src/services/published-catalog.js";

const enabled = Boolean(process.env.DATABASE_URL);
const RUN = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
const ORG = "org_wt368_" + RUN;
const BRANCH = "br_wt368_" + RUN;
const TEMPLATE_SLUG = "wt368-template-" + RUN;
const ACTOR = "usr_wt368_actor";
const BRANCH_TIMEZONE = "Europe/Berlin";

function requireHostRoot(): string {
  const hostRoot = getHostModelConfig().tenantRootDomain;
  if (hostRoot === null) {
    throw new Error(
      "DOMAIN_ROOT must be configured for website-builder integration tests (CI exports localhost).",
    );
  }
  return hostRoot;
}

const PUBLISHED_BLUEPRINT = {
  schemaVersion: "2026-03",
  pages: [
    {
      version: 1,
      schemaVersion: "2026-03",
      meta: { title: "Published home" },
      sections: [],
    },
  ],
};

const DRAFT_BLUEPRINT = {
  schemaVersion: "2026-03",
  pages: [
    {
      version: 1,
      schemaVersion: "2026-03",
      meta: { title: "Draft landing" },
      sections: [],
    },
  ],
};

async function cleanup(): Promise<void> {
  const sites = await prisma.cmsSite.findMany({
    where: { organizationId: ORG },
    select: { id: true },
  });
  const siteIds = sites.map((site) => site.id);
  await prisma.cmsAuditTrail.deleteMany({ where: { organizationId: ORG } });
  await prisma.cmsPageContent.deleteMany({ where: { organizationId: ORG } });
  await prisma.cmsPageVersion.deleteMany({ where: { organizationId: ORG } });
  await prisma.cmsPage.deleteMany({ where: { siteId: { in: siteIds } } });
  await prisma.cmsSite.deleteMany({ where: { organizationId: ORG } });
  await prisma.cmsCatalogItemVersion.deleteMany({
    where: { item: { slug: { startsWith: TEMPLATE_SLUG } } },
  });
  await prisma.cmsCatalogItem.deleteMany({ where: { slug: { startsWith: TEMPLATE_SLUG } } });
  await prisma.branch.deleteMany({ where: { organizationId: ORG } });
  await prisma.organization.deleteMany({ where: { id: ORG } });
}

function createTemplate(input: { readonly slug: string; readonly published: boolean }) {
  return prisma.cmsCatalogItem.create({
    data: {
      kind: "TEMPLATE",
      scope: "GLOBAL",
      organizationId: null,
      name: "WT-368 template",
      slug: TEMPLATE_SLUG + "-" + input.slug,
      category: "hospitality",
      industries: ["hospitality"],
      definition: DRAFT_BLUEPRINT,
      status: "ACTIVE",
      currentVersion: 1,
      draftVersion: 2,
      createdBy: ACTOR,
      updatedBy: ACTOR,
    },
  });
}

function publishTemplateVersion(
  itemId: string,
  definition: Prisma.InputJsonValue = PUBLISHED_BLUEPRINT,
) {
  return prisma.cmsCatalogItemVersion.create({
    data: {
      itemId,
      version: 1,
      definition,
      status: "ACTIVE",
      publishedAt: new Date(),
      publishedBy: ACTOR,
      createdBy: ACTOR,
    },
  });
}

function provisionInput(
  templateId: string,
  overrides: {
    readonly branchId?: string | null;
    readonly slug?: string;
    readonly idempotencyKey?: string;
  } = {},
) {
  return {
    organizationId: ORG,
    branchId: overrides.branchId === undefined ? null : overrides.branchId,
    actorUserId: ACTOR,
    idempotencyKey: overrides.idempotencyKey ?? "idem-wt368-" + RUN,
    title: "WT-368 site",
    slug: overrides.slug ?? "wt368-site-" + RUN,
    templateId,
    primaryLocale: null,
    brandName: null,
  };
}

const MULTI_PAGE_BLUEPRINT = {
  schemaVersion: "2026-03",
  pages: [
    {
      version: 1,
      schemaVersion: "2026-03",
      meta: { title: "Home" },
      sections: [],
    },
    {
      version: 1,
      schemaVersion: "2026-03",
      meta: { title: "About Us" },
      sections: [],
    },
  ],
};

const INVALID_BLUEPRINT = {
  schemaVersion: "2026-03",
  pages: [{ version: 1, schemaVersion: "2026-03", meta: { title: "Broken" } }],
};

let publishedTemplateId = "";
let multiPageTemplateId = "";
let invalidTemplateId = "";

beforeAll(async () => {
  if (!enabled) return;
  await cleanup();
  await prisma.organization.create({
    data: { id: ORG, name: "WT-368 tenant", slug: "wt368-" + RUN },
  });
  await prisma.branch.create({
    data: {
      id: BRANCH,
      organizationId: ORG,
      name: "WT-368 branch",
      code: "WT368-" + RUN,
      type: "hospitality",
      timezone: BRANCH_TIMEZONE,
    },
  });
  const published = await createTemplate({ slug: "published", published: true });
  await publishTemplateVersion(published.id);
  publishedTemplateId = published.id;
  const multiPage = await createTemplate({ slug: "multi", published: true });
  await publishTemplateVersion(multiPage.id, MULTI_PAGE_BLUEPRINT);
  multiPageTemplateId = multiPage.id;
  const invalid = await createTemplate({ slug: "invalid", published: true });
  await publishTemplateVersion(invalid.id, INVALID_BLUEPRINT);
  invalidTemplateId = invalid.id;
});

afterAll(async () => {
  if (!enabled) return;
  await cleanup();
  await prisma.$disconnect();
});

describe.skipIf(!enabled)("Published catalog definitions (FR-012, FR-005)", () => {
  it("reads the immutable version row for the current version", async () => {
    const definitions = await withTenantContext(ORG, (tx) =>
      readPublishedDefinitions(tx, [{ id: publishedTemplateId, currentVersion: 1 }]),
    );

    expect(definitions.get(publishedDefinitionKey(publishedTemplateId, 1))).toMatchObject({
      pages: [{ meta: { title: "Published home" } }],
    });
  });

  it("returns an empty map when there is nothing to read", async () => {
    const definitions = await withTenantContext(ORG, (tx) => readPublishedDefinitions(tx, []));

    expect(definitions.size).toBe(0);
  });

  it("provisions the home page from the published blueprint, not the working draft", async () => {
    const result = await provisionSiteFromTemplate(provisionInput(publishedTemplateId));

    expect(result.pages).toHaveLength(1);
    expect(result.homePage.title).toBe("Published home");
  });

  it("refuses a template whose published version row is missing", async () => {
    const unbacked = await createTemplate({ slug: "unbacked", published: false });

    await expect(
      provisionSiteFromTemplate({
        ...provisionInput(unbacked.id),
        idempotencyKey: "idem-wt368-unbacked-" + RUN,
      }),
    ).rejects.toBeInstanceOf(NotFoundError);
  });
});

describe.skipIf(!enabled)("Site provisioning host and tenancy (FR-117, CT-8)", () => {
  it("writes a PageAst home page and the host-model primary domain", async () => {
    const slug = "wt368-host-" + RUN;
    const result = await provisionSiteFromTemplate(
      provisionInput(publishedTemplateId, {
        branchId: BRANCH,
        slug,
        idempotencyKey: "idem-wt368-host-" + RUN,
      }),
    );
    const hostRoot = requireHostRoot();
    const content = await prisma.cmsPageContent.findFirst({
      where: { organizationId: ORG, pageId: result.homePage.id },
    });
    const homeAst = PageAstSchema.parse(content?.draftAst);

    expect(result.site.timezone).toBe(BRANCH_TIMEZONE);
    expect(homeAst).toMatchObject({ version: 1, schemaVersion: "2026-03" });
    expect(homeAst.sections).toHaveLength(0);
    expect(
      await prisma.cmsDomain.findFirst({
        where: { organizationId: ORG, siteId: result.site.id, isPrimary: true },
      }),
    ).toMatchObject({
      hostname: slug + "." + hostRoot,
      isSubdomain: true,
    });
  });

  it("repairs a missing primary domain when the same request replays", async () => {
    const slug = "wt368-replay-" + RUN;
    const key = "idem-wt368-replay-" + RUN;
    const first = await provisionSiteFromTemplate(
      provisionInput(publishedTemplateId, { slug, idempotencyKey: key }),
    );
    await prisma.cmsDomain.deleteMany({ where: { siteId: first.site.id } });

    const replay = await provisionSiteFromTemplate(
      provisionInput(publishedTemplateId, { slug, idempotencyKey: key }),
    );
    expect(replay.replayed).toBe(true);
    expect(await prisma.cmsDomain.count({ where: { siteId: first.site.id } })).toBe(1);
  });
});

describe.skipIf(!enabled)("Provisioning refusals (FR-017, CT-8)", () => {
  it("refuses a branch that is not in the workspace", async () => {
    await expect(
      provisionSiteFromTemplate(
        provisionInput(publishedTemplateId, {
          branchId: "br_wt368_foreign",
          slug: "wt368-foreign-branch-" + RUN,
          idempotencyKey: "idem-wt368-foreign-branch-" + RUN,
        })
      )
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it("refuses an unknown template id", async () => {
    await expect(
      provisionSiteFromTemplate(
        provisionInput("tpl_wt368_missing", {
          slug: "wt368-missing-template-" + RUN,
          idempotencyKey: "idem-wt368-missing-template-" + RUN,
        })
      )
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it("refuses to reuse a request id for a different payload", async () => {
    const key = "idem-wt368-conflict-" + RUN;
    await provisionSiteFromTemplate(
      provisionInput(publishedTemplateId, {
        slug: "wt368-conflict-a-" + RUN,
        idempotencyKey: key,
      })
    );

    await expect(
      provisionSiteFromTemplate(
        provisionInput(publishedTemplateId, {
          slug: "wt368-conflict-b-" + RUN,
          idempotencyKey: key,
        })
      )
    ).rejects.toMatchObject({ code: "IDEMPOTENCY_CONFLICT" });
  });

});

describe.skipIf(!enabled)("Legacy create inputs are refused (FR-017, CT-8)", () => {
  it("fails closed when the host root is not declared", () => {
    expect(() => siteHostname("tenant", null)).toThrow(ServiceUnavailableError);
  });

  it("refuses the legacy template enum and a client-supplied timezone", async () => {
    const service = new SiteService();
    await expect(
      service.createSite({
        organizationId: ORG,
        title: "Legacy",
        slug: "wt368-legacy-" + RUN,
        initialTemplate: "hero_starter",
      }),
    ).rejects.toBeInstanceOf(ValidationError);
    await expect(
      service.createSite({
        organizationId: ORG,
        title: "Legacy clock",
        slug: "wt368-legacy-clock-" + RUN,
        timezone: "UTC",
      }),
    ).rejects.toBeInstanceOf(ValidationError);
  });
});

describe.skipIf(!enabled)("SiteService delegation (T139)", () => {
  it("provisions through the one implementation with the caller metadata", async () => {
    const service = new SiteService();
    const result = await service.createSite({
      organizationId: ORG,
      branchId: BRANCH,
      actorUserId: ACTOR,
      idempotencyKey: "idem-wt368-service-" + RUN,
      title: "Delegated site",
      slug: "wt368-delegated-" + RUN,
      templateId: publishedTemplateId,
      primaryLocale: "fr",
      brandName: "Delegated Brand",
    });

    expect(result.site.timezone).toBe(BRANCH_TIMEZONE);
    expect(result.site.primaryLocale).toBe("fr");
    expect(
      await prisma.cmsSiteSettings.findUnique({ where: { siteId: result.site.id } })
    ).toMatchObject({ brandName: "Delegated Brand" });
  });
});

describe.skipIf(!enabled)("SiteService reads (T139)", () => {
  it("lists and reads a tenant site with its host-model domain", async () => {
    const slug = "wt368-reads-" + RUN;
    const created = await provisionSiteFromTemplate(
      provisionInput(publishedTemplateId, {
        slug,
        idempotencyKey: "idem-wt368-reads-" + RUN,
      })
    );
    const service = new SiteService();

    const sites = await service.listSites(ORG);
    const summary = sites.find((site) => site.id === created.site.id);
    expect(summary).toMatchObject({
      slug,
      primaryDomain: slug + "." + requireHostRoot(),
    });
    expect((await service.getSite(ORG, created.site.id))?.id).toBe(created.site.id);
  });

  it("returns phonetic alternatives when the host is already claimed", async () => {
    const slug = "wt368-claimed-" + RUN;
    await provisionSiteFromTemplate(
      provisionInput(publishedTemplateId, {
        slug,
        idempotencyKey: "idem-wt368-claimed-" + RUN,
      })
    );

    const availability = await new SiteService().checkSubdomainAvailability(slug);
    expect(availability.available).toBe(false);
    expect(availability.suggestions.length).toBeGreaterThan(0);
  });
});

describe.skipIf(!enabled)("Template page trees (FR-019)", () => {
  it("copies every published template page and derives its address", async () => {
    const result = await provisionSiteFromTemplate(
      provisionInput(multiPageTemplateId, {
        slug: "wt368-multi-" + RUN,
        idempotencyKey: "idem-wt368-multi-" + RUN,
      })
    );

    expect(result.pages.map((page) => page.slug).sort()).toEqual(["/", "/about-us"]);
  });

  it("refuses a published blueprint that is not a valid PageAst set", async () => {
    await expect(
      provisionSiteFromTemplate(
        provisionInput(invalidTemplateId, {
          slug: "wt368-invalid-" + RUN,
          idempotencyKey: "idem-wt368-invalid-" + RUN,
        })
      )
    ).rejects.toBeInstanceOf(ValidationError);
  });
});
