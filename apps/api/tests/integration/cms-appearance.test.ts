import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@suite/db";
import { ConflictError, NotFoundError } from "@suite/core/errors";
import {
  APPEARANCE_TOKEN_KEYS,
  DEFAULT_APPEARANCE_TOKENS,
  normalizeAppearanceTokens,
} from "@suite/website-builder/appearance";
import { createSite } from "../../src/services/cms/site-service.js";
import {
  getSiteAppearance,
  listPublishedThemes,
  publishSiteAppearance,
  resetSiteAppearance,
  selectAppearanceTheme,
  updateSiteAppearance,
} from "../../src/services/cms/appearance-service.js";

const enabled = Boolean(process.env.DATABASE_URL && process.env.TENANT_DATABASE_URL);
const RUN = Date.now().toString(36);
const ORG_A = "org_wt354_a_" + RUN;
const ORG_B = "org_wt354_b_" + RUN;
const ACTOR = "usr_wt354_actor";
const THEME_SLUG_PREFIX = "wt354-theme-" + RUN;

const SELECTED_TOKENS = {
  colorPrimary: "#123456",
  colorBackground: "#F0F0F0",
  fontHeading: "Georgia, serif",
  fontBody: "DM Sans, system-ui, sans-serif",
};

const UPDATED_CATALOG_TOKENS = {
  colorPrimary: "#ABCDEF",
  colorBackground: "#101010",
  fontHeading: "Playfair Display, Georgia, serif",
  fontBody: "Inter, system-ui, sans-serif",
};

async function cleanup(): Promise<void> {
  const orgs = [ORG_A, ORG_B];
  await prisma.cmsSiteAppearance.deleteMany({ where: { organizationId: { in: orgs } } });
  await prisma.cmsAuditTrail.deleteMany({ where: { organizationId: { in: orgs } } });
  await prisma.cmsPageContent.deleteMany({ where: { organizationId: { in: orgs } } });
  await prisma.cmsPageVersion.deleteMany({ where: { organizationId: { in: orgs } } });
  await prisma.cmsPage.deleteMany({ where: { organizationId: { in: orgs } } });
  await prisma.cmsSite.deleteMany({ where: { organizationId: { in: orgs } } });
  await prisma.cmsCatalogItemVersion.deleteMany({
    where: { item: { slug: { startsWith: THEME_SLUG_PREFIX } } },
  });
  await prisma.cmsCatalogItem.deleteMany({
    where: { slug: { startsWith: THEME_SLUG_PREFIX } },
  });
  await prisma.organization.deleteMany({ where: { id: { in: orgs } } });
}

async function createTenant(id: string, label: string): Promise<void> {
  await prisma.organization.create({
    data: { id, name: "T-09 " + label, slug: "wt354-" + label + "-" + RUN },
  });
}

async function createTheme(input: {
  readonly slug: string;
  readonly tokens: Record<string, string>;
  readonly organizationId?: string | null;
}) {
  const definition = { schemaVersion: "2026-03", tokens: input.tokens };
  return prisma.cmsCatalogItem.create({
    data: {
      kind: "THEME",
      scope: input.organizationId === undefined || input.organizationId === null ? "GLOBAL" : "TENANT",
      organizationId: input.organizationId ?? null,
      name: "T-09 theme " + input.slug,
      slug: THEME_SLUG_PREFIX + "-" + input.slug,
      category: "hospitality",
      industries: ["hospitality"],
      definition,
      status: "ACTIVE",
      currentVersion: 1,
      createdBy: ACTOR,
      updatedBy: ACTOR,
      versions: {
        create: {
          version: 1,
          definition,
          status: "ACTIVE",
          publishedAt: new Date(),
          publishedBy: ACTOR,
          createdBy: ACTOR,
        },
      },
    },
  });
}

async function createBlankSite(organizationId: string, slug: string) {
  const outcome = await createSite({
    organizationId,
    branchId: null,
    actorUserId: ACTOR,
    idempotencyKey: "idem-wt354-" + slug,
    body: { title: "Appearance site " + slug, slug, templateId: null },
  });
  return outcome.site.id;
}

let themeId = "";

beforeAll(async () => {
  if (!enabled) {
    return;
  }
  await cleanup();
  await createTenant(ORG_A, "a");
  await createTenant(ORG_B, "b");
  const theme = await createTheme({ slug: "base", tokens: SELECTED_TOKENS });
  themeId = theme.id;
});

afterAll(async () => {
  if (!enabled) {
    return;
  }
  await cleanup();
  await prisma.$disconnect();
});

describe.skipIf(!enabled)("site appearance snapshot (T114, T120)", () => {
  it("creates a complete appearance snapshot with the site", async () => {
    const siteId = await createBlankSite(ORG_A, "created-" + RUN);
    const row = await prisma.cmsSiteAppearance.findUnique({ where: { siteId } });
    expect(row).not.toBeNull();
    const tokens = normalizeAppearanceTokens(row?.draftTokens);
    expect(Object.keys(tokens).sort()).toEqual([...APPEARANCE_TOKEN_KEYS].sort());
    expect(tokens).toEqual(DEFAULT_APPEARANCE_TOKENS);
  });

  it("copies a selected theme into the site and records its source", async () => {
    const siteId = await createBlankSite(ORG_A, "selected-" + RUN);
    const before = await getSiteAppearance({ organizationId: ORG_A, siteId });
    const selected = await selectAppearanceTheme({
      organizationId: ORG_A,
      siteId,
      actorUserId: ACTOR,
      expectedVersion: before.version,
      body: { expectedVersion: before.version, catalogItemId: themeId },
    });
    expect(selected.draftTokens.colorPrimary).toBe(SELECTED_TOKENS.colorPrimary);
    expect(selected.draftTokens.colorBackground).toBe(SELECTED_TOKENS.colorBackground);
    expect(selected.draftTokens.fontHeading).toBe(SELECTED_TOKENS.fontHeading);
    expect(selected.sourceItemId).toBe(themeId);
    expect(selected.sourceVersion).toBe(1);
    expect(selected.publishedTokens).toEqual(DEFAULT_APPEARANCE_TOKENS);
    expect(selected.hasUnpublishedChanges).toBe(true);

    const audit = await prisma.cmsAuditTrail.findFirst({
      where: { organizationId: ORG_A, siteId, action: "APPEARANCE_THEME_SELECTED" },
    });
    expect(audit?.actorUserId).toBe(ACTOR);
    expect(audit?.entityType).toBe("CmsSiteAppearance");
  });

});

describe.skipIf(!enabled)("catalog theme immutability (T120)", () => {
  it("keeps a published site unchanged when the source catalog theme changes", async () => {
    const siteId = await createBlankSite(ORG_A, "immutable-" + RUN);
    const immutableTheme = await createTheme({
      slug: "immutable-" + RUN,
      tokens: SELECTED_TOKENS,
    });
    const before = await getSiteAppearance({ organizationId: ORG_A, siteId });
    const selected = await selectAppearanceTheme({
      organizationId: ORG_A,
      siteId,
      actorUserId: ACTOR,
      expectedVersion: before.version,
      body: { expectedVersion: before.version, catalogItemId: immutableTheme.id },
    });
    const published = await publishSiteAppearance({
      organizationId: ORG_A,
      siteId,
      actorUserId: ACTOR,
      expectedVersion: selected.version,
    });
    const siteBefore = await prisma.cmsSite.findUniqueOrThrow({ where: { id: siteId } });
    const appearanceBefore = await prisma.cmsSiteAppearance.findUniqueOrThrow({
      where: { siteId },
    });

    await prisma.cmsCatalogItem.update({
      where: { id: immutableTheme.id },
      data: {
        definition: { schemaVersion: "2026-03", tokens: UPDATED_CATALOG_TOKENS },
        currentVersion: 2,
      },
    });

    const after = await getSiteAppearance({ organizationId: ORG_A, siteId });
    const siteAfter = await prisma.cmsSite.findUniqueOrThrow({ where: { id: siteId } });
    const appearanceAfter = await prisma.cmsSiteAppearance.findUniqueOrThrow({
      where: { siteId },
    });
    expect(after.publishedTokens).toEqual(published.publishedTokens);
    expect(after.publishedTokens.colorPrimary).toBe(SELECTED_TOKENS.colorPrimary);
    expect(after.draftTokens).toEqual(published.draftTokens);
    expect(appearanceAfter.publishedTokens).toEqual(appearanceBefore.publishedTokens);
    expect(appearanceAfter.draftTokens).toEqual(appearanceBefore.draftTokens);
    expect(siteAfter.updatedAt.getTime()).toBe(siteBefore.updatedAt.getTime());

    const reset = await resetSiteAppearance({
      organizationId: ORG_A,
      siteId,
      actorUserId: ACTOR,
      expectedVersion: after.version,
    });
    expect(reset.draftTokens.colorPrimary).toBe(SELECTED_TOKENS.colorPrimary);
    expect(reset.draftTokens.colorBackground).toBe(SELECTED_TOKENS.colorBackground);
    expect(reset.publishedTokens.colorPrimary).toBe(SELECTED_TOKENS.colorPrimary);
    expect(
      await prisma.cmsAuditTrail.count({
        where: { organizationId: ORG_A, siteId, action: "APPEARANCE_RESET" },
      })
    ).toBe(1);
  });

});

describe.skipIf(!enabled)("draft and published separation (T119)", () => {
  it("requires a publish before an appearance edit reaches visitors", async () => {
    const siteId = await createBlankSite(ORG_A, "publish-" + RUN);
    const before = await getSiteAppearance({ organizationId: ORG_A, siteId });
    const updated = await updateSiteAppearance({
      organizationId: ORG_A,
      siteId,
      actorUserId: ACTOR,
      expectedVersion: before.version,
      body: {
        expectedVersion: before.version,
        tokens: { colorPrimary: "#445566" },
        brandName: "Edited brand",
      },
    });
    expect(updated.draftTokens.colorPrimary).toBe("#445566");
    expect(updated.publishedTokens.colorPrimary).toBe(
      DEFAULT_APPEARANCE_TOKENS.colorPrimary
    );
    expect(updated.brandName).toBe("Edited brand");
    expect(updated.hasUnpublishedChanges).toBe(true);

    const stored = await prisma.cmsSiteSettings.findUniqueOrThrow({ where: { siteId } });
    expect(stored.brandName).toBe("Edited brand");
    expect(
      await prisma.cmsAuditTrail.count({
        where: { organizationId: ORG_A, siteId, action: "APPEARANCE_UPDATED" },
      })
    ).toBe(1);

    const published = await publishSiteAppearance({
      organizationId: ORG_A,
      siteId,
      actorUserId: ACTOR,
      expectedVersion: updated.version,
    });
    expect(published.publishedTokens.colorPrimary).toBe("#445566");
    expect(published.hasUnpublishedChanges).toBe(false);
    expect(
      await prisma.cmsAuditTrail.count({
        where: { organizationId: ORG_A, siteId, action: "APPEARANCE_PUBLISHED" },
      })
    ).toBe(1);
  });

});

describe.skipIf(!enabled)("appearance concurrency and isolation", () => {
  it("rejects a stale appearance version", async () => {
    const siteId = await createBlankSite(ORG_A, "stale-" + RUN);
    const before = await getSiteAppearance({ organizationId: ORG_A, siteId });
    await updateSiteAppearance({
      organizationId: ORG_A,
      siteId,
      actorUserId: ACTOR,
      expectedVersion: before.version,
      body: { expectedVersion: before.version, tokens: { colorPrimary: "#111111" } },
    });
    await expect(
      updateSiteAppearance({
        organizationId: ORG_A,
        siteId,
        actorUserId: ACTOR,
        expectedVersion: before.version,
        body: { expectedVersion: before.version, tokens: { colorPrimary: "#222222" } },
      })
    ).rejects.toBeInstanceOf(ConflictError);
  });

  it("hides another tenant's site and private theme", async () => {
    const siteId = await createBlankSite(ORG_A, "isolation-" + RUN);
    await expect(
      getSiteAppearance({ organizationId: ORG_B, siteId })
    ).rejects.toBeInstanceOf(NotFoundError);
    await expect(
      updateSiteAppearance({
        organizationId: ORG_B,
        siteId,
        actorUserId: ACTOR,
        expectedVersion: 1,
        body: { expectedVersion: 1, tokens: { colorPrimary: "#333333" } },
      })
    ).rejects.toBeInstanceOf(NotFoundError);

    const privateTheme = await createTheme({
      slug: "private-" + RUN,
      tokens: SELECTED_TOKENS,
      organizationId: ORG_B,
    });
    const before = await getSiteAppearance({ organizationId: ORG_A, siteId });
    await expect(
      selectAppearanceTheme({
        organizationId: ORG_A,
        siteId,
        actorUserId: ACTOR,
        expectedVersion: before.version,
        body: { expectedVersion: before.version, catalogItemId: privateTheme.id },
      })
    ).rejects.toBeInstanceOf(NotFoundError);
  });

});

describe.skipIf(!enabled)("published theme definitions", () => {
  it("never copies an unpublished working draft from a published theme", async () => {
    const siteId = await createBlankSite(ORG_A, "draft-theme-" + RUN);
    const theme = await createTheme({ slug: "draft-" + RUN, tokens: SELECTED_TOKENS });
    await prisma.cmsCatalogItem.update({
      where: { id: theme.id },
      data: { definition: { schemaVersion: "2026-03", tokens: UPDATED_CATALOG_TOKENS } },
    });
    const themes = await listPublishedThemes(ORG_A);
    const listed = themes.find((entry) => entry.id === theme.id);
    expect(listed?.tokens.colorPrimary).toBe(SELECTED_TOKENS.colorPrimary);

    const before = await getSiteAppearance({ organizationId: ORG_A, siteId });
    const selected = await selectAppearanceTheme({
      organizationId: ORG_A,
      siteId,
      actorUserId: ACTOR,
      expectedVersion: before.version,
      body: { expectedVersion: before.version, catalogItemId: theme.id },
    });
    expect(selected.draftTokens.colorPrimary).toBe(SELECTED_TOKENS.colorPrimary);
    expect(selected.sourceVersion).toBe(1);
  });

});

describe.skipIf(!enabled)("theme catalog visibility", () => {
  it("lists only published themes visible to the workspace", async () => {
    const themesForA = await listPublishedThemes(ORG_A);
    expect(themesForA.some((theme) => theme.id === themeId)).toBe(true);
    expect(themesForA.every((theme) => theme.tokens.colorPrimary.length === 7)).toBe(true);
  });
});
