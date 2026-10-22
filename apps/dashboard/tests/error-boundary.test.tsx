import React from "react";
import { describe, it, expect, vi } from "vitest";
import { renderToString } from "react-dom/server";
import RootErrorBoundary from "../src/app/error";
import GlobalError from "../src/app/global-error";

// Mock @sentry/nextjs
vi.mock("@sentry/nextjs", () => ({
  captureException: vi.fn(),
}));

describe("Next.js Root Error Boundary Components", () => {
  it("renders RootErrorBoundary card with user recovery actions", () => {
    const mockError = new Error("Test client rendering crash");
    const mockReset = vi.fn();

    const html = renderToString(
      <RootErrorBoundary error={mockError} reset={mockReset} />
    );

    expect(html).toContain("We encountered an unexpected issue");
    expect(html).toContain("Try Again");
    expect(html).toContain("Return to Overview");
    // Ensure raw error stack trace is shielded from end user
    expect(html).not.toContain("Test client rendering crash");
  });

  it("renders incident digest if present", () => {
    const errorWithDigest = Object.assign(new Error("Digest error"), {
      digest: "err_digest_98765",
    });
    const mockReset = vi.fn();

    const html = renderToString(
      <RootErrorBoundary error={errorWithDigest} reset={mockReset} />
    );

    expect(html).toContain("Incident Digest:");
    expect(html).toContain("err_digest_98765");
  });

  it("renders GlobalError fallback page with layout recovery", () => {
    const mockError = new Error("Root layout failure");
    const mockReset = vi.fn();

    const html = renderToString(
      <GlobalError error={mockError} reset={mockReset} />
    );

    expect(html).toContain("Critical System Encounter");
    expect(html).toContain("Reload Application");
    expect(html).toContain("Go to Overview");
  });
});
