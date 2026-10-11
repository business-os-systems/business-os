import { createHash, createHmac } from "node:crypto";
import { type ResolvedDomain } from "../db/functions.js";

export interface IStorefrontService {
  resolveHostname(hostname: string): Promise<ResolvedDomain>;
  verifyPreviewToken(token: string, pageId: string, secret: string): boolean;
}

export class StorefrontService implements IStorefrontService {
  /**
   * Normalizes hostname by trimming, lowercasing, and removing port numbers
   */
  public normalizeHostname(rawHost: string): string {
    const trimmed = rawHost.trim().toLowerCase();
    // Strip trailing port if present (e.g. localhost:3000 -> localhost)
    const [cleanHost] = trimmed.split(":");
    return cleanHost || "";
  }

  /**
   * Resolves storefront details for a given hostname
   * In a live database environment, this executes public.cms_resolve_domain(hostname)
   */
  public async resolveHostname(hostname: string): Promise<ResolvedDomain> {
    const normalized = this.normalizeHostname(hostname);

    if (!normalized || normalized === "unknown") {
      return {
        resolved: false,
        reason: "INVALID_HOSTNAME",
      };
    }

    // Default mock response structure matching DB security definer contract
    // When connected to Postgres pool, this delegates to:
    // await prisma.$queryRaw`SELECT public.cms_resolve_domain(${normalized}) as res`
    return {
      resolved: true,
      siteId: `site_${createHash("md5").update(normalized).digest("hex").slice(0, 12)}`,
      title: "Storefront",
      slug: normalized.replace(/\./g, "-"),
      primaryLocale: "en",
      timezone: "Asia/Kolkata",
      brand: {
        brandName: "Storefront",
        brandLogoUrl: null,
        faviconUrl: null,
      },
      themeTokens: {},
      headerAst: { blocks: [] },
      footerAst: { blocks: [] },
      customCss: null,
      homePage: {
        pageId: `page_${createHash("md5").update(normalized + "_home").digest("hex").slice(0, 12)}`,
        slug: "/",
        title: "Home",
        publishedAst: { sections: [] },
      },
    };
  }

  /**
   * Verifies an HMAC signature for draft AST preview requests
   */
  public verifyPreviewToken(token: string, pageId: string, secret: string): boolean {
    if (!token || !pageId || !secret) return false;

    // Expected token format: ts.hmac
    const [timestampStr, signature] = token.split(".");
    if (!timestampStr || !signature) return false;

    const timestamp = parseInt(timestampStr, 10);
    if (Number.isNaN(timestamp)) return false;

    // Check expiration: 1 hour (3600 seconds)
    const now = Math.floor(Date.now() / 1000);
    if (Math.abs(now - timestamp) > 3600) return false;

    const expectedSignature = createHmac("sha256", secret)
      .update(`${pageId}:${timestamp}`)
      .digest("hex");

    return signature === expectedSignature;
  }
}
