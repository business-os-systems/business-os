// @vitest-environment jsdom
import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { PreviewLinkButton } from "@/components/studio/preview-link-button";

const NOW = "2026-11-12T00:00:00.000Z";
const PREVIEW_URL = "https://acme.example.test/about?preview=signed.token";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": status >= 400 ? "application/problem+json" : "application/json",
    },
  });
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("studio share-preview button", () => {
  it("opens the signed link returned by the API", async () => {
    const fetchMock = vi.fn<
      (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>
    >(() =>
      Promise.resolve(
        jsonResponse({
          success: true,
          data: { preview: { url: PREVIEW_URL, expiresAt: NOW } },
          requestId: "req-preview",
          timestamp: NOW,
        })
      )
    );
    vi.stubGlobal("fetch", fetchMock);
    const open = vi.spyOn(window, "open").mockImplementation(() => window);

    render(<PreviewLinkButton siteId="site_1" path="/about" />);
    fireEvent.click(screen.getByRole("button", { name: "Share preview" }));

    await waitFor(() => expect(open).toHaveBeenCalledTimes(1));
    expect(open).toHaveBeenCalledWith(PREVIEW_URL, "_blank", "noopener,noreferrer");
    const call = fetchMock.mock.calls[0];
    if (call === undefined) throw new Error("The preview link API was not called");
    expect(call[0]).toBe("/api/v1/cms/sites/site_1/preview-link?path=%2Fabout");
  });

  it("shows the server's refusal instead of opening a link", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() =>
        Promise.resolve(
          jsonResponse(
            {
              type: "/errors/validation-failed",
              title: "Validation Failed",
              status: 422,
              code: "VALIDATION_FAILED",
              detail: "This site has no active address yet, so a preview link cannot be issued.",
            },
            422
          )
        )
      )
    );
    const open = vi.spyOn(window, "open").mockImplementation(() => window);

    render(<PreviewLinkButton siteId="site_1" path="/" />);
    fireEvent.click(screen.getByRole("button", { name: "Share preview" }));

    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain(
      "This site has no active address yet, so a preview link cannot be issued."
    );
    expect(open).not.toHaveBeenCalled();
  });
});

describe("studio share-preview popup handling", () => {
  it("explains a blocked preview window", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() =>
        Promise.resolve(
          jsonResponse({
            success: true,
            data: { preview: { url: PREVIEW_URL, expiresAt: NOW } },
            requestId: "req-preview",
            timestamp: NOW,
          })
        )
      )
    );
    vi.spyOn(window, "open").mockImplementation(() => null);

    render(<PreviewLinkButton siteId="site_1" path="/about" />);
    fireEvent.click(screen.getByRole("button", { name: "Share preview" }));

    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("The preview opened in a blocked window.");
  });
});
