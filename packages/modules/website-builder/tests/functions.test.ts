import { describe, expect, it } from "vitest";
import {
  ResolvedDomainSchema,
  IngestFormSubmissionResultSchema,
} from "../src/index.js";

describe("Pre-Tenant Security Definer Function Contracts (S1-3)", () => {
  it("should validate a successfully resolved domain payload", () => {
    const validResolved = {
      resolved: true,
      siteId: "site_cuid123",
      title: "River View Homestay",
      slug: "river-view",
      primaryLocale: "en",
      timezone: "Asia/Kolkata",
      brand: {
        brandName: "River View Homestay",
        brandLogoUrl: "https://r2.business-os.site/logo.png",
        faviconUrl: "https://r2.business-os.site/favicon.ico",
      },
      themeTokens: {
        colors: { primary: "#1E3A8A" },
      },
      headerAst: {
        blocks: [],
      },
      footerAst: {
        blocks: [],
      },
      customCss: "body { margin: 0; }",
      homePage: {
        pageId: "page_cuid456",
        slug: "/",
        title: "Home",
        publishedAst: {
          sections: [],
        },
      },
    };

    const parsed = ResolvedDomainSchema.safeParse(validResolved);
    expect(parsed.success).toBe(true);
  });

  it("should validate an unresolved domain reason payload", () => {
    const invalidDomain = {
      resolved: false,
      reason: "DOMAIN_NOT_FOUND",
    };

    const parsed = ResolvedDomainSchema.safeParse(invalidDomain);
    expect(parsed.success).toBe(true);
  });

  it("should validate successful form ingestion result", () => {
    const successResult = {
      success: true,
      submissionId: "csub_987654321",
      isDuplicate: false,
    };

    const parsed = IngestFormSubmissionResultSchema.safeParse(successResult);
    expect(parsed.success).toBe(true);
  });

  it("should validate idempotent duplicate form submission result", () => {
    const duplicateResult = {
      success: true,
      submissionId: "csub_987654321",
      isDuplicate: true,
      createdAt: "2026-10-11T18:00:00.000Z",
    };

    const parsed = IngestFormSubmissionResultSchema.safeParse(duplicateResult);
    expect(parsed.success).toBe(true);
  });

  it("should validate failed form submission result", () => {
    const failedResult = {
      success: false,
      errorCode: "PAYLOAD_TOO_LARGE",
      message: "Form submission payload exceeds maximum 64KB limit",
    };

    const parsed = IngestFormSubmissionResultSchema.safeParse(failedResult);
    expect(parsed.success).toBe(true);
  });
});
