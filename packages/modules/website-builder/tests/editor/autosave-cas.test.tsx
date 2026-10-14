import { describe, it, expect, vi, beforeEach, afterAll } from "vitest";
import React from "react";
import { renderToString } from "react-dom/server";
import { prisma } from "@suite/db";
import { PageService } from "../../src/services/page-service.js";
import {
  CasConflictDialog,
  type AutosaveConflictData,
} from "../../src/editor/state/index.js";
import type { PageAst } from "../../src/ast/types.js";

describe("Optimistic Autosave State Machine & CAS Conflict Resolver", () => {
  let pageService: PageService;

  const initialAst: PageAst = {
    version: 1,
    schemaVersion: "2026-03",
    sections: [
      {
        id: "sec_1",
        name: "Hero Section",
        blocks: [
          {
            id: "b_1",
            type: "hero",
            props: { headline: "Original Headline" },
          },
        ],
      },
    ],
  };

  const updatedAst: PageAst = {
    ...initialAst,
    sections: [
      {
        ...initialAst.sections[0]!,
        blocks: [
          {
            id: "b_1",
            type: "hero",
            props: { headline: "Updated Headline" },
          },
        ],
      },
    ],
  };

  beforeEach(async () => {
    pageService = new PageService();
    await prisma.organization.upsert({
      where: { id: "org_autosave_cas" },
      update: {},
      create: { id: "org_autosave_cas", name: "Autosave Cas Org", slug: "autosave-cas-org" },
    });
    await prisma.cmsSite.upsert({
      where: { id_organizationId: { id: "site_autosave_cas", organizationId: "org_autosave_cas" } },
      update: {},
      create: {
        id: "site_autosave_cas",
        organizationId: "org_autosave_cas",
        title: "Alpha Site",
        slug: "alpha-site",
      },
    });
    await prisma.cmsPageContent.deleteMany({
      where: { organizationId: "org_autosave_cas", pageId: "page_autosave_cas_1" },
    });
    await prisma.cmsPage.deleteMany({
      where: { organizationId: "org_autosave_cas", id: "page_autosave_cas_1" },
    });
    await pageService.createPage({
      id: "page_autosave_cas_1",
      organizationId: "org_autosave_cas",
      siteId: "site_autosave_cas",
      slug: "/about-us",
      title: "About Us",
      draftAst: initialAst as unknown as Record<string, unknown>,
    });
  });

  afterAll(async () => {
    await prisma.cmsPage.deleteMany({
      where: { organizationId: "org_autosave_cas", id: "page_autosave_cas_1" },
    });
  });

  it("updates draft AST atomically and increments revision on valid CAS expectation", async () => {
    // Initial page in pageService has revision = 1
    const result = await pageService.updateDraftContent({
      organizationId: "org_autosave_cas",
      pageId: "page_autosave_cas_1",
      expectedRevision: 1,
      draftAst: updatedAst as unknown as Record<string, unknown>,
    });

    expect(result.success).toBe(true);
    expect(result.revision).toBe(2);
  });

  it("detects OCC conflict when expectedRevision does not match server revision", async () => {
    // Attempt save with stale revision 1 when server is at 2 (or pass wrong rev 99)
    const conflictResult = await pageService.updateDraftContent({
      organizationId: "org_autosave_cas",
      pageId: "page_autosave_cas_1",
      expectedRevision: 99,
      draftAst: updatedAst as unknown as Record<string, unknown>,
    });

    expect(conflictResult.success).toBe(false);
    expect(conflictResult.errorCode).toBe("CMS_CONCURRENCY_CONFLICT");
    expect(conflictResult.revision).toBe(1);
  });

  it("renders CasConflictDialog with diff section count and overwrite vs discard actions", () => {
    const conflict: AutosaveConflictData = {
      localAst: updatedAst,
      serverAst: {
        ...initialAst,
        sections: [
          ...initialAst.sections,
          { id: "sec_2", name: "Added by Collaborator", blocks: [] },
        ],
      },
      serverRevision: 3,
    };

    const onKeepMine = vi.fn();
    const onKeepServer = vi.fn();

    const html = renderToString(
      <CasConflictDialog
        isOpen={true}
        conflict={conflict}
        onKeepMine={onKeepMine}
        onKeepServer={onKeepServer}
      />
    );

    expect(html).toContain("Concurrent Editing Conflict Detected");
    expect(html).toContain("Rev #");
    expect(html).toContain("3");
    expect(html).toContain("Your Local Draft");
    expect(html).toContain("Server Version");
    expect(html).toContain("Load Server Version (Discard Mine)");
    expect(html).toContain("Overwrite Server Version");
  });

  it("does not render CasConflictDialog when isOpen is false", () => {
    const html = renderToString(
      <CasConflictDialog
        isOpen={false}
        conflict={null}
        onKeepMine={vi.fn()}
        onKeepServer={vi.fn()}
      />
    );

    expect(html).toBe("");
  });
});
