import { AppError } from "@suite/core/errors";
import { normalizeHostname } from "@suite/core";
import { Prisma, withTenantContext, prisma, type CmsSite } from "@suite/db";
import { resolveMediaAssets } from "@suite/media";
import { normalizeAppearanceTokens } from "@suite/website-builder/appearance";
import {
  collectMediaAssetIds,
  PageAstSchema,
} from "@suite/website-builder/ast";
import { normalizePagePath } from "@suite/website-builder/services";
import {
  STOREFRONT_DOMAIN_STATUS,
  STOREFRONT_PAGE_STATUS,
  STOREFRONT_SITE_STATUS,
  type StorefrontDeliveryState,
  type StorefrontPageMetadata,
  type StorefrontPageOutcome,
  type StorefrontReadService,
  type StorefrontResolveOutcome,
} from "./contract.js";

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
    const locator = await locateSite(host);
    if (locator === null) {
      return { kind: "not_found" };
    }
    return resolveInTenant(locator);
  },

  async readPage(input) {
    const path = normalizeStorefrontPath(input.path);
    if (path === null) {
      return { kind: "not_found" };
    }
    const locator = await locateSite(input.host);
    if (locator === null) {
      return { kind: "not_found" };
    }
    return readPageInTenant(locator, path);
  },
};
