import { z } from "zod";
import { Prisma, withTenantContext } from "@suite/db";
import { PLATFORM_ERROR_CODE } from "@suite/core";
import { ConflictError, NotFoundError, ValidationError } from "@suite/core/errors";
import {
  APPEARANCE_TOKEN_KEYS,
  AppearanceTokensSchema,
  appearanceTokensFromTheme,
  normalizeAppearanceTokens,
  type AppearanceTokens,
} from "@suite/website-builder/appearance";
import { writeCmsAudit } from "@suite/website-builder/services";
import { CMS_AUDIT_ACTIONS, CMS_AUDIT_ENTITY_TYPES } from "@suite/website-builder/audit";
import type {
  CmsAppearanceRecord,
  CmsThemeRecord,
  SelectAppearanceThemeBody,
  UpdateAppearanceBody,
} from "./contract.js";
import { CMS_THEME_LIMIT } from "./contract.js";

const THEME_DEFINITION_SCHEMA = z
  .object({
    schemaVersion: z.string().trim().min(1).max(32),
    tokens: z.record(z.union([z.string().max(200), z.number()])),
  });

interface AppearanceRow {
  readonly id: string;
  readonly organizationId: string;
  readonly siteId: string;
  readonly draftTokens: unknown;
  readonly publishedTokens: unknown;
  readonly sourceTokens: unknown;
  readonly sourceItemId: string | null;
  readonly sourceVersion: number | null;
  readonly concurrencyVersion: number;
  readonly publishedAt: Date;
}

interface SiteRow {
  readonly id: string;
  readonly organizationId: string;
  readonly title: string;
  readonly createdAt: Date;
  readonly settings: { readonly brandName: string | null; readonly brandLogoUrl: string | null } | null;
}

function tokensEqual(left: AppearanceTokens, right: AppearanceTokens): boolean {
  return APPEARANCE_TOKEN_KEYS.every((key) => left[key] === right[key]);
}

function mapAppearance(row: AppearanceRow, site: SiteRow): CmsAppearanceRecord {
  const draftTokens = normalizeAppearanceTokens(row.draftTokens);
  const publishedTokens = normalizeAppearanceTokens(row.publishedTokens);
  return {
    siteId: row.siteId,
    brandName: site.settings?.brandName ?? site.title,
    brandLogoUrl: site.settings?.brandLogoUrl ?? null,
    draftTokens,
    publishedTokens,
    sourceItemId: row.sourceItemId,
    sourceVersion: row.sourceVersion,
    version: row.concurrencyVersion,
    publishedAt: row.publishedAt.toISOString(),
    hasUnpublishedChanges: !tokensEqual(draftTokens, publishedTokens),
  };
}

/**
 * A site provisioned before T-09 has no snapshot yet. It reads as the
 * canonical complete defaults without any write; the first mutation creates
 * the row inside its own transaction.
 */
function defaultAppearance(site: SiteRow): CmsAppearanceRecord {
  const tokens = normalizeAppearanceTokens(null);
  return {
    siteId: site.id,
    brandName: site.settings?.brandName ?? site.title,
    brandLogoUrl: site.settings?.brandLogoUrl ?? null,
    draftTokens: tokens,
    publishedTokens: tokens,
    sourceItemId: null,
    sourceVersion: null,
    version: 1,
    publishedAt: site.createdAt.toISOString(),
    hasUnpublishedChanges: false,
  };
}

async function readSite(
  tx: Prisma.TransactionClient,
  organizationId: string,
  siteId: string
): Promise<SiteRow> {
  const site = await tx.cmsSite.findFirst({
    where: { id: siteId, organizationId },
    select: {
      id: true,
      organizationId: true,
      title: true,
      createdAt: true,
      settings: { select: { brandName: true, brandLogoUrl: true } },
    },
  });
  if (site === null) {
    throw new NotFoundError("The requested site was not found.", {
      code: PLATFORM_ERROR_CODE.NOT_FOUND,
    });
  }
  return site;
}

async function ensureAppearance(
  tx: Prisma.TransactionClient,
  site: SiteRow
): Promise<AppearanceRow> {
  const tokens = normalizeAppearanceTokens(null);
  return tx.cmsSiteAppearance.upsert({
    where: { siteId: site.id },
    create: {
      organizationId: site.organizationId,
      siteId: site.id,
      draftTokens: tokens,
      publishedTokens: tokens,
      sourceTokens: tokens,
    },
    update: {},
  });
}

function assertExpectedVersion(current: AppearanceRow, expectedVersion: number): void {
  if (current.concurrencyVersion !== expectedVersion) {
    throw new ConflictError("The appearance changed since it was loaded. Reload and try again.", {
      code: PLATFORM_ERROR_CODE.VERSION_CONFLICT,
    });
  }
}

async function commitVersion(
  tx: Prisma.TransactionClient,
  current: AppearanceRow,
  data: Prisma.CmsSiteAppearanceUpdateManyMutationInput
): Promise<void> {
  const updated = await tx.cmsSiteAppearance.updateMany({
    where: {
      siteId: current.siteId,
      organizationId: current.organizationId,
      concurrencyVersion: current.concurrencyVersion,
    },
    data: { ...data, concurrencyVersion: { increment: 1 } },
  });
  if (updated.count === 0) {
    throw new ConflictError("The appearance changed since it was loaded. Reload and try again.", {
      code: PLATFORM_ERROR_CODE.VERSION_CONFLICT,
    });
  }
}

async function readAppearance(
  tx: Prisma.TransactionClient,
  site: SiteRow
): Promise<CmsAppearanceRecord> {
  const row = await tx.cmsSiteAppearance.findFirst({
    where: { siteId: site.id, organizationId: site.organizationId },
  });
  return row === null ? defaultAppearance(site) : mapAppearance(row, site);
}

function invalidTheme(error: z.ZodError): ValidationError {
  return new ValidationError(
    "The selected theme does not carry a valid appearance token set.",
    error.errors.map((issue) => ({
      name: "catalogItemId." + issue.path.join("."),
      reason: issue.message,
    })),
    { code: PLATFORM_ERROR_CODE.VALIDATION_FAILED }
  );
}

function readThemeTokens(definition: unknown): AppearanceTokens {
  const parsed = THEME_DEFINITION_SCHEMA.safeParse(definition);
  if (!parsed.success) {
    throw invalidTheme(parsed.error);
  }
  const tokens: Record<string, string> = {};
  for (const [key, value] of Object.entries(parsed.data.tokens)) {
    tokens[key] = String(value);
  }
  try {
    return appearanceTokensFromTheme(tokens);
  } catch (error: unknown) {
    if (error instanceof z.ZodError) {
      throw invalidTheme(error);
    }
    throw new ValidationError(
      "The selected theme does not carry a valid appearance token set.",
      [{ name: "catalogItemId", reason: "The published theme tokens cannot be applied." }],
      { code: PLATFORM_ERROR_CODE.VALIDATION_FAILED }
    );
  }
}

/**
 * Reads the tenant site's appearance. Another tenant's site id is reported as
 * not found; the stored tokens are completed with defaults on read (FR-155).
 */
export async function getSiteAppearance(input: {
  readonly organizationId: string;
  readonly siteId: string;
}): Promise<CmsAppearanceRecord> {
  return withTenantContext(input.organizationId, async (tx) => {
    const site = await readSite(tx, input.organizationId, input.siteId);
    return readAppearance(tx, site);
  });
}

interface AppearanceWriteInput {
  readonly organizationId: string;
  readonly siteId: string;
  readonly actorUserId: string;
  readonly expectedVersion: number;
}

async function appearanceWriteContext(
  tx: Prisma.TransactionClient,
  input: AppearanceWriteInput
): Promise<{ site: SiteRow; current: AppearanceRow }> {
  const site = await readSite(tx, input.organizationId, input.siteId);
  const current = await ensureAppearance(tx, site);
  assertExpectedVersion(current, input.expectedVersion);
  return { site, current };
}

async function updateBrandSettings(
  tx: Prisma.TransactionClient,
  site: SiteRow,
  body: UpdateAppearanceBody
): Promise<void> {
  if (body.brandName === undefined && body.brandLogoUrl === undefined) {
    return;
  }
  await tx.cmsSiteSettings.upsert({
    where: { siteId: site.id },
    create: {
      organizationId: site.organizationId,
      siteId: site.id,
      brandName: body.brandName ?? site.title,
      brandLogoUrl: body.brandLogoUrl ?? null,
    },
    update: {
      brandName: body.brandName,
      brandLogoUrl: body.brandLogoUrl,
    },
  });
}

function nextDraftTokens(current: AppearanceRow, body: UpdateAppearanceBody): AppearanceTokens {
  const stored = normalizeAppearanceTokens(current.draftTokens);
  if (body.tokens === undefined) {
    return stored;
  }
  return AppearanceTokensSchema.parse({ ...stored, ...body.tokens });
}

async function updateAppearanceTx(
  tx: Prisma.TransactionClient,
  input: AppearanceWriteInput & { readonly body: UpdateAppearanceBody }
): Promise<CmsAppearanceRecord> {
  const { site, current } = await appearanceWriteContext(tx, input);
  const draftTokens = nextDraftTokens(current, input.body);
  await commitVersion(tx, current, { draftTokens });
  await updateBrandSettings(tx, site, input.body);
  await writeCmsAudit(tx, {
    organizationId: input.organizationId,
    siteId: site.id,
    action: CMS_AUDIT_ACTIONS.APPEARANCE_UPDATED,
    entityType: CMS_AUDIT_ENTITY_TYPES.SITE_APPEARANCE,
    entityId: current.id,
    actorUserId: input.actorUserId,
    changes: {
      before: { version: current.concurrencyVersion },
      after: { version: current.concurrencyVersion + 1 },
      tokenKeys: Object.keys(input.body.tokens ?? {}),
      brandName: input.body.brandName !== undefined,
      brandLogoUrl: input.body.brandLogoUrl !== undefined,
    },
  });
  const updated = await tx.cmsSiteAppearance.findFirstOrThrow({
    where: { siteId: site.id, organizationId: input.organizationId },
  });
  return mapAppearance(updated, await readSite(tx, input.organizationId, site.id));
}

/** Edits only this site's draft snapshot and brand basics (FR-151, FR-156). */
export async function updateSiteAppearance(
  input: AppearanceWriteInput & { readonly body: UpdateAppearanceBody }
): Promise<CmsAppearanceRecord> {
  return withTenantContext(input.organizationId, (tx) => updateAppearanceTx(tx, input));
}

async function resolveTheme(
  tx: Prisma.TransactionClient,
  organizationId: string,
  catalogItemId: string
): Promise<{ id: string; currentVersion: number; tokens: AppearanceTokens }> {
  const item = await tx.cmsCatalogItem.findFirst({
    where: {
      id: catalogItemId,
      kind: "THEME",
      status: "ACTIVE",
      currentVersion: { gt: 0 },
      OR: [
        { scope: "GLOBAL", organizationId: null },
        { scope: "TENANT", organizationId },
      ],
    },
    select: { id: true, currentVersion: true },
  });
  if (item === null) {
    throw new NotFoundError(
      "The requested theme is not published or is not available to this workspace.",
      { code: PLATFORM_ERROR_CODE.NOT_FOUND }
    );
  }
  const published = await tx.cmsCatalogItemVersion.findFirst({
    where: {
      itemId: item.id,
      version: item.currentVersion,
      status: "ACTIVE",
    },
    select: { version: true, definition: true },
  });
  if (published === null) {
    throw new NotFoundError(
      "The requested theme has no published definition available to this workspace.",
      { code: PLATFORM_ERROR_CODE.NOT_FOUND }
    );
  }
  return {
    id: item.id,
    currentVersion: published.version,
    tokens: readThemeTokens(published.definition),
  };
}

async function selectThemeTx(
  tx: Prisma.TransactionClient,
  input: AppearanceWriteInput & { readonly body: SelectAppearanceThemeBody }
): Promise<CmsAppearanceRecord> {
  const { site, current } = await appearanceWriteContext(tx, input);
  const theme = await resolveTheme(tx, input.organizationId, input.body.catalogItemId);
  await commitVersion(tx, current, {
    draftTokens: theme.tokens,
    sourceTokens: theme.tokens,
    sourceItemId: theme.id,
    sourceVersion: theme.currentVersion,
  });
  await writeCmsAudit(tx, {
    organizationId: input.organizationId,
    siteId: site.id,
    action: CMS_AUDIT_ACTIONS.APPEARANCE_THEME_SELECTED,
    entityType: CMS_AUDIT_ENTITY_TYPES.SITE_APPEARANCE,
    entityId: current.id,
    actorUserId: input.actorUserId,
    changes: {
      sourceItemId: theme.id,
      sourceVersion: theme.currentVersion,
      previousSourceItemId: current.sourceItemId,
    },
  });
  const updated = await tx.cmsSiteAppearance.findFirstOrThrow({
    where: { siteId: site.id, organizationId: input.organizationId },
  });
  return mapAppearance(updated, await readSite(tx, input.organizationId, site.id));
}

/** Copies a published catalog theme's values into this site's own snapshot. */
export async function selectAppearanceTheme(
  input: AppearanceWriteInput & { readonly body: SelectAppearanceThemeBody }
): Promise<CmsAppearanceRecord> {
  return withTenantContext(input.organizationId, (tx) => selectThemeTx(tx, input));
}

async function resetThemeTx(
  tx: Prisma.TransactionClient,
  input: AppearanceWriteInput
): Promise<CmsAppearanceRecord> {
  const { site, current } = await appearanceWriteContext(tx, input);
  const sourceTokens = normalizeAppearanceTokens(current.sourceTokens);
  await commitVersion(tx, current, { draftTokens: sourceTokens });
  await writeCmsAudit(tx, {
    organizationId: input.organizationId,
    siteId: site.id,
    action: CMS_AUDIT_ACTIONS.APPEARANCE_RESET,
    entityType: CMS_AUDIT_ENTITY_TYPES.SITE_APPEARANCE,
    entityId: current.id,
    actorUserId: input.actorUserId,
    changes: {
      sourceItemId: current.sourceItemId,
      sourceVersion: current.sourceVersion,
      version: current.concurrencyVersion + 1,
    },
  });
  const updated = await tx.cmsSiteAppearance.findFirstOrThrow({
    where: { siteId: site.id, organizationId: input.organizationId },
  });
  return mapAppearance(updated, await readSite(tx, input.organizationId, site.id));
}

/** Restores the token values copied when the current theme was selected. */
export async function resetSiteAppearance(
  input: AppearanceWriteInput
): Promise<CmsAppearanceRecord> {
  return withTenantContext(input.organizationId, (tx) => resetThemeTx(tx, input));
}

async function publishAppearanceTx(
  tx: Prisma.TransactionClient,
  input: AppearanceWriteInput
): Promise<CmsAppearanceRecord> {
  const { site, current } = await appearanceWriteContext(tx, input);
  const publishedTokens = normalizeAppearanceTokens(current.draftTokens);
  await commitVersion(tx, current, { publishedTokens, publishedAt: new Date() });
  await writeCmsAudit(tx, {
    organizationId: input.organizationId,
    siteId: site.id,
    action: CMS_AUDIT_ACTIONS.APPEARANCE_PUBLISHED,
    entityType: CMS_AUDIT_ENTITY_TYPES.SITE_APPEARANCE,
    entityId: current.id,
    actorUserId: input.actorUserId,
    changes: {
      sourceItemId: current.sourceItemId,
      sourceVersion: current.sourceVersion,
      version: current.concurrencyVersion + 1,
    },
  });
  const updated = await tx.cmsSiteAppearance.findFirstOrThrow({
    where: { siteId: site.id, organizationId: input.organizationId },
  });
  return mapAppearance(updated, await readSite(tx, input.organizationId, site.id));
}

/**
 * Copies the draft snapshot into the visitor-facing snapshot. Until this runs,
 * an appearance edit is visible only to the studio (FR-154).
 */
export async function publishSiteAppearance(
  input: AppearanceWriteInput
): Promise<CmsAppearanceRecord> {
  return withTenantContext(input.organizationId, (tx) => publishAppearanceTx(tx, input));
}

interface ThemeCatalogRow {
  readonly id: string;
  readonly name: string;
  readonly slug: string;
  readonly category: string;
  readonly industries: string[];
  readonly currentVersion: number;
  readonly previewRef: string | null;
}

function themeVersionKey(itemId: string, version: number): string {
  return itemId + ":" + String(version);
}

/**
 * The gallery and the copy-on-select path read only the immutable published
 * version row, never the item's working draft (FR-152). Publishing creates
 * that row; an unpublished edit can therefore never reach a site.
 */
async function readPublishedThemeDefinitions(
  tx: Prisma.TransactionClient,
  rows: readonly ThemeCatalogRow[]
): Promise<ReadonlyMap<string, unknown>> {
  if (rows.length === 0) {
    return new Map();
  }
  const currentVersions = Array.from(new Set(rows.map((row) => row.currentVersion)));
  const versions = await tx.cmsCatalogItemVersion.findMany({
    where: {
      itemId: { in: rows.map((row) => row.id) },
      version: { in: currentVersions },
      status: "ACTIVE",
    },
    select: { itemId: true, version: true, definition: true },
  });
  return new Map(
    versions.map((version) => [
      themeVersionKey(version.itemId, version.version),
      version.definition,
    ])
  );
}

function mapTheme(row: ThemeCatalogRow, definition: unknown): CmsThemeRecord | null {
  if (definition === undefined) {
    return null;
  }
  try {
    return {
      id: row.id,
      name: row.name,
      slug: row.slug,
      category: row.category,
      industries: row.industries,
      currentVersion: row.currentVersion,
      previewRef: row.previewRef,
      tokens: readThemeTokens(definition),
    };
  } catch (error: unknown) {
    console.error("[cms-appearance] Skipping a theme with an invalid token definition.", {
      themeId: row.id,
      error,
    });
    return null;
  }
}

/** Published THEME catalog items visible to this workspace (FR-151). */
export async function listPublishedThemes(organizationId: string): Promise<CmsThemeRecord[]> {
  return withTenantContext(organizationId, async (tx) => {
    const rows = await tx.cmsCatalogItem.findMany({
      where: {
        kind: "THEME",
        status: "ACTIVE",
        currentVersion: { gt: 0 },
        OR: [
          { scope: "GLOBAL", organizationId: null },
          { scope: "TENANT", organizationId },
        ],
      },
      select: {
        id: true,
        name: true,
        slug: true,
        category: true,
        industries: true,
        currentVersion: true,
        previewRef: true,
      },
      orderBy: [{ name: "asc" }, { id: "asc" }],
      take: CMS_THEME_LIMIT.max,
    });
    const definitions = await readPublishedThemeDefinitions(tx, rows);
    return rows
      .map((row) =>
        mapTheme(row, definitions.get(themeVersionKey(row.id, row.currentVersion)))
      )
      .filter((theme): theme is CmsThemeRecord => theme !== null);
  });
}
