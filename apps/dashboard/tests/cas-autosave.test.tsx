import { describe, it, expect, vi, beforeEach } from "vitest";
import React from "react";
import { renderToString } from "react-dom/server";
import { CmsApiClient } from "../src/lib/api/cms-client";
import { StudioHeader } from "../src/components/editor/studio-header";
import { StudioWorkspace } from "../src/components/editor/studio-workspace";
import type { AutosaveStatus } from "../src/components/editor/types";

describe("Live CAS Autosave & API Gateway Proxying (@suite/dashboard)", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  describe("CmsApiClient Gateway Integration", () => {
    it("successfully patches draft content and returns updated revision on 200 OK", async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        status: 200,
        json: async () => ({
          success: true,
          pageId: "page_123",
          revision: 5,
          draftAst: { mock: true },
        }),
      });
      global.fetch = mockFetch;

      const client = new CmsApiClient({ baseUrl: "http://api.test" });
      const result = await client.updateDraftContent({
        organizationId: "org_1",
        pageId: "page_123",
        expectedRevision: 4,
        draftAst: { mock: true },
      });

      expect(result.success).toBe(true);
      expect(result.revision).toBe(5);
      expect(mockFetch).toHaveBeenCalledWith(
        "http://api.test/api/v1/cms/admin/pages/page_123/content",
        expect.objectContaining({
          method: "PATCH",
          headers: expect.objectContaining({
            "Content-Type": "application/json",
            "x-tenant-id": "org_1",
          }),
        })
      );
    });

    it("maps HTTP 409 conflict to CMS_CONCURRENCY_CONFLICT with active revision", async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        status: 409,
        json: async () => ({
          type: "about:blank",
          code: "CMS_CONCURRENCY_CONFLICT",
          title: "Concurrency Conflict",
          status: 409,
          detail: "Page revision conflict.",
          activeRevision: 7,
          draftAst: { serverVersion: true },
        }),
      });
      global.fetch = mockFetch;

      const client = new CmsApiClient({ baseUrl: "http://api.test" });
      const result = await client.updateDraftContent({
        organizationId: "org_1",
        pageId: "page_123",
        expectedRevision: 4,
        draftAst: { localVersion: true },
      });

      expect(result.success).toBe(false);
      expect(result.errorCode).toBe("CMS_CONCURRENCY_CONFLICT");
      expect(result.revision).toBe(7);
      expect(result.message).toContain("conflict");
    });

    it("publishes page successfully on POST 200 OK", async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        status: 200,
        json: async () => ({
          success: true,
          pageId: "page_123",
          revision: 6,
          versionNumber: 2,
        }),
      });
      global.fetch = mockFetch;

      const client = new CmsApiClient({ baseUrl: "http://api.test" });
      const result = await client.publishPage({
        organizationId: "org_1",
        pageId: "page_123",
        expectedRevision: 5,
      });

      expect(result.success).toBe(true);
      expect(result.revision).toBe(6);
      expect(result.versionNumber).toBe(2);
    });

    it("reports network error on connection failure", async () => {
      const mockFetch = vi.fn().mockRejectedValue(new Error("Connection refused"));
      global.fetch = mockFetch;

      const client = new CmsApiClient();
      const result = await client.updateDraftContent({
        organizationId: "org_1",
        pageId: "page_123",
        expectedRevision: 3,
        draftAst: {},
      });

      expect(result.success).toBe(false);
      expect(result.errorCode).toBe("NETWORK_ERROR");
    });
  });

  describe("StudioHeader Autosave Status Badges", () => {
    const statuses: AutosaveStatus[] = [
      "saved",
      "saving",
      "dirty",
      "conflict",
      "error",
      "idle",
    ];

    statuses.forEach((status) => {
      it(`renders indicator for status: ${status}`, () => {
        const html = renderToString(
          <StudioHeader
            siteId="site_test"
            pageId="page_test"
            pageTitle="Test Page"
            revision={8}
            status="DRAFT"
            autosaveStatus={status}
            isLayersOpen={true}
            isInspectorOpen={true}
            onToggleLayers={() => {}}
            onToggleInspector={() => {}}
            onOpenAddDrawer={() => {}}
            onFlushSave={() => {}}
          />
        );

        expect(html).toContain("CAS Revision: v8");
        expect(html).toContain("Save");
      });
    });
  });

  describe("StudioWorkspace Full Autosave Wiring", () => {
    it("mounts workspace with active revision, Publish button, and autosave status", () => {
      const html = renderToString(
        <StudioWorkspace
          organizationId="org_test"
          siteId="site_test"
          pageId="page_test"
          initialRevision={4}
        />
      );

      expect(html).toContain("CAS Revision: v4");
      expect(html).toContain("Ready");
      expect(html).toContain("Page Layers");
      expect(html).toContain("No sections on page");
      expect(html).toContain("Publish");
    });
  });

  describe("Publishing & Version History Snapshot Gateway", () => {
    it("publishes page and advances revision with version number", async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        status: 200,
        json: async () => ({
          success: true,
          pageId: "page_publish_1",
          revision: 5,
          versionNumber: 2,
        }),
      });
      global.fetch = mockFetch;

      const client = new CmsApiClient({ baseUrl: "http://api.test" });
      const result = await client.publishPage({
        organizationId: "org_1",
        pageId: "page_publish_1",
        expectedRevision: 4,
      });

      expect(result.success).toBe(true);
      expect(result.revision).toBe(5);
      expect(result.versionNumber).toBe(2);
      expect(mockFetch).toHaveBeenCalledWith(
        "http://api.test/api/v1/cms/admin/pages/page_publish_1/publish",
        expect.objectContaining({
          method: "POST",
          headers: expect.objectContaining({
            "Content-Type": "application/json",
            "x-tenant-id": "org_1",
          }),
        })
      );
    });

    it("fetches page version history snapshots", async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          versions: [
            {
              id: "ver_1",
              organizationId: "org_1",
              pageId: "page_1",
              versionNumber: 1,
              label: "Initial Release",
              astSnapshot: {},
              createdAt: "2026-10-12T10:00:00Z",
            },
          ],
        }),
      });
      global.fetch = mockFetch;

      const client = new CmsApiClient({ baseUrl: "http://api.test" });
      const result = await client.listPageVersions("org_1", "page_1");

      expect(result.success).toBe(true);
      expect(result.versions.length).toBe(1);
      expect(result.versions[0]?.versionNumber).toBe(1);
      expect(result.versions[0]?.label).toBe("Initial Release");
    });
  });
});
