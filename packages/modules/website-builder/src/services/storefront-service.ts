import { createHmac } from "node:crypto";
import { prisma } from "@suite/db";
import { type ResolvedDomain, ResolvedDomainSchema } from "../db/functions.js";

export interface IStorefrontService {
  resolveHostname(hostname: string): Promise<ResolvedDomain>;
  verifyPreviewToken(token: string, pageId: string, secret: string): boolean;
}

export class StorefrontService implements IStorefrontService {
  constructor(private readonly db = prisma) {}

  /**
   * Normalizes hostname by trimming, lowercasing, and removing port numbers
   */
  public normalizeHostname(rawHost: string): string {
    const trimmed = rawHost.trim().toLowerCase();
    // Strip trailing port if present (e.g. localhost:3000 -> localhost)
    const [cleanHost] = trimmed.split(":");
    return cleanHost ?? "";
  }

  /**
   * Resolves storefront details for a given hostname executing public.cms_resolve_domain(hostname)
   */
  public async resolveHostname(hostname: string): Promise<ResolvedDomain> {
    const normalized = this.normalizeHostname(hostname);

    if (!normalized || normalized === "unknown") {
      return {
        resolved: false,
        reason: "INVALID_HOSTNAME",
      };
    }

    const rows = await this.db.$queryRaw<Array<{ res: unknown }>>`SELECT public.cms_resolve_domain(${normalized}) as res`;
    const rawResult = rows[0]?.res;

    if (!rawResult) {
      return {
        resolved: false,
        reason: "DOMAIN_NOT_FOUND",
      };
    }

    const parsed = ResolvedDomainSchema.safeParse(rawResult);
    if (!parsed.success) {
      return {
        resolved: false,
        reason: "DOMAIN_NOT_FOUND",
      };
    }

    return parsed.data;
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
