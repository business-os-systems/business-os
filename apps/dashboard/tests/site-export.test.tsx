// @vitest-environment jsdom
import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { ExportSiteButton } from "@/app/(dashboard)/websites/export-site-button";
import { exportSiteRequest } from "@/lib/api/site-client";

const NOW = "2026-11-12T00:00:00.000Z";

function exportDocument() {
  return {
    format: "business-os.website-builder.site",
    formatVersion: 1,
    exportedAt: NOW,
    site: {
      title: "Riverview Bistro",
      slug: "riverview-bistro",
      status: "DRAFT",
      timezone: "UTC",
      primaryLocale: "en",
      createdAt: NOW,
      updatedAt: NOW,
    },
    appearance: null,
    settings: null,
    domains: [],
    redirects: [],
    pages: [
      {
        title: "Home",
        path: "/",
        parentPath: null,
        orderIndex: 0,
        status: "DRAFT",
        isHomePage: true,
        revision: 1,
        draftAst: { version: 1, schemaVersion: "2026-03", sections: [] },
        publishedAst: null,
      },
    ],
    media: {},
  };
}

function envelope(document: unknown) {
  return {
    success: true,
    data: { export: document },
    requestId: "req-export",
    timestamp: NOW,
  };
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("site export client", () => {
  it("returns the validated portable document", async () => {
    const document = exportDocument();
    vi.stubGlobal("fetch", vi.fn(() => Promise.resolve(jsonResponse(envelope(document)))));

    const result = await exportSiteRequest("site_1");

    expect(result.format).toBe("business-os.website-builder.site");
    expect(result.pages).toHaveLength(1);
    const call = vi.mocked(fetch).mock.calls[0];
    expect(call?.[0]).toBe("/api/v1/cms/sites/site_1/export");
  });

  it("refuses a response that is not the export document", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() =>
        Promise.resolve(jsonResponse({ success: true, data: { export: { format: "other" } } }))
      )
    );

    await expect(exportSiteRequest("site_1")).rejects.toThrow(
      "The server returned a response this studio does not understand."
    );
  });
});

describe("site export button", () => {
  it("downloads the exported document under the site slug", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() => Promise.resolve(jsonResponse(envelope(exportDocument()))))
    );
    const createObjectUrl = vi.fn(() => "blob:site-export");
    const revokeObjectUrl = vi.fn();
    vi.stubGlobal("URL", { ...URL, createObjectURL: createObjectUrl, revokeObjectURL: revokeObjectUrl });
    let downloadedFileName = "";
    const click = vi
      .spyOn(HTMLAnchorElement.prototype, "click")
      .mockImplementation(function captureDownload(this: HTMLAnchorElement) {
        downloadedFileName = this.download;
      });

    render(<ExportSiteButton siteId="site_1" siteSlug="riverview-bistro" />);
    fireEvent.click(screen.getByRole("button", { name: "Export riverview-bistro as JSON" }));

    await waitFor(() => expect(createObjectUrl).toHaveBeenCalledTimes(1));
    expect(click).toHaveBeenCalledTimes(1);
    expect(downloadedFileName).toBe("riverview-bistro-site-export.json");
    expect(revokeObjectUrl).toHaveBeenCalledWith("blob:site-export");
  });

  it("shows the server's problem detail when the export is refused", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() =>
        Promise.resolve(
          jsonResponse(
            {
              type: "/errors/capability-denied",
              title: "Forbidden",
              status: 403,
              detail: "This action requires the cms:sites:read capability.",
              code: "CAPABILITY_DENIED",
            },
            403
          )
        )
      )
    );

    render(<ExportSiteButton siteId="site_1" siteSlug="riverview-bistro" />);
    fireEvent.click(screen.getByRole("button", { name: "Export riverview-bistro as JSON" }));

    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("This action requires the cms:sites:read capability.");
  });
});
