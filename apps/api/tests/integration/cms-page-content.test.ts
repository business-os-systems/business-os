import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Hono } from "hono";
import { prisma, type Prisma } from "@suite/db";
import { PERMISSIONS } from "@suite/core";
import { NotFoundError } from "@suite/core/errors";
import { CMS_AUDIT_ACTIONS } from "@suite/website-builder/audit";
import { CMS_CONFLICT_DRAFT_LABEL } from "@suite/website-builder/audit";
import type { PageAst } from "@suite/website-builder/ast";
import { getPageContent, savePageDraft } from "../../src/services/cms/page-content.service.js";
import { createCmsContentRouter } from "../../src/routes/cms/content.js";
import { globalErrorHandler } from "../../src/middleware/error-handler.js";

const enabled = Boolean(process.env.DATABASE_URL && process.env.TENANT_DATABASE_URL);
const RUN = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
const ORG_A = "org_wt350_a_" + RUN;
const ORG_B = "org_wt350_b_" + RUN;
const ACTOR = "usr_wt350_actor";
const SITE_A = "site_wt350_a_" + RUN;
const PAGE_A = "page_wt350_a_" + RUN;

const EMPTY: PageAst = { version: 1, schemaVersion: "2026-03", sections: [] };
const DRAFT_MINE: PageAst = {
  version: 1,
  schemaVersion: "2026-03",
  sections: [
    { id: "sec_mine", blocks: [{ id: "blk_mine", type: "hero", props: { headline: "Mine" } }] },
  ],
};
const DRAFT_THEIRS: PageAst = {
  version: 1,
  schemaVersion: "2026-03",
  sections: [
    { id: "sec_theirs", blocks: [{ id: "blk_theirs", type: "hero", props: { headline: "Theirs" } }] },
  ],
};

async function cleanup(): Promise<void> {
  const orgs = [ORG_A, ORG_B];
  await prisma.cmsAuditTrail.deleteMany({ where: { organizationId: { in: orgs } } });
  await prisma.cmsPageVersion.deleteMany({ where: { organizationId: { in: orgs } } });
  await prisma.cmsPageContent.deleteMany({ where: { organizationId: { in: orgs } } });
  await prisma.cmsPage.deleteMany({ where: { organizationId: { in: orgs } } });
  await prisma.cmsSite.deleteMany({ where: { organizationId: { in: orgs } } });
  await prisma.organization.deleteMany({ where: { id: { in: orgs } } });
}

async function createFixture(): Promise<void> {
  await prisma.organization.create({
    data: { id: ORG_A, name: "T-05 A", slug: "wt350-a-" + RUN, metadata: { industries: ["hospitality"] } },
  });
  await prisma.organization.create({
    data: { id: ORG_B, name: "T-05 B", slug: "wt350-b-" + RUN },
  });
  await prisma.cmsSite.create({
    data: { id: SITE_A, organizationId: ORG_A, title: "Riverview", slug: "riverview-" + RUN },
  });
  await prisma.cmsPage.create({
    data: {
      id: PAGE_A,
      organizationId: ORG_A,
      siteId: SITE_A,
      title: "Home",
      slug: "/",
      isHomePage: true,
      revision: 1,
      content: { create: { draftAst: EMPTY as unknown as Prisma.InputJsonValue } },
    },
  });
}

interface Variables {
  user: { permissions?: string[] };
  userId?: string;
  organizationId?: string;
}

function createApp(): Hono<{ Variables: Variables }> {
  const app = new Hono<{ Variables: Variables }>();
  app.onError(globalErrorHandler);
  app.use("*", async (c, next) => {
    c.set("user", { permissions: [PERMISSIONS.WILDCARD] });
    c.set("userId", ACTOR);
    c.set("organizationId", ORG_A);
    await next();
  });
  app.route("/api/v1/cms", createCmsContentRouter());
  return app;
}

let pageRevision = 2;

beforeAll(async () => {
  if (!enabled) return;
  await cleanup();
  await createFixture();
});

afterAll(async () => {
  if (!enabled) return;
  await cleanup();
  await prisma.$disconnect();
});

describe.skipIf(!enabled)("Page content autosave (FR-026, FR-027, CT-3)", () => {
  it("saves a first draft and writes the audit row in the same mutation", async () => {
    const content = await getPageContent({ organizationId: ORG_A, pageId: PAGE_A });
    expect(content.revision).toBe(1);
    expect(content.draftAst.sections).toEqual([]);

    const outcome = await savePageDraft({
      organizationId: ORG_A,
      pageId: PAGE_A,
      actorUserId: ACTOR,
      expectedRevision: content.revision,
      draftAst: DRAFT_MINE,
    });
    expect(outcome.kind).toBe("saved");
    if (outcome.kind !== "saved") return;
    pageRevision = outcome.content.revision;
    expect(pageRevision).toBe(2);
    expect(outcome.content.draftAst.sections).toHaveLength(1);

    const stored = await prisma.cmsPageContent.findUniqueOrThrow({
      where: { pageId_organizationId: { pageId: PAGE_A, organizationId: ORG_A } },
    });
    expect((stored.draftAst as { sections: unknown[] }).sections).toHaveLength(1);
    const audit = await prisma.cmsAuditTrail.findFirst({
      where: { organizationId: ORG_A, entityId: PAGE_A, action: CMS_AUDIT_ACTIONS.PAGE_CONTENT_SAVED },
    });
    expect(audit?.actorUserId).toBe(ACTOR);
    expect(await prisma.cmsPageVersion.count({ where: { organizationId: ORG_A, pageId: PAGE_A } })).toBe(0);
  });

});

describe.skipIf(!enabled)("Page content conflict history (FR-027)", () => {
  it("rejects a stale save without overwriting and retains the losing draft in history", async () => {
    const outcome = await savePageDraft({
      organizationId: ORG_A,
      pageId: PAGE_A,
      actorUserId: ACTOR,
      expectedRevision: 1,
      draftAst: DRAFT_THEIRS,
    });
    expect(outcome.kind).toBe("conflict");
    if (outcome.kind !== "conflict") return;
    expect(outcome.content.revision).toBe(pageRevision);
    expect(outcome.content.draftAst.sections[0]?.id).toBe("sec_mine");
    expect(outcome.retainedVersion).toBe(1);

    const page = await prisma.cmsPage.findUniqueOrThrow({ where: { id: PAGE_A } });
    expect(page.revision).toBe(pageRevision);
    const stored = await prisma.cmsPageContent.findUniqueOrThrow({
      where: { pageId_organizationId: { pageId: PAGE_A, organizationId: ORG_A } },
    });
    expect((stored.draftAst as { sections: { id: string }[] }).sections[0]?.id).toBe("sec_mine");

    const retained = await prisma.cmsPageVersion.findFirstOrThrow({
      where: { organizationId: ORG_A, pageId: PAGE_A, versionNumber: outcome.retainedVersion },
    });
    expect(retained.label).toBe(CMS_CONFLICT_DRAFT_LABEL);
    expect((retained.astSnapshot as { sections: { id: string }[] }).sections[0]?.id).toBe("sec_theirs");
    expect(retained.createdByUserId).toBe(ACTOR);
    expect(
      await prisma.cmsAuditTrail.count({
        where: {
          organizationId: ORG_A,
          entityId: PAGE_A,
          action: CMS_AUDIT_ACTIONS.PAGE_CONTENT_CONFLICT_RETAINED,
        },
      })
    ).toBe(1);
  });

});

describe.skipIf(!enabled)("Page content reads and isolation (FR-027)", () => {
  it("returns the current revision and last editor after a save", async () => {
    const content = await getPageContent({ organizationId: ORG_A, pageId: PAGE_A });
    expect(content.revision).toBe(pageRevision);
    expect(content.lastEditedByUserId).toBe(ACTOR);
    expect(content.lastEditedAt).not.toBeNull();
  });

  it("reports another tenant's page as not found without writing history", async () => {
    await expect(getPageContent({ organizationId: ORG_B, pageId: PAGE_A })).rejects.toBeInstanceOf(
      NotFoundError
    );
    await expect(
      savePageDraft({
        organizationId: ORG_B,
        pageId: PAGE_A,
        actorUserId: "usr_other_tenant",
        expectedRevision: pageRevision,
        draftAst: DRAFT_THEIRS,
      })
    ).rejects.toBeInstanceOf(NotFoundError);
    expect(await prisma.cmsPageVersion.count({ where: { organizationId: ORG_B, pageId: PAGE_A } })).toBe(0);
  });

  it("returns HTTP 409 from the API for a stale save", async () => {
    const app = createApp();
    const write = (body: Record<string, unknown>) =>
      app.request("/api/v1/cms/pages/" + PAGE_A + "/content", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

    const first = await write({ expectedRevision: pageRevision, draftAst: DRAFT_THEIRS });
    expect(first.status).toBe(200);
    const accepted = (await first.json()) as { data: { content: { revision: number } } };
    const nextRevision = accepted.data.content.revision;

    const stale = await write({ expectedRevision: pageRevision, draftAst: DRAFT_MINE });
    expect(stale.status).toBe(409);
    const problem = (await stale.json()) as { code: string; detail: string };
    expect(problem.code).toBe("VERSION_CONFLICT");
    expect(problem.detail).toContain("kept in version history");

    const page = await prisma.cmsPage.findUniqueOrThrow({ where: { id: PAGE_A } });
    expect(page.revision).toBe(nextRevision);
    pageRevision = nextRevision;
  });
});