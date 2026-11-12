import { createHmac, hkdfSync, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { AppError, NotFoundError, ValidationError } from "@suite/core/errors";
import { normalizeHostname, PLATFORM_ERROR_CODE } from "@suite/core";
import { Prisma, withTenantContext, prisma, type CmsSite } from "@suite/db";
import { resolveMediaAssets } from "@suite/media";
import { normalizeAppearanceTokens } from "@suite/website-builder/appearance";
import {
  collectMediaAssetIds,
  PageAstSchema,
} from "@suite/website-builder/ast";
import { normalizePagePath } from "@suite/website-builder/services";
import {
  DOMAIN_OPERATIONS,
  measureDomainOperation,
} from "../admin/domain-metrics.service.js";
import {
  STOREFRONT_DOMAIN_STATUS,
  STOREFRONT_PAGE_STATUS,
  STOREFRONT_SITE_STATUS,
  type StorefrontDeliveryState,
  type StorefrontPageMetadata,
  type StorefrontPageOutcome,
  type StorefrontReadService,
  type StorefrontResolveOutcome,
  type StorefrontPreviewService,
} from "./contract.js";
import { getBetterAuthSecret } from "../../lib/env.js";

type PublishedPageContent = Omit<StorefrontPageMetadata, "tokens">;

type PublishedPageResult =
  | { readonly kind: "published"; readonly page: PublishedPageContent }
  | { readonly kind: "not_found" };

/**
 * A host maps to exactly one active domain row, so this owner read is the
 * anonymous entry point into the tenant plane. Everything after it runs inside
 * withTenantContext: the content itself is always read under RLS, and a draft
 * can never be selected because only published rows and snapshots are queried.
 */
const SITE_DELIVERY_BY_STATUS: Record<CmsSite["status"], StorefrontDeliveryState> = {
  [STOREFRONT_SITE_STATUS.PUBLISHED]: "published",
  [STOREFRONT_SITE_STATUS.DRAFT]: "not_published",
  [STOREFRONT_SITE_STATUS.MAINTENANCE]: "not_published",
  [STOREFRONT_SITE_STATUS.SUSPENDED]: "gone",
  [STOREFRONT_SITE_STATUS.ARCHIVED]: "gone",
};

interface SiteLocator {
  readonly id: string;
  readonly organizationId: string;
}

interface DeliveryGate {
  readonly delivery: StorefrontDeliveryState;
  readonly title: string;
  readonly defaultLocale: string;
  readonly tokens: ReturnType<typeof normalizeAppearanceTokens>;
}

function normalizeStorefrontPath(rawPath: string): string | null {
  try {
    return normalizePagePath(rawPath);
  } catch (error: unknown) {
    if (error instanceof AppError) {
      return null;
    }
    throw error;
  }
}

async function locateSite(host: string): Promise<SiteLocator | null> {
  const hostname = normalizeHostname(host);
  if (hostname === null) {
    return null;
  }
  const domain = await prisma.cmsDomain.findFirst({
    where: { hostname, status: STOREFRONT_DOMAIN_STATUS.ACTIVE },
    select: { site: { select: { id: true, organizationId: true } } },
  });
  return domain?.site ?? null;
}

async function readDeliveryGate(
  tx: Prisma.TransactionClient,
  locator: SiteLocator
): Promise<DeliveryGate | null> {
  const site = await tx.cmsSite.findFirst({
    where: { id: locator.id, organizationId: locator.organizationId },
    select: {
      status: true,
      title: true,
      primaryLocale: true,
      appearance: { select: { publishedTokens: true } },
    },
  });
  if (site === null) {
    return null;
  }
  return {
    delivery: SITE_DELIVERY_BY_STATUS[site.status],
    title: site.title,
    defaultLocale: site.primaryLocale,
    tokens: normalizeAppearanceTokens(site.appearance?.publishedTokens),
  };
}

async function readHomePath(
  tx: Prisma.TransactionClient,
  locator: SiteLocator
): Promise<string> {
  const home = await tx.cmsPage.findFirst({
    where: {
      organizationId: locator.organizationId,
      siteId: locator.id,
      isHomePage: true,
      status: STOREFRONT_PAGE_STATUS.PUBLISHED,
    },
    select: { slug: true, content: { select: { publishedAst: true } } },
  });
  if (home?.content?.publishedAst == null) {
    return "/";
  }
  return home.slug;
}

function publishedResolve(gate: DeliveryGate, homePath: string): StorefrontResolveOutcome {
  return {
    kind: "published",
    site: {
      title: gate.title,
      homePath,
      defaultLocale: gate.defaultLocale,
      tokens: gate.tokens,
    },
  };
}

async function resolveInTenant(locator: SiteLocator): Promise<StorefrontResolveOutcome> {
  return withTenantContext(locator.organizationId, async (tx) => {
    const gate = await readDeliveryGate(tx, locator);
    if (gate === null || gate.delivery === "not_published") {
      return { kind: "not_found" };
    }
    if (gate.delivery === "gone") {
      return { kind: "gone" };
    }
    return publishedResolve(gate, await readHomePath(tx, locator));
  });
}

function parsePublishedAst(rawAst: Prisma.JsonValue, context: { siteId: string; pagePath: string }) {
  const parsed = PageAstSchema.safeParse(rawAst);
  if (!parsed.success) {
    console.error("[storefront] Published page AST failed validation; serving not-found.", {
      siteId: context.siteId,
      pagePath: context.pagePath,
      issueCount: parsed.error.issues.length,
    });
    return null;
  }
  return parsed.data;
}

async function readPublishedPage(
  tx: Prisma.TransactionClient,
  locator: SiteLocator,
  path: string
): Promise<PublishedPageResult> {
  const page = await tx.cmsPage.findFirst({
    where: {
      organizationId: locator.organizationId,
      siteId: locator.id,
      slug: path,
      status: STOREFRONT_PAGE_STATUS.PUBLISHED,
    },
    select: {
      title: true,
      slug: true,
      content: { select: { publishedAst: true } },
    },
  });
  if (page?.content?.publishedAst == null) {
    return { kind: "not_found" };
  }
  const ast = parsePublishedAst(page.content.publishedAst, {
    siteId: locator.id,
    pagePath: page.slug,
  });
  if (ast === null) {
    return { kind: "not_found" };
  }
  const media = await resolveMediaAssets(
    tx,
    locator.organizationId,
    collectMediaAssetIds(ast)
  );
  return {
    kind: "published",
    page: { title: page.title, path: page.slug, ast, media },
  };
}

async function readPageInTenant(
  locator: SiteLocator,
  path: string
): Promise<StorefrontPageOutcome> {
  return withTenantContext(locator.organizationId, async (tx) => {
    const gate = await readDeliveryGate(tx, locator);
    if (gate === null || gate.delivery === "not_published") {
      return { kind: "not_found" };
    }
    if (gate.delivery === "gone") {
      return { kind: "gone" };
    }
    const page = await readPublishedPage(tx, locator, path);
    if (page.kind !== "published") {
      return page;
    }
    return { kind: "published", page: { ...page.page, tokens: gate.tokens } };
  });
}

/** Anonymous, published-only reads for the storefront delivery surface. */
export const storefrontReadService: StorefrontReadService = {
  async resolveHost(host) {
    return measureDomainOperation(DOMAIN_OPERATIONS.DELIVERY, { surface: "site" }, async () => {
      const locator = await locateSite(host);
      if (locator === null) {
        return { kind: "not_found" };
      }
      return resolveInTenant(locator);
    });
  },

  async readPage(input) {
    return measureDomainOperation(DOMAIN_OPERATIONS.DELIVERY, { surface: "page" }, async () => {
      const path = normalizeStorefrontPath(input.path);
      if (path === null) {
        return { kind: "not_found" };
      }
      const locator = await locateSite(input.host);
      if (locator === null) {
        return { kind: "not_found" };
      }
      return readPageInTenant(locator, path);
    });
  },
};

// ==============================================================================
// Signed, expiring preview link (FR-037, T166)
//
// The link carries the host and an expiry time, never a site, tenant or page
// id, so a visitor cannot learn the workspace behind a host. The signing key is
// derived from the deployment's existing BETTER_AUTH_SECRET with HKDF and a
// purpose-specific info string: no new secret is introduced and a preview
// signature can never be replayed as a session token. A tampered, expired or
// deactivated-host token is reported as the same neutral not-found.
// ==============================================================================

const PREVIEW_TOKEN_VERSION = 1;
const PREVIEW_TOKEN_TTL_MS = 24 * 60 * 60 * 1000;
const PREVIEW_TOKEN_MAX_LENGTH = 4096;
const PREVIEW_SIGNING_SALT = "business-os.cms.preview-link";
const PREVIEW_SIGNING_INFO = "preview-token.v1";

const previewTokenPayloadSchema = z
  .object({
    v: z.literal(PREVIEW_TOKEN_VERSION),
    host: z.string().min(1).max(253),
    exp: z.number().int().positive(),
  })
  .strict();

function previewSigningKey(): Buffer {
  return Buffer.from(
    hkdfSync(
      "sha256",
      Buffer.from(getBetterAuthSecret(), "utf8"),
      Buffer.from(PREVIEW_SIGNING_SALT, "utf8"),
      Buffer.from(PREVIEW_SIGNING_INFO, "utf8"),
      32
    )
  );
}

function signPreviewBody(body: string): string {
  return createHmac("sha256", previewSigningKey()).update(body).digest("base64url");
}

function issuePreviewToken(host: string, expiresAt: Date): string {
  const payload = {
    v: PREVIEW_TOKEN_VERSION,
    host,
    exp: Math.floor(expiresAt.getTime() / 1000),
  };
  const body = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
  return body + "." + signPreviewBody(body);
}

function signaturesMatch(provided: string, expected: string): boolean {
  const providedBytes = Buffer.from(provided, "utf8");
  const expectedBytes = Buffer.from(expected, "utf8");
  return (
    providedBytes.length === expectedBytes.length &&
    timingSafeEqual(providedBytes, expectedBytes)
  );
}

function verifyPreviewToken(token: string): { host: string; expiresAt: Date } | null {
  if (token.length === 0 || token.length > PREVIEW_TOKEN_MAX_LENGTH) {
    return null;
  }
  const separator = token.indexOf(".");
  if (separator <= 0 || separator === token.length - 1) {
    return null;
  }
  const body = token.slice(0, separator);
  const signature = token.slice(separator + 1);
  if (!signaturesMatch(signature, signPreviewBody(body))) {
    return null;
  }
  let rawPayload: unknown;
  try {
    rawPayload = JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
  } catch {
    return null;
  }
  const parsed = previewTokenPayloadSchema.safeParse(rawPayload);
  if (!parsed.success) {
    return null;
  }
  const expiresAt = new Date(parsed.data.exp * 1000);
  if (expiresAt.getTime() <= Date.now()) {
    return null;
  }
  return { host: parsed.data.host, expiresAt };
}

function normalizePreviewPath(rawPath: string): string {
  try {
    return normalizePagePath(rawPath);
  } catch (error: unknown) {
    throw new ValidationError(
      "The preview path is not a valid page address.",
      [{ name: "path", reason: "Use a normalized page address such as /about." }],
      { code: PLATFORM_ERROR_CODE.VALIDATION_FAILED, cause: error }
    );
  }
}

function buildPreviewUrl(host: string, path: string, token: string): string {
  const url = new URL(path, "https://" + host);
  url.searchParams.set("preview", token);
  return url.toString();
}

async function readPreviewHost(
  tx: Prisma.TransactionClient,
  input: { readonly organizationId: string; readonly siteId: string }
): Promise<string> {
  const site = await tx.cmsSite.findFirst({
    where: { id: input.siteId, organizationId: input.organizationId },
    select: {
      domains: {
        where: { status: STOREFRONT_DOMAIN_STATUS.ACTIVE },
        orderBy: [{ isPrimary: "desc" }, { hostname: "asc" }],
        take: 1,
        select: { hostname: true },
      },
    },
  });
  if (site === null) {
    throw new NotFoundError("The requested site was not found.", {
      code: PLATFORM_ERROR_CODE.NOT_FOUND,
    });
  }
  const hostname = site.domains[0]?.hostname;
  if (hostname === undefined) {
    throw new ValidationError(
      "This site has no active address yet, so a preview link cannot be issued.",
      [{ name: "siteId", reason: "Attach and verify a domain before previewing." }],
      { code: PLATFORM_ERROR_CODE.VALIDATION_FAILED }
    );
  }
  return hostname;
}

function parsePreviewAst(
  rawAst: Prisma.JsonValue,
  context: { siteId: string; pagePath: string }
) {
  const parsed = PageAstSchema.safeParse(rawAst);
  if (!parsed.success) {
    console.error("[storefront] Draft page AST failed validation; refusing the preview.", {
      siteId: context.siteId,
      pagePath: context.pagePath,
      issueCount: parsed.error.issues.length,
    });
    return null;
  }
  return parsed.data;
}

async function readDraftPage(
  tx: Prisma.TransactionClient,
  locator: SiteLocator,
  path: string
): Promise<PublishedPageResult> {
  const page = await tx.cmsPage.findFirst({
    where: {
      organizationId: locator.organizationId,
      siteId: locator.id,
      slug: path,
      status: { not: STOREFRONT_PAGE_STATUS.ARCHIVED },
    },
    select: {
      title: true,
      slug: true,
      content: { select: { draftAst: true } },
    },
  });
  if (page?.content?.draftAst == null) {
    return { kind: "not_found" };
  }
  const ast = parsePreviewAst(page.content.draftAst, {
    siteId: locator.id,
    pagePath: page.slug,
  });
  if (ast === null) {
    return { kind: "not_found" };
  }
  const media = await resolveMediaAssets(
    tx,
    locator.organizationId,
    collectMediaAssetIds(ast)
  );
  return { kind: "published", page: { title: page.title, path: page.slug, ast, media } };
}

async function readPreviewPageInTenant(
  locator: SiteLocator,
  path: string
): Promise<StorefrontPageOutcome> {
  return withTenantContext(locator.organizationId, async (tx) => {
    const site = await tx.cmsSite.findFirstOrThrow({
      where: { id: locator.id, organizationId: locator.organizationId },
      select: { status: true, appearance: { select: { draftTokens: true } } },
    });
    const delivery = SITE_DELIVERY_BY_STATUS[site.status];
    if (delivery === "gone") {
      return { kind: "gone" };
    }
    const page = await readDraftPage(tx, locator, path);
    if (page.kind !== "published") {
      return page;
    }
    return {
      kind: "published",
      page: {
        ...page.page,
        tokens: normalizeAppearanceTokens(site.appearance?.draftTokens),
      },
    };
  });
}

/** Tenant-plane issuance and anonymous read of signed preview links (FR-037). */
export const storefrontPreviewService: StorefrontPreviewService = {
  async createLink(input) {
    const hostname = await withTenantContext(input.organizationId, (tx) =>
      readPreviewHost(tx, input)
    );
    const path = normalizePreviewPath(input.path);
    const expiresAt = new Date(Date.now() + PREVIEW_TOKEN_TTL_MS);
    const token = issuePreviewToken(hostname, expiresAt);
    return {
      url: buildPreviewUrl(hostname, path, token),
      expiresAt: expiresAt.toISOString(),
    };
  },

  async readPage(input) {
    const verified = verifyPreviewToken(input.token);
    if (verified === null) {
      return { kind: "not_found" };
    }
    const locator = await locateSite(verified.host);
    if (locator === null) {
      return { kind: "not_found" };
    }
    const path = normalizeStorefrontPath(input.path);
    if (path === null) {
      return { kind: "not_found" };
    }
    return measureDomainOperation(DOMAIN_OPERATIONS.DELIVERY, { surface: "preview" }, () =>
      readPreviewPageInTenant(locator, path)
    );
  },
};
