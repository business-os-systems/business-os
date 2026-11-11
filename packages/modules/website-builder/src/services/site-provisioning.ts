import { randomUUID } from "node:crypto";
import { z } from "zod";
import {
  Prisma,
  tenantWriteQuotaGuard,
  withTenantContext,
  type CmsPage,
  type CmsSite,
  type QuotaGuard,
} from "@suite/db";
import { getHostModelConfig, PLATFORM_ERROR_CODE, QUOTA_KEYS } from "@suite/core";
import {
  ConflictError,
  InternalServerError,
  NotFoundError,
  ServiceUnavailableError,
  ValidationError,
} from "@suite/core/errors";
import { PageAstSchema } from "../ast/schema.js";
import type { PageAst } from "../ast/types.js";
import { DEFAULT_APPEARANCE_TOKENS } from "../appearance/tokens.js";
import { CMS_AUDIT_ACTIONS, CMS_AUDIT_ENTITY_TYPES } from "../audit/actions.js";
import { writeCmsAudit } from "./cms-audit.js";
import { isUniqueConstraintViolation } from "./prisma-unique.js";
import { publishedDefinitionKey, readPublishedDefinitions } from "./published-catalog.js";
import { assertPagePathAllowed, normalizeSiteSlug } from "../paths/page-paths.js";

export {
  assertPagePathAllowed,
  normalizePagePath,
  normalizeSiteSlug,
} from "../paths/page-paths.js";

const TEMPLATE_PAGE_MAX = 20;
const MAX_DERIVED_PATH_LENGTH = 160;

/** Replay-key format shared by every create-site surface (CT-4). */
export const SITE_IDEMPOTENCY_KEY_PATTERN = /^[A-Za-z0-9._:-]{8,128}$/;

/** A published catalog TEMPLATE carries one AST per page (contract 2026-03). */
export const TemplateBlueprintSchema = z
  .object({
    schemaVersion: z.string().trim().min(1).max(32),
    pages: z.array(PageAstSchema).min(1).max(TEMPLATE_PAGE_MAX),
  })
  .strict();

export type TemplateBlueprint = z.infer<typeof TemplateBlueprintSchema>;

export interface ProvisionSiteRequest {
  readonly organizationId: string;
  readonly branchId: string | null;
  readonly actorUserId: string;
  readonly title: string;
  readonly slug: string;
  readonly templateId: string | null;
  readonly idempotencyKey: string;
  readonly primaryLocale: string | null;
  readonly brandName: string | null;
}

export interface ProvisionedSite {
  readonly site: CmsSite;
  readonly pages: readonly CmsPage[];
  readonly homePage: CmsPage;
  readonly replayed: boolean;
}

interface PagePlan {
  readonly title: string;
  readonly path: string;
  readonly isHomePage: boolean;
  readonly ast: PageAst;
}

function emptyPageAst(): PageAst {
  return { version: 1, schemaVersion: "2026-03", sections: [] };
}

/**
 * Composes the tenant host from the declared host model (FR-117). An
 * unconfigured root fails closed instead of stamping a literal domain.
 */
export function siteHostname(slug: string, tenantRootDomain: string | null): string {
  if (tenantRootDomain === null) {
    throw new ServiceUnavailableError(
      "The tenant host root is not configured for this deployment.",
      { code: PLATFORM_ERROR_CODE.DEPENDENCY_UNAVAILABLE },
    );
  }
  return slug + "." + tenantRootDomain;
}

/** The site clock is its tenant branch clock, never a client value (CT-8). */
async function resolveSiteTimezone(
  tx: Prisma.TransactionClient,
  request: ProvisionSiteRequest,
): Promise<string | null> {
  if (request.branchId === null) {
    return null;
  }
  const branch = await tx.branch.findFirst({
    where: { id: request.branchId, organizationId: request.organizationId },
    select: { timezone: true },
  });
  if (branch === null) {
    throw new NotFoundError("The operational branch was not found in this workspace.", {
      code: "NOT_FOUND",
    });
  }
  return branch.timezone;
}

async function ensureSiteDomain(
  tx: Prisma.TransactionClient,
  site: { readonly id: string; readonly organizationId: string; readonly slug: string },
): Promise<void> {
  const existing = await tx.cmsDomain.findFirst({
    where: { organizationId: site.organizationId, siteId: site.id, isPrimary: true },
    select: { id: true },
  });
  if (existing !== null) return;
  await tx.cmsDomain.create({
    data: {
      organizationId: site.organizationId,
      siteId: site.id,
      hostname: siteHostname(site.slug, getHostModelConfig().tenantRootDomain),
      isPrimary: true,
      isSubdomain: true,
      status: "ACTIVE",
      verificationToken: "vt_" + randomUUID(),
      verifiedAt: new Date(),
    },
  });
}

function slugifyTitle(title: string, fallback: string): string {
  const slug = title
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, MAX_DERIVED_PATH_LENGTH)
    .replace(/-+$/g, "");
  return slug.length === 0 ? fallback : slug;
}

function uniquePath(candidate: string, used: Set<string>): string {
  if (!used.has(candidate)) {
    return candidate;
  }
  let suffix = 2;
  while (used.has(candidate + "-" + String(suffix))) {
    suffix += 1;
  }
  return candidate + "-" + String(suffix);
}

function readPageTitle(page: PageAst, fallback: string): string {
  const title = page.meta?.title?.trim();
  return title === undefined || title.length === 0 ? fallback : title;
}

/** Turns a published template into the page rows the site will own. */
export function planTemplatePages(blueprint: TemplateBlueprint): readonly PagePlan[] {
  const used = new Set<string>(["/"]);
  return blueprint.pages.map((page, index) => {
    if (index === 0) {
      return { title: readPageTitle(page, "Home"), path: "/", isHomePage: true, ast: page };
    }
    const fallback = "Page " + String(index + 1);
    const title = readPageTitle(page, fallback);
    const candidate = "/" + slugifyTitle(title, "page-" + String(index + 1));
    const path = uniquePath(candidate, used);
    used.add(path);
    assertPagePathAllowed(path);
    return { title, path, isHomePage: false, ast: page };
  });
}

function blankHomePage(): PagePlan {
  return { title: "Home", path: "/", isHomePage: true, ast: emptyPageAst() };
}

async function readReplay(
  tx: Prisma.TransactionClient,
  request: ProvisionSiteRequest,
): Promise<ProvisionedSite | null> {
  const site = await tx.cmsSite.findFirst({
    where: { organizationId: request.organizationId, idempotencyKey: request.idempotencyKey },
  });
  if (site === null) {
    return null;
  }
  if (site.title !== request.title || site.slug !== request.slug) {
    throw new ConflictError("This request id was already used for a different site.", {
      code: "IDEMPOTENCY_CONFLICT",
    });
  }
  await ensureSiteAppearance(tx, site);
  await ensureSiteDomain(tx, site);
  const pages = await tx.cmsPage.findMany({
    where: { organizationId: request.organizationId, siteId: site.id },
    orderBy: [{ isHomePage: "desc" }, { orderIndex: "asc" }, { id: "asc" }],
  });
  const homePage = pages.find((page) => page.isHomePage);
  if (homePage === undefined) {
    throw new InternalServerError("The existing site has no home page.");
  }
  return { site, pages, homePage, replayed: true };
}

/**
 * Gives a site its complete appearance snapshot in the same transaction that
 * created it (FR-150). A site provisioned before T-09 is repaired on a replay;
 * an existing snapshot is never rewritten.
 */
async function ensureSiteAppearance(
  tx: Prisma.TransactionClient,
  site: { readonly id: string; readonly organizationId: string },
): Promise<void> {
  const existing = await tx.cmsSiteAppearance.findUnique({
    where: { siteId: site.id },
    select: { id: true },
  });
  if (existing !== null) {
    return;
  }
  await tx.cmsSiteAppearance.create({
    data: {
      organizationId: site.organizationId,
      siteId: site.id,
      draftTokens: DEFAULT_APPEARANCE_TOKENS,
      publishedTokens: DEFAULT_APPEARANCE_TOKENS,
      sourceTokens: DEFAULT_APPEARANCE_TOKENS,
    },
  });
}

async function resolveTemplate(
  tx: Prisma.TransactionClient,
  request: ProvisionSiteRequest,
): Promise<TemplateBlueprint | null> {
  if (request.templateId === null) return null;
  const template = await tx.cmsCatalogItem.findFirst({
    where: {
      id: request.templateId,
      kind: "TEMPLATE",
      status: "ACTIVE",
      currentVersion: { gt: 0 },
      OR: [
        { scope: "GLOBAL", organizationId: null },
        { scope: "TENANT", organizationId: request.organizationId },
      ],
    },
    select: { id: true, currentVersion: true },
  });
  if (template === null) {
    throw new NotFoundError(
      "The requested template is not published or is not available to this workspace.",
      {
        code: "NOT_FOUND",
      },
    );
  }
  const published = await readPublishedDefinitions(tx, [template]);
  const definition = published.get(publishedDefinitionKey(template.id, template.currentVersion));
  if (definition === undefined) {
    throw new NotFoundError(
      "The requested template has no published version available to this workspace.",
      {
        code: "NOT_FOUND",
      },
    );
  }
  const parsed = TemplateBlueprintSchema.safeParse(definition);
  if (!parsed.success) {
    throw new ValidationError(
      "The published template has an invalid page blueprint.",
      parsed.error.errors.map((issue) => ({
        name: issue.path.join("."),
        reason: issue.message,
      })),
      { code: "VALIDATION_FAILED" },
    );
  }
  return parsed.data;
}

interface CreateSiteRowsInput {
  readonly tx: Prisma.TransactionClient;
  readonly request: ProvisionSiteRequest;
  readonly slug: string;
  readonly plans: readonly PagePlan[];
}

async function createSiteRows(input: CreateSiteRowsInput): Promise<ProvisionedSite> {
  const { tx, request, slug, plans } = input;
  const timezone = await resolveSiteTimezone(tx, request);
  const site = await tx.cmsSite.create({
    data: {
      organizationId: request.organizationId,
      branchId: request.branchId,
      title: request.title,
      slug,
      idempotencyKey: request.idempotencyKey,
      ...(timezone === null ? {} : { timezone }),
      ...(request.primaryLocale === null ? {} : { primaryLocale: request.primaryLocale }),
      settings: { create: { brandName: request.brandName ?? request.title } },
    },
  });
  await ensureSiteAppearance(tx, site);
  await ensureSiteDomain(tx, site);

  const pages = await Promise.all(
    plans.map((plan, index) =>
      tx.cmsPage.create({
        data: {
          organizationId: request.organizationId,
          siteId: site.id,
          title: plan.title,
          slug: plan.path,
          isHomePage: plan.isHomePage,
          orderIndex: index,
          status: "DRAFT",
          revision: 1,
          content: { create: { draftAst: plan.ast as unknown as Prisma.InputJsonValue } },
        },
      }),
    ),
  );

  const homePage = pages.find((page) => page.isHomePage);
  if (homePage === undefined) {
    throw new InternalServerError("Site provisioning did not create a home page.");
  }

  await writeCmsAudit(tx, {
    organizationId: request.organizationId,
    siteId: site.id,
    action: CMS_AUDIT_ACTIONS.SITE_CREATED,
    entityType: CMS_AUDIT_ENTITY_TYPES.SITE,
    entityId: site.id,
    actorUserId: request.actorUserId,
    changes: {
      title: site.title,
      slug: site.slug,
      templateId: request.templateId,
      pageCount: pages.length,
    },
  });

  return { site, pages, homePage, replayed: false };
}

async function provisionInTransaction(
  tx: Prisma.TransactionClient,
  request: ProvisionSiteRequest,
  quotaGuard: QuotaGuard,
): Promise<ProvisionedSite> {
  const replay = await readReplay(tx, request);
  if (replay !== null) {
    return replay;
  }
  const slug = normalizeSiteSlug(request.slug);
  const blueprint = await resolveTemplate(tx, request);
  const plans = blueprint === null ? [blankHomePage()] : planTemplatePages(blueprint);
  await quotaGuard.assertAvailable(tx, {
    organizationId: request.organizationId,
    resourceKey: QUOTA_KEYS.PAGES,
    delta: plans.length,
  });
  return createSiteRows({ tx, request, slug, plans });
}

async function replayAfterConflict(request: ProvisionSiteRequest): Promise<ProvisionedSite | null> {
  return withTenantContext(request.organizationId, (tx) => readReplay(tx, request));
}

/**
 * Creates a site and its page tree from a published catalog TEMPLATE, or a
 * blank home page. The whole aggregate and its audit row commit together, the
 * tenant identity comes from the verified session, and a replayed request id
 * resolves to the already provisioned site instead of a second one (CT-4).
 */
export async function provisionSiteFromTemplate(
  request: ProvisionSiteRequest,
  quotaGuard: QuotaGuard = tenantWriteQuotaGuard,
): Promise<ProvisionedSite> {
  try {
    return await withTenantContext(request.organizationId, (tx) =>
      provisionInTransaction(tx, request, quotaGuard),
    );
  } catch (error: unknown) {
    if (isUniqueConstraintViolation(error)) {
      // A concurrent replay may have committed the same request id first.
      const replay = await replayAfterConflict(request);
      if (replay !== null) {
        return replay;
      }
      throw new ConflictError("A site with this address already exists.", {
        code: "SITE_SLUG_CONFLICT",
      });
    }
    throw error;
  }
}
