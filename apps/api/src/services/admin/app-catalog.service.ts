import { Prisma, type PrismaClient } from "@suite/db";
import {
  APP_MANIFESTS,
  PLATFORM_ERROR_CODE,
  isAppId,
  type AppManifest,
} from "@suite/core";
import {
  ConflictError,
  InternalServerError,
  ValidationError,
} from "@suite/core/errors";
import {
  appendPlatformAuditEvent,
  PLATFORM_AUDIT_ACTIONS,
} from "@suite/auth/platform";
import {
  APP_CATALOG_AVAILABILITIES,
  DEFAULT_APP_CATALOG_AVAILABILITY,
  type AppCatalogAvailability,
  type CatalogApp,
  type CatalogList,
  type UpdateAppCatalogBody,
} from "./app-catalog.contract.js";

const AVAILABILITY_SET: ReadonlySet<string> = new Set(
  APP_CATALOG_AVAILABILITIES
);

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

function isAppCatalogAvailability(
  value: string
): value is AppCatalogAvailability {
  return AVAILABILITY_SET.has(value);
}

function toAvailability(value: string): AppCatalogAvailability {
  if (isAppCatalogAvailability(value)) {
    return value;
  }
  throw new InternalServerError(
    "The catalog override row carries an unknown availability."
  );
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
  installedCount: number
): CatalogApp {
  return {
    appId: manifest.appId,
    name: manifest.name,
    title: manifest.title,
    description: manifest.description,
    // An explicit null override clears the manifest category; only a missing
    // override falls back to the manifest (FR-083).
    category:
      override === null ? (manifest.category ?? null) : override.category,
    availability:
      override === null
        ? DEFAULT_APP_CATALOG_AVAILABILITY
        : toAvailability(override.availability),
    sortOrder: override?.sortOrder ?? 0,
    installedCount,
    version: override?.version ?? null,
    updatedAt: override === null ? null : versionToIso(override.version),
  };
}

async function listOverrides(
  prisma: Prisma.TransactionClient
): Promise<OverrideStateRow[]> {
  return prisma.$queryRaw<OverrideStateRow[]>(Prisma.sql`
    SELECT ${OVERRIDE_PROJECTION}
    FROM platform."app_overrides"
  `);
}

interface InstalledCountRow {
  readonly appId: string;
  readonly installedCount: bigint;
}

async function countInstalledByApp(
  prisma: Prisma.TransactionClient
): Promise<Map<string, number>> {
  const rows = await prisma.$queryRaw<InstalledCountRow[]>(Prisma.sql`
    SELECT "appId", "installedCount"
    FROM platform."v_app_installation_counts"
  `);
  return new Map(rows.map((row) => [row.appId, Number(row.installedCount)]));
}

async function countInstalledForApp(
  prisma: Prisma.TransactionClient,
  appId: string
): Promise<number> {
  const rows = await prisma.$queryRaw<{ installedCount: bigint }[]>(
    Prisma.sql`
      SELECT "installedCount"
      FROM platform."v_app_installation_counts"
      WHERE "appId" = ${appId}
    `
  );
  return Number(rows[0]?.installedCount ?? 0n);
}

function buildCatalog(
  overrides: readonly OverrideStateRow[],
  installedCounts: ReadonlyMap<string, number>
): CatalogApp[] {
  const overrideByApp = new Map(
    overrides.map((override) => [override.appId, override])
  );

  // The registry is the source of truth (FR-082). An override row for an app
  // that is no longer registered is never displayed.
  return Object.values(APP_MANIFESTS)
    .map((manifest) =>
      toCatalogApp(
        manifest,
        overrideByApp.get(manifest.appId) ?? null,
        installedCounts.get(manifest.appId) ?? 0
      )
    )
    .sort(compareCatalogApps);
}

/**
 * Lists the compiled registry merged with stored operational overrides. The
 * registry decides which apps exist; the override only changes presentation
 * (FR-082, FR-083, FR-085).
 */
export async function getAppCatalog(
  prisma: PrismaClient
): Promise<CatalogList> {
  const [overrides, installedCounts] = await Promise.all([
    listOverrides(prisma),
    countInstalledByApp(prisma),
  ]);
  return { apps: buildCatalog(overrides, installedCounts) };
}

async function readOverrideForUpdate(
  tx: Prisma.TransactionClient,
  appId: string
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
  change: UpdateAppCatalogBody
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
  expectedVersion: string | null
): void {
  const observed = current?.version ?? null;
  if (expectedVersion === observed) {
    return;
  }
  throw new ConflictError(
    "The catalog override changed since it was observed. Reload the catalog and retry.",
    { code: PLATFORM_ERROR_CODE.VERSION_CONFLICT }
  );
}

async function updateExistingOverride(
  tx: Prisma.TransactionClient,
  input: UpdateCatalogOverrideInput,
  snapshot: CatalogOverrideSnapshot
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
      { code: PLATFORM_ERROR_CODE.VERSION_CONFLICT }
    );
  }
  return row;
}

async function insertOverride(
  tx: Prisma.TransactionClient,
  input: UpdateCatalogOverrideInput,
  snapshot: CatalogOverrideSnapshot
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
      { code: PLATFORM_ERROR_CODE.VERSION_CONFLICT }
    );
  }
  return row;
}

async function appendOverrideAudit(
  tx: Prisma.TransactionClient,
  input: UpdateCatalogOverrideInput,
  before: CatalogOverrideSnapshot | null,
  after: CatalogOverrideSnapshot
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
  input: UpdateCatalogOverrideInput
): Promise<CatalogApp> {
  if (!isAppId(input.appId)) {
    throw new ValidationError(
      "The application is not registered in the platform catalog.",
      [{ name: "appId", reason: `Unknown application: ${input.appId}` }],
      { code: PLATFORM_ERROR_CODE.UNKNOWN_APP }
    );
  }

  const manifest = APP_MANIFESTS[input.appId];
  if (manifest === undefined) {
    throw new InternalServerError(
      "The application registry resolved an unknown identifier."
    );
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
