import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import {
  Prisma,
  prisma,
  type CmsCatalogItem,
  type CmsCatalogItemVersion,
  type PrismaClient,
} from "@suite/db";
import { APP_MANIFESTS, PLATFORM_ERROR_CODE, isAppId, type AppManifest } from "@suite/core";
import {
  ConflictError,
  InternalServerError,
  NotFoundError,
  ValidationError,
} from "@suite/core/errors";
import {
  appendPlatformAuditEvent,
  PLATFORM_AUDIT_ACTIONS,
  toJsonInput,
} from "@suite/auth/platform";
import { logger } from "@suite/logger";
import type { Redis } from "@suite/redis";
import { getControlSessionSecret } from "../../lib/platform-env.js";
import { getPlatformPrismaClient, getPlatformRedis } from "../../lib/platform-db.js";
import {
  APP_CATALOG_AVAILABILITIES,
  CATALOG_PREVIEW_TTL_SECONDS,
  DEFAULT_APP_CATALOG_AVAILABILITY,
  catalogPreviewPayloadSchema,
  catalogTargetingSchema,
  validateCatalogDefinition,
  type AppCatalogAvailability,
  type CatalogApp,
  type CatalogItem,
  type CatalogItemKind,
  type CatalogItemPage,
  type CatalogItemStatus,
  type CatalogItemVersion,
  type CatalogItemVersionPage,
  type CatalogList,
  type CatalogPreview,
  type CatalogPreviewPayload,
  type CatalogTargeting,
  type CreateCatalogItemBody,
  type ListCatalogItemsQuery,
  type ListCatalogItemVersionsQuery,
  type PublishCatalogItemBody,
  type UpdateAppCatalogBody,
  type UpdateCatalogItemBody,
} from "./app-catalog.contract.js";
import { isUniqueConstraintViolation } from "./prisma-errors.js";

const AVAILABILITY_SET: ReadonlySet<string> = new Set(APP_CATALOG_AVAILABILITIES);

/**
 * A catalog target key (plan or industry) is a lower-case slug. The tenant's own
 * organization metadata is the only source, so a missing or malformed value
 * resolves to null and targeting fails closed instead of guessing (FR-007).
 */
const TENANT_TARGET_SLUG = /^[a-z0-9][a-z0-9_-]{0,63}$/;

const tenantCatalogMetadataSchema = z
  .object({
    plan: z.string().trim().regex(TENANT_TARGET_SLUG).nullable().optional(),
    industries: z.array(z.string().trim().regex(TENANT_TARGET_SLUG)).max(20).optional(),
  })
  .passthrough();

/** The tenant facts every catalog reader resolves targeting against. */
export interface TenantCatalogContext {
  readonly organizationId: string;
  readonly plan: string | null;
  readonly industries: readonly string[];
}

const EMPTY_TENANT_CATALOG_CONTEXT = {
  plan: null,
  industries: [],
} as const;

/**
 * Resolves the tenant plan and industries from the workspace's own metadata.
 * Plans are tenant data, never a hardcoded platform list, and an unreadable
 * record fails closed (FR-007, FR-008).
 */
export async function readTenantCatalogContext(
  organizationId: string,
): Promise<TenantCatalogContext> {
  const organization = await prisma.organization.findUnique({
    where: { id: organizationId },
    select: { metadata: true },
  });
  const parsed = tenantCatalogMetadataSchema.safeParse(organization?.metadata);
  if (!parsed.success) {
    return { organizationId, ...EMPTY_TENANT_CATALOG_CONTEXT };
  }
  return {
    organizationId,
    plan: parsed.data.plan ?? EMPTY_TENANT_CATALOG_CONTEXT.plan,
    industries: parsed.data.industries ?? EMPTY_TENANT_CATALOG_CONTEXT.industries,
  };
}

// One token format for reads and writes: UTC microseconds, the same shape the
// quota and entitlement contracts use (D-022: a token never repeats).
const VERSION_FORMAT = 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"';

const OVERRIDE_PROJECTION = Prisma.sql`
  "appId",
  "availability",
  "sortOrder",
  "category",
  to_char(
    "updatedAt" AT TIME ZONE 'UTC',
    ${VERSION_FORMAT}
  ) AS "version"
`;

interface OverrideStateRow {
  readonly appId: string;
  readonly availability: string;
  readonly sortOrder: number;
  readonly category: string | null;
  readonly version: string;
}

interface CatalogOverrideSnapshot {
  readonly availability: AppCatalogAvailability;
  readonly sortOrder: number;
  readonly category: string | null;
}

export interface UpdateCatalogOverrideInput {
  readonly appId: string;
  readonly change: UpdateAppCatalogBody;
  readonly operatorId: string;
  readonly requestId: string;
}

function isAppCatalogAvailability(value: string): value is AppCatalogAvailability {
  return AVAILABILITY_SET.has(value);
}

function toAvailability(value: string): AppCatalogAvailability {
  if (isAppCatalogAvailability(value)) {
    return value;
  }
  throw new InternalServerError("The catalog override row carries an unknown availability.");
}

function toSnapshot(row: OverrideStateRow): CatalogOverrideSnapshot {
  return {
    availability: toAvailability(row.availability),
    sortOrder: row.sortOrder,
    category: row.category,
  };
}

function compareCatalogApps(first: CatalogApp, second: CatalogApp): number {
  if (first.sortOrder !== second.sortOrder) {
    return first.sortOrder - second.sortOrder;
  }
  if (first.title !== second.title) {
    return first.title < second.title ? -1 : 1;
  }
  if (first.appId === second.appId) {
    return 0;
  }
  return first.appId < second.appId ? -1 : 1;
}

function versionToIso(version: string): string {
  // The database token carries microseconds; the ISO surface keeps milliseconds.
  return version.replace(/(\.\d{3})\d+Z$/, "$1Z");
}

function toCatalogApp(
  manifest: AppManifest,
  override: OverrideStateRow | null,
  installedCount: number,
): CatalogApp {
  return {
    appId: manifest.appId,
    name: manifest.name,
    title: manifest.title,
    description: manifest.description,
    // An explicit null override clears the manifest category; only a missing
    // override falls back to the manifest (FR-083).
    category: override === null ? (manifest.category ?? null) : override.category,
    availability:
      override === null ? DEFAULT_APP_CATALOG_AVAILABILITY : toAvailability(override.availability),
    sortOrder: override?.sortOrder ?? 0,
    installedCount,
    version: override?.version ?? null,
    updatedAt: override === null ? null : versionToIso(override.version),
  };
}

async function listOverrides(prisma: Prisma.TransactionClient): Promise<OverrideStateRow[]> {
  return prisma.$queryRaw<OverrideStateRow[]>(Prisma.sql`
    SELECT ${OVERRIDE_PROJECTION}
    FROM platform."app_overrides"
  `);
}

interface InstalledCountRow {
  readonly appId: string;
  readonly installedCount: bigint;
}

async function countInstalledByApp(prisma: Prisma.TransactionClient): Promise<Map<string, number>> {
  const rows = await prisma.$queryRaw<InstalledCountRow[]>(Prisma.sql`
    SELECT "appId", "installedCount"
    FROM platform."v_app_installation_counts"
  `);
  return new Map(rows.map((row) => [row.appId, Number(row.installedCount)]));
}

async function countInstalledForApp(
  prisma: Prisma.TransactionClient,
  appId: string,
): Promise<number> {
  const rows = await prisma.$queryRaw<{ installedCount: bigint }[]>(
    Prisma.sql`
      SELECT "installedCount"
      FROM platform."v_app_installation_counts"
      WHERE "appId" = ${appId}
    `,
  );
  return Number(rows[0]?.installedCount ?? 0n);
}

function buildCatalog(
  overrides: readonly OverrideStateRow[],
  installedCounts: ReadonlyMap<string, number>,
): CatalogApp[] {
  const overrideByApp = new Map(overrides.map((override) => [override.appId, override]));

  // The registry is the source of truth (FR-082). An override row for an app
  // that is no longer registered is never displayed.
  return Object.values(APP_MANIFESTS)
    .map((manifest) =>
      toCatalogApp(
        manifest,
        overrideByApp.get(manifest.appId) ?? null,
        installedCounts.get(manifest.appId) ?? 0,
      ),
    )
    .sort(compareCatalogApps);
}

/**
 * Lists the compiled registry merged with stored operational overrides. The
 * registry decides which apps exist; the override only changes presentation
 * (FR-082, FR-083, FR-085).
 */
export async function getAppCatalog(prisma: PrismaClient): Promise<CatalogList> {
  const [overrides, installedCounts] = await Promise.all([
    listOverrides(prisma),
    countInstalledByApp(prisma),
  ]);
  return { apps: buildCatalog(overrides, installedCounts) };
}

async function readOverrideForUpdate(
  tx: Prisma.TransactionClient,
  appId: string,
): Promise<OverrideStateRow | null> {
  const rows = await tx.$queryRaw<OverrideStateRow[]>(Prisma.sql`
    SELECT ${OVERRIDE_PROJECTION}
    FROM platform."app_overrides"
    WHERE "appId" = ${appId}
    FOR UPDATE
  `);
  return rows[0] ?? null;
}

function nextSnapshot(
  current: OverrideStateRow | null,
  change: UpdateAppCatalogBody,
): CatalogOverrideSnapshot {
  const base = current
    ? toSnapshot(current)
    : {
        availability: DEFAULT_APP_CATALOG_AVAILABILITY,
        sortOrder: 0,
        category: null,
      };

  return {
    availability: change.availability ?? base.availability,
    sortOrder: change.sortOrder ?? base.sortOrder,
    category: change.category === undefined ? base.category : change.category,
  };
}

function assertObservedVersion(
  current: OverrideStateRow | null,
  expectedVersion: string | null,
): void {
  const observed = current?.version ?? null;
  if (expectedVersion === observed) {
    return;
  }
  throw new ConflictError(
    "The catalog override changed since it was observed. Reload the catalog and retry.",
    { code: PLATFORM_ERROR_CODE.VERSION_CONFLICT },
  );
}

async function updateExistingOverride(
  tx: Prisma.TransactionClient,
  input: UpdateCatalogOverrideInput,
  snapshot: CatalogOverrideSnapshot,
): Promise<OverrideStateRow> {
  const rows = await tx.$queryRaw<OverrideStateRow[]>(Prisma.sql`
    UPDATE platform."app_overrides"
    SET "availability" = ${snapshot.availability}::platform."PlatformAppAvailability",
        "sortOrder" = ${snapshot.sortOrder},
        "category" = ${snapshot.category},
        "updatedBy" = ${input.operatorId},
        "updatedAt" = GREATEST(
          clock_timestamp(),
          "updatedAt" + interval '1 microsecond'
        )
    WHERE "appId" = ${input.appId}
    RETURNING ${OVERRIDE_PROJECTION}
  `);
  const row = rows[0];
  if (row === undefined) {
    throw new ConflictError(
      "The catalog override changed since it was observed. Reload the catalog and retry.",
      { code: PLATFORM_ERROR_CODE.VERSION_CONFLICT },
    );
  }
  return row;
}

async function insertOverride(
  tx: Prisma.TransactionClient,
  input: UpdateCatalogOverrideInput,
  snapshot: CatalogOverrideSnapshot,
): Promise<OverrideStateRow> {
  const rows = await tx.$queryRaw<OverrideStateRow[]>(Prisma.sql`
    INSERT INTO platform."app_overrides" (
      "id",
      "appId",
      "availability",
      "sortOrder",
      "category",
      "updatedBy",
      "updatedAt"
    ) VALUES (
      gen_random_uuid()::text,
      ${input.appId},
      ${snapshot.availability}::platform."PlatformAppAvailability",
      ${snapshot.sortOrder},
      ${snapshot.category},
      ${input.operatorId},
      clock_timestamp()
    )
    ON CONFLICT ("appId") DO NOTHING
    RETURNING ${OVERRIDE_PROJECTION}
  `);
  const row = rows[0];
  if (row === undefined) {
    // Another transaction created the row after the SELECT; its version wins.
    throw new ConflictError(
      "The catalog override changed since it was observed. Reload the catalog and retry.",
      { code: PLATFORM_ERROR_CODE.VERSION_CONFLICT },
    );
  }
  return row;
}

async function appendOverrideAudit(
  tx: Prisma.TransactionClient,
  input: UpdateCatalogOverrideInput,
  before: CatalogOverrideSnapshot | null,
  after: CatalogOverrideSnapshot,
): Promise<void> {
  await appendPlatformAuditEvent(tx, {
    actorOperatorId: input.operatorId,
    action: PLATFORM_AUDIT_ACTIONS.APP_CATALOG_OVERRIDE_SET,
    entityType: "app_override",
    entityId: input.appId,
    before,
    after,
    requestId: input.requestId,
  });
}

/**
 * Applies one operational override. The registry membership, version guard and
 * audit row all run in one transaction (FR-083, FR-086, FR-114, invariant 4).
 */
export async function updateAppCatalogOverride(
  prisma: PrismaClient,
  input: UpdateCatalogOverrideInput,
): Promise<CatalogApp> {
  if (!isAppId(input.appId)) {
    throw new ValidationError(
      "The application is not registered in the platform catalog.",
      [{ name: "appId", reason: `Unknown application: ${input.appId}` }],
      { code: PLATFORM_ERROR_CODE.UNKNOWN_APP },
    );
  }

  const manifest = APP_MANIFESTS[input.appId];
  if (manifest === undefined) {
    throw new InternalServerError("The application registry resolved an unknown identifier.");
  }

  return prisma.$transaction(async (tx) => {
    const current = await readOverrideForUpdate(tx, input.appId);
    assertObservedVersion(current, input.change.expectedVersion);

    const before = current === null ? null : toSnapshot(current);
    const snapshot = nextSnapshot(current, input.change);
    const written =
      current === null
        ? await insertOverride(tx, input, snapshot)
        : await updateExistingOverride(tx, input, snapshot);

    await appendOverrideAudit(tx, input, before, snapshot);

    const installedCount = await countInstalledForApp(tx, input.appId);
    return toCatalogApp(manifest, written, installedCount);
  });
}

// ==============================================================================
// Website Builder application catalog (P-03, #342)
//
// The item row is the mutable aggregate: its definition is the working draft
// and its status is the lifecycle. Published history is written to
// cms_catalog_item_versions only at publish time and is immutable at the
// database level, so editing an active item can never rewrite what tenants
// already consume (FR-005, T011).
// ==============================================================================

export const APP_CATALOG_CACHE_POLICY = {
  keyPrefix: "platform:app-catalog:website-builder:",
  keyTemplate: "{items|<itemId>}",
  ttlSeconds: 300,
  invalidationTrigger: "catalog item publish, deprecate, disable or retire",
} as const;

export interface CatalogActor {
  readonly operatorId: string;
  readonly requestId: string;
}

export interface AppCatalogCacheInvalidator {
  invalidate(itemId: string): Promise<void>;
}

export interface AppCatalogServiceContext {
  readonly prisma: PrismaClient;
  readonly cache: AppCatalogCacheInvalidator;
  readonly previewSigningSecret: string;
}

export type CatalogLifecycleAction = "deprecate" | "disable" | "retire";

export interface CreateCatalogItemInput extends CatalogActor {
  readonly body: CreateCatalogItemBody;
}

export interface UpdateCatalogItemInput extends CatalogActor {
  readonly itemId: string;
  readonly body: UpdateCatalogItemBody;
}

export interface PublishCatalogItemInput extends CatalogActor {
  readonly itemId: string;
  readonly body: PublishCatalogItemBody;
}

export interface PreviewCatalogItemInput extends CatalogActor {
  readonly itemId: string;
}

export interface ForkCatalogItemVersionInput extends CatalogActor {
  readonly itemId: string;
}

export interface LifecycleCatalogItemInput extends CatalogActor {
  readonly itemId: string;
  readonly action: CatalogLifecycleAction;
}

export interface ListCatalogItemVersionsInput {
  readonly itemId: string;
  readonly query: ListCatalogItemVersionsQuery;
}

let defaultContext: AppCatalogServiceContext | null = null;

/**
 * The route-facing context. It is lazy so importing the router does not require
 * the Platform environment or a Redis connection at module load.
 */
export function getAppCatalogServiceContext(): AppCatalogServiceContext {
  defaultContext ??= {
    prisma: getPlatformPrismaClient(),
    cache: createAppCatalogCacheInvalidator(getPlatformRedis()),
    previewSigningSecret: getControlSessionSecret(),
  };
  return defaultContext;
}

function appCatalogCacheKeys(itemId: string): readonly string[] {
  const prefix = APP_CATALOG_CACHE_POLICY.keyPrefix;
  return [prefix + "items", prefix + itemId];
}

/**
 * Invalidation runs after the transaction commits because Redis is not part of
 * the database transaction. A failed invalidation is logged and left to the TTL:
 * the write already succeeded and must not be reported as failed (CT-11).
 */
export function createAppCatalogCacheInvalidator(
  client: Pick<Redis, "del">,
): AppCatalogCacheInvalidator {
  return {
    async invalidate(itemId: string): Promise<void> {
      try {
        await client.del(...appCatalogCacheKeys(itemId));
      } catch (error) {
        logger.warn(
          {
            err: error,
            cacheKey: APP_CATALOG_CACHE_POLICY.keyPrefix + "items",
            invalidationTrigger: APP_CATALOG_CACHE_POLICY.invalidationTrigger,
          },
          "Application catalog cache invalidation failed; the TTL bounds staleness",
        );
      }
    },
  };
}

const CATALOG_CURSOR_SCHEMA = z
  .object({
    updatedAt: z.string().datetime(),
    id: z.string().min(1),
  })
  .strict();

const CATALOG_VERSION_CURSOR_SCHEMA = z.object({ version: z.number().int().positive() }).strict();

function invalidCursor(): ValidationError {
  return new ValidationError(
    "The pagination cursor is invalid.",
    [{ name: "cursor", reason: "Use the cursor returned by the previous page." }],
    { code: PLATFORM_ERROR_CODE.VALIDATION_FAILED },
  );
}

function decodeCursorJson(value: string): unknown {
  try {
    return JSON.parse(Buffer.from(value, "base64url").toString("utf8"));
  } catch {
    throw invalidCursor();
  }
}

function encodeCursor(value: unknown): string {
  return Buffer.from(JSON.stringify(value), "utf8").toString("base64url");
}

interface CatalogCursor {
  readonly updatedAt: Date;
  readonly id: string;
}

function decodeCatalogCursor(value: string | undefined): CatalogCursor | null {
  if (value === undefined) {
    return null;
  }
  const parsed = CATALOG_CURSOR_SCHEMA.safeParse(decodeCursorJson(value));
  if (!parsed.success) {
    throw invalidCursor();
  }
  return {
    updatedAt: new Date(parsed.data.updatedAt),
    id: parsed.data.id,
  };
}

function encodeCatalogCursor(row: CmsCatalogItem): string {
  return encodeCursor({
    updatedAt: row.updatedAt.toISOString(),
    id: row.id,
  });
}

function decodeVersionCursor(value: string | undefined): number | null {
  if (value === undefined) {
    return null;
  }
  const parsed = CATALOG_VERSION_CURSOR_SCHEMA.safeParse(decodeCursorJson(value));
  if (!parsed.success) {
    throw invalidCursor();
  }
  return parsed.data.version;
}

function isJsonNull(value: unknown): value is typeof Prisma.JsonNull {
  return value === Prisma.JsonNull;
}

function requiredJsonInput(value: unknown): Prisma.InputJsonValue {
  const encoded = toJsonInput(value);
  if (encoded === undefined || isJsonNull(encoded)) {
    throw new InternalServerError("A catalog JSON payload is required.");
  }
  return encoded;
}

function toIso(value: Date | null): string | null {
  return value === null ? null : value.toISOString();
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

/** JSON keys sort by UTF-16 code unit, never by the host locale (CT-8). */
function compareJsonKeys(first: string, second: string): number {
  if (first === second) {
    return 0;
  }
  return first < second ? -1 : 1;
}

function stableStringify(value: unknown): string {
  if (Array.isArray(value)) {
    return "[" + value.map((entry) => stableStringify(entry)).join(",") + "]";
  }
  if (isRecord(value)) {
    const entries = Object.entries(value).sort(([first], [second]) =>
      compareJsonKeys(first, second),
    );
    const encoded = entries.map(
      ([key, entry]) => JSON.stringify(key) + ":" + stableStringify(entry),
    );
    return "{" + encoded.join(",") + "}";
  }
  return JSON.stringify(value);
}

/** Canonical definition hash used by the preview precondition (FR-149). */
export function catalogDefinitionHash(definition: unknown): string {
  return createHash("sha256").update(stableStringify(definition)).digest("hex");
}

const PREVIEW_REFERENCE_PREFIX = "pvw";

function signPreviewPayload(secret: string, encoded: string): string {
  return createHmac("sha256", secret).update(encoded).digest("base64url");
}

export function createCatalogPreviewReference(
  secret: string,
  payload: CatalogPreviewPayload,
): string {
  const encoded = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
  return PREVIEW_REFERENCE_PREFIX + "." + encoded + "." + signPreviewPayload(secret, encoded);
}

/**
 * Verifies a signed preview reference. Any malformed, tampered or expired token
 * returns null; a caller must treat null as "not previewed" and fail closed.
 */
function isValidPreviewSignature(secret: string, encoded: string, signature: string): boolean {
  const expected = Buffer.from(signPreviewPayload(secret, encoded), "base64url");
  const actual = Buffer.from(signature, "base64url");
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

function decodePreviewPayload(encoded: string): CatalogPreviewPayload | null {
  let decoded: unknown;
  try {
    decoded = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8"));
  } catch {
    return null;
  }
  const parsed = catalogPreviewPayloadSchema.safeParse(decoded);
  return parsed.success ? parsed.data : null;
}

export function verifyCatalogPreviewReference(
  secret: string,
  token: string,
  now: number = Date.now(),
): CatalogPreviewPayload | null {
  const parts = token.split(".");
  const [prefix, encoded, signature] = parts;
  if (
    parts.length !== 3 ||
    prefix !== PREVIEW_REFERENCE_PREFIX ||
    encoded === undefined ||
    signature === undefined
  ) {
    return null;
  }
  if (!isValidPreviewSignature(secret, encoded, signature)) {
    return null;
  }
  const payload = decodePreviewPayload(encoded);
  if (payload === null || Date.parse(payload.expiresAt) <= now) {
    return null;
  }
  return payload;
}

function parseTargeting(value: unknown): CatalogTargeting {
  return catalogTargetingSchema.parse(value);
}

function parseDefinition(value: unknown): Record<string, unknown> {
  return z.record(z.unknown()).parse(value);
}

export function toCatalogItem(row: CmsCatalogItem): CatalogItem {
  return {
    id: row.id,
    kind: row.kind,
    scope: row.scope,
    organizationId: row.organizationId,
    name: row.name,
    slug: row.slug,
    category: row.category,
    industries: row.industries,
    definition: parseDefinition(row.definition),
    previewRef: row.previewRef,
    flagKey: row.flagKey,
    targeting: parseTargeting(row.targeting),
    status: row.status,
    contractVersion: row.contractVersion,
    currentVersion: row.currentVersion,
    draftVersion: row.draftVersion,
    concurrencyVersion: row.concurrencyVersion,
    previewedAt: toIso(row.previewedAt),
    publishedAt: toIso(row.publishedAt),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export function toCatalogItemVersion(row: CmsCatalogItemVersion): CatalogItemVersion {
  return {
    id: row.id,
    itemId: row.itemId,
    version: row.version,
    definition: parseDefinition(row.definition),
    status: row.status,
    contractVersion: row.contractVersion,
    changeNote: row.changeNote,
    previewedAt: toIso(row.previewedAt),
    publishedAt: row.publishedAt.toISOString(),
    publishedBy: row.publishedBy,
    createdAt: row.createdAt.toISOString(),
  };
}

interface CatalogAuditSnapshot {
  readonly name: string;
  readonly slug: string;
  readonly status: CatalogItemStatus;
  readonly currentVersion: number;
  readonly draftVersion: number | null;
  readonly contractVersion: string;
  readonly definitionHash: string;
  readonly targeting: CatalogTargeting;
  readonly flagKey: string | null;
}

/**
 * The audit row records the item, version and before/after state without
 * duplicating a potentially large definition body (FR-011).
 */
export function toCatalogAuditSnapshot(item: CatalogItem): CatalogAuditSnapshot {
  return {
    name: item.name,
    slug: item.slug,
    status: item.status,
    currentVersion: item.currentVersion,
    draftVersion: item.draftVersion,
    contractVersion: item.contractVersion,
    definitionHash: catalogDefinitionHash(item.definition),
    targeting: item.targeting,
    flagKey: item.flagKey,
  };
}

function versionConflict(): ConflictError {
  return new ConflictError(
    "The catalog item changed since it was observed. Reload the item and retry.",
    { code: PLATFORM_ERROR_CODE.VERSION_CONFLICT },
  );
}

function itemNotPublishable(detail: string): ConflictError {
  return new ConflictError(detail, {
    code: PLATFORM_ERROR_CODE.ITEM_NOT_PUBLISHABLE,
  });
}

function previewRequired(): ConflictError {
  return new ConflictError("Preview the current draft before publishing it.", {
    code: PLATFORM_ERROR_CODE.PREVIEW_REQUIRED,
  });
}

function itemNotFound(): NotFoundError {
  return new NotFoundError("The catalog item does not exist.", {
    code: PLATFORM_ERROR_CODE.NOT_FOUND,
  });
}

function validationFromIssues(
  issues: readonly { path: (string | number)[]; message: string }[],
): ValidationError {
  return new ValidationError(
    "The catalog item failed validation.",
    issues.map((issue) => ({
      name: issue.path.join(".") || "definition",
      reason: issue.message,
    })),
    { code: PLATFORM_ERROR_CODE.VALIDATION_FAILED },
  );
}

async function requireItem(tx: Prisma.TransactionClient, itemId: string): Promise<CmsCatalogItem> {
  const row = await tx.cmsCatalogItem.findUnique({ where: { id: itemId } });
  if (row === null) {
    throw itemNotFound();
  }
  return row;
}

function assertNotRetired(row: CmsCatalogItem): void {
  if (row.status === "RETIRED") {
    throw itemNotPublishable(
      "The catalog item is retired; retired items are terminal and remain resolvable.",
    );
  }
}

export async function listCatalogItems(
  context: AppCatalogServiceContext,
  query: ListCatalogItemsQuery,
): Promise<CatalogItemPage> {
  const cursor = decodeCatalogCursor(query.cursor);
  const where: Prisma.CmsCatalogItemWhereInput = {};
  if (query.kind !== undefined) {
    where.kind = query.kind;
  }
  if (query.status !== undefined) {
    where.status = query.status;
  }
  if (cursor !== null) {
    where.OR = [
      { updatedAt: { lt: cursor.updatedAt } },
      { updatedAt: cursor.updatedAt, id: { lt: cursor.id } },
    ];
  }
  const rows = await context.prisma.cmsCatalogItem.findMany({
    where,
    orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
    take: query.limit + 1,
  });
  const page = rows.slice(0, query.limit);
  const last = page[page.length - 1];
  return {
    items: page.map(toCatalogItem),
    nextCursor: rows.length > query.limit && last !== undefined ? encodeCatalogCursor(last) : null,
  };
}

export async function getCatalogItem(
  context: AppCatalogServiceContext,
  itemId: string,
): Promise<CatalogItem> {
  const row = await context.prisma.cmsCatalogItem.findUnique({
    where: { id: itemId },
  });
  if (row === null) {
    throw itemNotFound();
  }
  return toCatalogItem(row);
}

export async function listCatalogItemVersions(
  context: AppCatalogServiceContext,
  input: ListCatalogItemVersionsInput,
): Promise<CatalogItemVersionPage> {
  const item = await context.prisma.cmsCatalogItem.findUnique({
    where: { id: input.itemId },
    select: { id: true },
  });
  if (item === null) {
    throw itemNotFound();
  }
  const cursor = decodeVersionCursor(input.query.cursor);
  const rows = await context.prisma.cmsCatalogItemVersion.findMany({
    where: {
      itemId: input.itemId,
      ...(cursor === null ? {} : { version: { lt: cursor } }),
    },
    orderBy: { version: "desc" },
    take: input.query.limit + 1,
  });
  const page = rows.slice(0, input.query.limit);
  const last = page[page.length - 1];
  return {
    versions: page.map(toCatalogItemVersion),
    nextCursor:
      rows.length > input.query.limit && last !== undefined
        ? encodeCursor({ version: last.version })
        : null,
  };
}

function buildCreateData(
  input: CreateCatalogItemInput,
  definition: unknown,
): Prisma.CmsCatalogItemCreateInput {
  const body = input.body;
  return {
    kind: body.kind,
    scope: "GLOBAL",
    organizationId: null,
    name: body.name,
    slug: body.slug,
    category: body.category,
    industries: body.industries,
    definition: requiredJsonInput(definition),
    flagKey: body.flagKey,
    targeting: requiredJsonInput(body.targeting),
    status: "DRAFT",
    contractVersion: body.contractVersion,
    currentVersion: 0,
    draftVersion: 1,
    concurrencyVersion: 1,
    createdBy: input.operatorId,
    updatedBy: input.operatorId,
  };
}

function duplicateSlugError(): ValidationError {
  return new ValidationError(
    "A catalog item with this slug already exists.",
    [
      {
        name: "slug",
        reason: "Slug must be unique per kind and scope.",
      },
    ],
    { code: PLATFORM_ERROR_CODE.VALIDATION_FAILED },
  );
}

/**
 * Creates a draft catalog item. The item starts with no published version and
 * one draft version number; a version row is written only when it is published
 * (FR-012, T010).
 */
export async function createCatalogItem(
  context: AppCatalogServiceContext,
  input: CreateCatalogItemInput,
): Promise<CatalogItem> {
  const validated = validateCatalogDefinition(input.body.kind, input.body.definition);
  if (!validated.success) {
    throw validationFromIssues(validated.issues);
  }

  const created = await context.prisma.$transaction(async (tx) => {
    let row: CmsCatalogItem;
    try {
      row = await tx.cmsCatalogItem.create({
        data: buildCreateData(input, validated.data),
      });
    } catch (error) {
      // A partial unique index (global kind+slug) reports P2002 without a
      // target, so an untargeted violation is the slug conflict here; the only
      // other unique key is the cuid primary key, which cannot collide.
      if (isUniqueConstraintViolation(error)) {
        throw duplicateSlugError();
      }
      throw error;
    }
    await appendPlatformAuditEvent(tx, {
      actorOperatorId: input.operatorId,
      action: PLATFORM_AUDIT_ACTIONS.CATALOG_ITEM_CREATED,
      entityType: "cms_catalog_item",
      entityId: row.id,
      before: null,
      after: toCatalogAuditSnapshot(toCatalogItem(row)),
      requestId: input.requestId,
    });
    return row;
  });
  return toCatalogItem(created);
}

function validateDefinitionOrThrow(kind: CatalogItemKind, definition: unknown): unknown {
  const validated = validateCatalogDefinition(kind, definition);
  if (!validated.success) {
    throw validationFromIssues(validated.issues);
  }
  return validated.data;
}

function resolveNextDefinition(current: CmsCatalogItem, body: UpdateCatalogItemBody): unknown {
  if (body.definition === undefined) {
    return current.definition;
  }
  return validateDefinitionOrThrow(current.kind, body.definition);
}

function buildDraftUpdateData(
  current: CmsCatalogItem,
  input: UpdateCatalogItemInput,
  definition: unknown,
): Prisma.CmsCatalogItemUpdateManyMutationInput {
  const body = input.body;
  const data: Prisma.CmsCatalogItemUpdateManyMutationInput = {
    definition: requiredJsonInput(definition),
    draftVersion: current.draftVersion ?? current.currentVersion + 1,
    previewRef: null,
    previewedAt: null,
    previewedHash: null,
    previewedBy: null,
    concurrencyVersion: { increment: 1 },
    updatedBy: input.operatorId,
  };
  if (body.name !== undefined) {
    data.name = body.name;
  }
  if (body.slug !== undefined) {
    data.slug = body.slug;
  }
  if (body.category !== undefined) {
    data.category = body.category;
  }
  if (body.industries !== undefined) {
    data.industries = body.industries;
  }
  if (body.contractVersion !== undefined) {
    data.contractVersion = body.contractVersion;
  }
  if (body.flagKey !== undefined) {
    data.flagKey = body.flagKey;
  }
  if (body.targeting !== undefined) {
    data.targeting = requiredJsonInput(body.targeting);
  }
  return data;
}

/**
 * Edits the working draft. Editing an active item only ever writes the item
 * row; the published version rows stay untouched (FR-005, acceptance bullet 2).
 * Any edit invalidates the preview, so a stale preview cannot satisfy publish.
 */
export async function updateCatalogItemDraft(
  context: AppCatalogServiceContext,
  input: UpdateCatalogItemInput,
): Promise<CatalogItem> {
  const updated = await context.prisma.$transaction(async (tx) => {
    const current = await requireItem(tx, input.itemId);
    assertNotRetired(current);
    if (current.concurrencyVersion !== input.body.expectedVersion) {
      throw versionConflict();
    }
    const definition = resolveNextDefinition(current, input.body);
    let result: Prisma.BatchPayload;
    try {
      result = await tx.cmsCatalogItem.updateMany({
        where: {
          id: current.id,
          concurrencyVersion: current.concurrencyVersion,
        },
        data: buildDraftUpdateData(current, input, definition),
      });
    } catch (error) {
      // A partial unique index (global kind+slug) reports P2002 without a
      // target, so an untargeted violation is the slug conflict here; the only
      // other unique key is the cuid primary key, which cannot collide.
      if (isUniqueConstraintViolation(error)) {
        throw duplicateSlugError();
      }
      throw error;
    }
    if (result.count === 0) {
      throw versionConflict();
    }
    const next = await requireItem(tx, current.id);
    await appendPlatformAuditEvent(tx, {
      actorOperatorId: input.operatorId,
      action: PLATFORM_AUDIT_ACTIONS.CATALOG_ITEM_DRAFT_UPDATED,
      entityType: "cms_catalog_item",
      entityId: current.id,
      before: toCatalogAuditSnapshot(toCatalogItem(current)),
      after: toCatalogAuditSnapshot(toCatalogItem(next)),
      requestId: input.requestId,
    });
    return next;
  });
  return toCatalogItem(updated);
}

/**
 * Opens a draft for the next version. A draft already exists when an active
 * item was edited, so the call is idempotent; a never-published item already
 * has its first draft. The published version rows are never touched (FR-005).
 */
export async function forkCatalogItemVersion(
  context: AppCatalogServiceContext,
  input: ForkCatalogItemVersionInput,
): Promise<CatalogItem> {
  const updated = await context.prisma.$transaction(async (tx) => {
    const current = await requireItem(tx, input.itemId);
    assertNotRetired(current);
    if (current.draftVersion !== null) {
      return current;
    }
    if (current.currentVersion < 1) {
      throw itemNotPublishable("The catalog item has no published version to fork.");
    }
    const result = await tx.cmsCatalogItem.updateMany({
      where: {
        id: current.id,
        concurrencyVersion: current.concurrencyVersion,
        draftVersion: null,
      },
      data: {
        draftVersion: current.currentVersion + 1,
        previewRef: null,
        previewedAt: null,
        previewedHash: null,
        previewedBy: null,
        concurrencyVersion: { increment: 1 },
        updatedBy: input.operatorId,
      },
    });
    if (result.count === 0) {
      throw versionConflict();
    }
    const next = await requireItem(tx, current.id);
    await appendPlatformAuditEvent(tx, {
      actorOperatorId: input.operatorId,
      action: PLATFORM_AUDIT_ACTIONS.CATALOG_ITEM_VERSION_FORKED,
      entityType: "cms_catalog_item",
      entityId: current.id,
      before: toCatalogAuditSnapshot(toCatalogItem(current)),
      after: toCatalogAuditSnapshot(toCatalogItem(next)),
      requestId: input.requestId,
    });
    return next;
  });
  return toCatalogItem(updated);
}

/**
 * Publish evidence is the stored signed reference itself: it must still verify,
 * still cover the definition being published, still name the same version and
 * still be inside its TTL (FR-006, FR-149). A stale or foreign reference is
 * treated exactly like no preview at all.
 */
function assertPreviewed(current: CmsCatalogItem, secret: string): void {
  if (current.previewedAt === null || current.previewedHash === null) {
    throw previewRequired();
  }
  if (current.previewedHash !== catalogDefinitionHash(current.definition)) {
    throw previewRequired();
  }
  if (current.previewRef === null) {
    throw previewRequired();
  }
  const reference = verifyCatalogPreviewReference(secret, current.previewRef);
  if (reference === null) {
    throw previewRequired();
  }
  if (
    reference.itemId !== current.id ||
    reference.version !== (current.draftVersion ?? current.currentVersion) ||
    reference.definitionHash !== current.previewedHash
  ) {
    throw previewRequired();
  }
}

interface CreatePublishedVersionOptions {
  readonly tx: Prisma.TransactionClient;
  readonly current: CmsCatalogItem;
  readonly input: PublishCatalogItemInput;
  readonly definition: unknown;
  readonly publishedAt: Date;
}

async function createPublishedVersion(options: CreatePublishedVersionOptions): Promise<void> {
  const { tx, current, input, definition, publishedAt } = options;
  try {
    await tx.cmsCatalogItemVersion.create({
      data: {
        itemId: current.id,
        version: input.body.version,
        definition: requiredJsonInput(definition),
        status: "ACTIVE",
        contractVersion: current.contractVersion,
        changeNote: input.body.changeNote ?? null,
        previewedAt: current.previewedAt,
        previewedHash: current.previewedHash,
        previewedBy: current.previewedBy,
        publishedAt,
        publishedBy: input.operatorId,
        createdBy: input.operatorId,
      },
    });
  } catch (error) {
    if (isUniqueConstraintViolation(error, "version")) {
      throw versionConflict();
    }
    throw error;
  }
}

function buildPublishData(
  input: PublishCatalogItemInput,
  version: number,
  publishedAt: Date,
): Prisma.CmsCatalogItemUpdateManyMutationInput {
  const data: Prisma.CmsCatalogItemUpdateManyMutationInput = {
    status: "ACTIVE",
    currentVersion: version,
    draftVersion: null,
    publishedAt,
    previewRef: null,
    previewedAt: null,
    previewedHash: null,
    previewedBy: null,
    concurrencyVersion: { increment: 1 },
    updatedBy: input.operatorId,
  };
  if (input.body.targeting !== undefined) {
    data.targeting = requiredJsonInput(input.body.targeting);
  }
  return data;
}

interface PublishAuditOptions {
  readonly tx: Prisma.TransactionClient;
  readonly input: PublishCatalogItemInput;
  readonly before: CmsCatalogItem;
  readonly after: CmsCatalogItem;
  readonly version: number;
}

async function appendPublishAudit(options: PublishAuditOptions): Promise<void> {
  const { tx, input, before, after, version } = options;
  await appendPlatformAuditEvent(tx, {
    actorOperatorId: input.operatorId,
    action: PLATFORM_AUDIT_ACTIONS.CATALOG_ITEM_PUBLISHED,
    entityType: "cms_catalog_item",
    entityId: before.id,
    before: {
      ...toCatalogAuditSnapshot(toCatalogItem(before)),
      publishedVersion: version,
    },
    after: {
      ...toCatalogAuditSnapshot(toCatalogItem(after)),
      publishedVersion: version,
      changeNote: input.body.changeNote ?? null,
    },
    requestId: input.requestId,
  });
}

async function publishWithoutDraft(
  tx: Prisma.TransactionClient,
  current: CmsCatalogItem,
  input: PublishCatalogItemInput,
): Promise<CmsCatalogItem> {
  if (current.currentVersion !== input.body.version) {
    throw versionConflict();
  }
  if (current.status === "ACTIVE") {
    return current;
  }
  if (current.status !== "DEPRECATED" && current.status !== "DISABLED") {
    throw itemNotPublishable("The catalog item has no draft to publish.");
  }
  const publishedAt = new Date();
  const result = await tx.cmsCatalogItem.updateMany({
    where: {
      id: current.id,
      concurrencyVersion: current.concurrencyVersion,
      status: current.status,
    },
    data: buildPublishData(input, input.body.version, publishedAt),
  });
  if (result.count === 0) {
    throw versionConflict();
  }
  const next = await requireItem(tx, current.id);
  await appendPublishAudit({
    tx,
    input,
    before: current,
    after: next,
    version: input.body.version,
  });
  return next;
}

async function publishDraft(
  tx: Prisma.TransactionClient,
  current: CmsCatalogItem,
  input: PublishCatalogItemInput,
  previewSigningSecret: string,
): Promise<CmsCatalogItem> {
  if (current.draftVersion !== input.body.version) {
    throw versionConflict();
  }
  assertPreviewed(current, previewSigningSecret);
  const definition = validateDefinitionOrThrow(current.kind, current.definition);
  const publishedAt = new Date();
  await createPublishedVersion({
    tx,
    current,
    input,
    definition,
    publishedAt,
  });
  const result = await tx.cmsCatalogItem.updateMany({
    where: {
      id: current.id,
      concurrencyVersion: current.concurrencyVersion,
      draftVersion: input.body.version,
    },
    data: buildPublishData(input, input.body.version, publishedAt),
  });
  if (result.count === 0) {
    throw versionConflict();
  }
  const next = await requireItem(tx, current.id);
  await appendPublishAudit({
    tx,
    input,
    before: current,
    after: next,
    version: input.body.version,
  });
  return next;
}

/**
 * Publishes one draft version. A completed preview of the same definition is a
 * hard precondition (FR-006, FR-149); a missing or stale preview is
 * PREVIEW_REQUIRED. Publishing an already-active version is idempotent, and a
 * deprecated or disabled item is republished from its published version.
 */
export async function publishCatalogItem(
  context: AppCatalogServiceContext,
  input: PublishCatalogItemInput,
): Promise<CatalogItem> {
  const published = await context.prisma.$transaction(async (tx) => {
    const current = await requireItem(tx, input.itemId);
    assertNotRetired(current);
    if (current.draftVersion === null) {
      return publishWithoutDraft(tx, current, input);
    }
    return publishDraft(tx, current, input, context.previewSigningSecret);
  });
  await context.cache.invalidate(published.id);
  return toCatalogItem(published);
}

/** The signed reference plus the preview evidence recorded on the item row. */
interface PreviewArtifact {
  readonly previewRef: string;
  readonly previewedAt: Date;
  readonly expiresAt: Date;
  readonly version: number;
  readonly definitionHash: string;
}

function buildPreviewArtifact(
  secret: string,
  current: CmsCatalogItem,
  version: number,
): PreviewArtifact {
  const definitionHash = catalogDefinitionHash(current.definition);
  const previewedAt = new Date();
  const expiresAt = new Date(previewedAt.getTime() + CATALOG_PREVIEW_TTL_SECONDS * 1000);
  const previewRef = createCatalogPreviewReference(secret, {
    itemId: current.id,
    version,
    definitionHash,
    expiresAt: expiresAt.toISOString(),
  });
  return { previewRef, previewedAt, expiresAt, version, definitionHash };
}

async function applyPreviewState(
  tx: Prisma.TransactionClient,
  current: CmsCatalogItem,
  input: PreviewCatalogItemInput,
  artifact: PreviewArtifact,
): Promise<CmsCatalogItem> {
  const result = await tx.cmsCatalogItem.updateMany({
    where: {
      id: current.id,
      concurrencyVersion: current.concurrencyVersion,
    },
    data: {
      previewRef: artifact.previewRef,
      previewedAt: artifact.previewedAt,
      previewedHash: artifact.definitionHash,
      previewedBy: input.operatorId,
      concurrencyVersion: { increment: 1 },
      updatedBy: input.operatorId,
    },
  });
  if (result.count === 0) {
    throw versionConflict();
  }
  return requireItem(tx, current.id);
}

/**
 * Issues a short-lived signed preview reference and records the previewed
 * definition hash. Editing the item clears the hash, so only the exact previewed
 * definition can satisfy publish.
 */
export async function previewCatalogItem(
  context: AppCatalogServiceContext,
  input: PreviewCatalogItemInput,
): Promise<CatalogPreview> {
  const preview = await context.prisma.$transaction(async (tx) => {
    const current = await requireItem(tx, input.itemId);
    assertNotRetired(current);
    const version = current.draftVersion ?? current.currentVersion;
    if (version < 1) {
      throw itemNotPublishable("The catalog item has no draft or published version to preview.");
    }
    const artifact = buildPreviewArtifact(context.previewSigningSecret, current, version);
    const next = await applyPreviewState(tx, current, input, artifact);
    await appendPlatformAuditEvent(tx, {
      actorOperatorId: input.operatorId,
      action: PLATFORM_AUDIT_ACTIONS.CATALOG_ITEM_PREVIEWED,
      entityType: "cms_catalog_item",
      entityId: current.id,
      before: toCatalogAuditSnapshot(toCatalogItem(current)),
      after: {
        ...toCatalogAuditSnapshot(toCatalogItem(next)),
        previewVersion: version,
        definitionHash: artifact.definitionHash,
      },
      requestId: input.requestId,
    });
    return artifact;
  });
  return {
    previewRef: preview.previewRef,
    expiresAt: preview.expiresAt.toISOString(),
    version: preview.version,
    definitionHash: preview.definitionHash,
  };
}

type LifecycleTransitionMap = Partial<Record<CatalogItemStatus, CatalogItemStatus | null>>;

const DEPRECATE_TRANSITIONS: LifecycleTransitionMap = {
  ACTIVE: "DEPRECATED",
  DEPRECATED: null,
};

const DISABLE_TRANSITIONS: LifecycleTransitionMap = {
  ACTIVE: "DISABLED",
  DEPRECATED: "DISABLED",
  DISABLED: null,
};

const RETIRE_TRANSITIONS: LifecycleTransitionMap = {
  DRAFT: "RETIRED",
  ACTIVE: "RETIRED",
  DEPRECATED: "RETIRED",
  DISABLED: "RETIRED",
  RETIRED: null,
};

const LIFECYCLE_TRANSITIONS: Record<CatalogLifecycleAction, LifecycleTransitionMap> = {
  deprecate: DEPRECATE_TRANSITIONS,
  disable: DISABLE_TRANSITIONS,
  retire: RETIRE_TRANSITIONS,
};

const LIFECYCLE_AUDIT_ACTIONS = {
  deprecate: PLATFORM_AUDIT_ACTIONS.CATALOG_ITEM_DEPRECATED,
  disable: PLATFORM_AUDIT_ACTIONS.CATALOG_ITEM_DISABLED,
  retire: PLATFORM_AUDIT_ACTIONS.CATALOG_ITEM_RETIRED,
} as const satisfies Record<CatalogLifecycleAction, string>;

const LIFECYCLE_LABELS = {
  deprecate: "deprecated",
  disable: "disabled",
  retire: "retired",
} as const satisfies Record<CatalogLifecycleAction, string>;

function resolveLifecycleStatus(
  action: CatalogLifecycleAction,
  status: CatalogItemStatus,
): CatalogItemStatus | null {
  const next = LIFECYCLE_TRANSITIONS[action][status];
  if (next === undefined) {
    throw itemNotPublishable(
      "The catalog item cannot be " + LIFECYCLE_LABELS[action] + " from its current status.",
    );
  }
  return next;
}

/**
 * Applies deprecate, disable or retire. Retired is terminal and the row is
 * never deleted (FR-004). Repeating a transition that already landed is a
 * no-op, so a retry cannot duplicate the audit row.
 */
export async function transitionCatalogItem(
  context: AppCatalogServiceContext,
  input: LifecycleCatalogItemInput,
): Promise<CatalogItem> {
  const updated = await context.prisma.$transaction(async (tx) => {
    const current = await requireItem(tx, input.itemId);
    const nextStatus = resolveLifecycleStatus(input.action, current.status);
    if (nextStatus === null) {
      return current;
    }
    const result = await tx.cmsCatalogItem.updateMany({
      where: {
        id: current.id,
        concurrencyVersion: current.concurrencyVersion,
        status: current.status,
      },
      data: {
        status: nextStatus,
        concurrencyVersion: { increment: 1 },
        updatedBy: input.operatorId,
        ...(nextStatus === "RETIRED" ? { draftVersion: null } : {}),
      },
    });
    if (result.count === 0) {
      throw versionConflict();
    }
    const next = await requireItem(tx, current.id);
    await appendPlatformAuditEvent(tx, {
      actorOperatorId: input.operatorId,
      action: LIFECYCLE_AUDIT_ACTIONS[input.action],
      entityType: "cms_catalog_item",
      entityId: current.id,
      before: toCatalogAuditSnapshot(toCatalogItem(current)),
      after: toCatalogAuditSnapshot(toCatalogItem(next)),
      requestId: input.requestId,
    });
    return next;
  });
  await context.cache.invalidate(updated.id);
  return toCatalogItem(updated);
}
