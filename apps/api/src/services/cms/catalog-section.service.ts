import { z } from "zod";
import { prisma, withTenantContext, type Prisma } from "@suite/db";
import { logger } from "@suite/logger";
import { FeatureFlagClient } from "@suite/flags";
import { resolveCatalogTargeting } from "../admin/catalog-targeting.js";
import { catalogTargetingSchema, type CatalogItemStatus } from "../admin/app-catalog.contract.js";
import { catalogSectionDefinitionValidationSchema, type CatalogSection } from "./contract.js";

const MAX_SECTION_ROWS = 100;
const featureFlags = new FeatureFlagClient();

interface CatalogRow {
  readonly id: string;
  readonly name: string;
  readonly slug: string;
  readonly category: string;
  readonly industries: string[];
  readonly definition: unknown;
  readonly previewRef: string | null;
  readonly flagKey: string | null;
  readonly targeting: unknown;
  readonly status: CatalogItemStatus;
  readonly currentVersion: number;
}

const metadataSchema = z.object({ industries: z.array(z.string().min(1).max(64)).max(20) }).passthrough();

/** Reads the workspace industries from the tenant's own organisation metadata. */
async function readTenantIndustries(organizationId: string): Promise<readonly string[]> {
  const organization = await prisma.organization.findUnique({
    where: { id: organizationId },
    select: { metadata: true },
  });
  const parsed = metadataSchema.safeParse(organization?.metadata);
  return parsed.success ? parsed.data.industries : [];
}

async function readFlagStates(
  rows: readonly CatalogRow[],
  organizationId: string
): Promise<ReadonlyMap<string, boolean>> {
  const keys = [...new Set(rows.map((row) => row.flagKey).filter((key): key is string => key !== null))];
  const entries = await Promise.all(
    keys.map(async (key) => [key, await featureFlags.isEnabled(key, { organizationId })] as const)
  );
  return new Map(entries);
}

interface VisibilityContext {
  readonly organizationId: string;
  readonly industries: readonly string[];
  readonly flagStates: ReadonlyMap<string, boolean>;
}

function isVisibleToTenant(row: CatalogRow, context: VisibilityContext): boolean {
  const targeting = catalogTargetingSchema.safeParse(row.targeting);
  if (!targeting.success) {
    return false;
  }
  const flagEnabled = row.flagKey === null ? null : context.flagStates.get(row.flagKey) === true;
  const candidates = context.industries.length === 0 ? [null] : context.industries;
  return candidates.some((industry) =>
    resolveCatalogTargeting(
      { status: row.status, targeting: targeting.data, flagKey: row.flagKey },
      { organizationId: context.organizationId, plan: null, industry, flagEnabled }
    ).targeted
  );
}

function toCatalogSection(row: CatalogRow): CatalogSection | null {
  const definition = catalogSectionDefinitionValidationSchema.safeParse(row.definition);
  if (!definition.success) {
    logger.warn({ itemId: row.id, issues: definition.error.issues.slice(0, 3) }, "Skipping a catalog section with an invalid definition");
    return null;
  }
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    category: row.category,
    industries: row.industries,
    currentVersion: row.currentVersion,
    previewRef: row.previewRef,
    definition: definition.data,
  };
}

function queryCatalogRows(organizationId: string): Promise<CatalogRow[]> {
  return withTenantContext(organizationId, (tx: Prisma.TransactionClient) =>
    tx.cmsCatalogItem.findMany({
      where: {
        kind: "SECTION",
        status: "ACTIVE",
        OR: [
          { scope: "GLOBAL", organizationId: null },
          { scope: "TENANT", organizationId },
        ],
      },
      orderBy: [{ category: "asc" }, { name: "asc" }, { id: "asc" }],
      take: MAX_SECTION_ROWS,
      select: {
        id: true,
        name: true,
        slug: true,
        category: true,
        industries: true,
        definition: true,
        previewRef: true,
        flagKey: true,
        targeting: true,
        status: true,
        currentVersion: true,
      },
    })
  );
}

/**
 * Lists only ACTIVE sections the tenant may see: global sections plus this
 * workspace's own rows, then resolved through the shared targeting resolver
 * (FR-008, FR-022). Malformed, flagged-off or untargeted rows never reach the
 * drawer, and an unresolvable flag fails closed.
 */
export async function listTenantCatalogSections(input: {
  readonly organizationId: string;
  readonly limit: number;
}): Promise<readonly CatalogSection[]> {
  const [industries, rows] = await Promise.all([
    readTenantIndustries(input.organizationId),
    queryCatalogRows(input.organizationId),
  ]);
  const flagStates = await readFlagStates(rows, input.organizationId);
  const context: VisibilityContext = { organizationId: input.organizationId, industries, flagStates };
  return rows
    .filter((row) => row.currentVersion > 0 && isVisibleToTenant(row, context))
    .map(toCatalogSection)
    .filter((section): section is CatalogSection => section !== null)
    .slice(0, input.limit);
}
