import { withTenantContext, type Prisma } from "@suite/db";
import { logger } from "@suite/logger";
import {
  publishedDefinitionKey,
  readPublishedDefinitions,
} from "@suite/website-builder/services";
import { readTenantCatalogContext } from "../admin/app-catalog.service.js";
import {
  isCatalogItemVisibleToTenant,
  readCatalogFlagStates,
} from "../admin/catalog-targeting.js";
import type { CatalogItemStatus } from "../admin/app-catalog.contract.js";
import { catalogSectionDefinitionValidationSchema, type CatalogSection } from "./contract.js";

const MAX_SECTION_ROWS = 100;

interface CatalogRow {
  readonly id: string;
  readonly name: string;
  readonly slug: string;
  readonly category: string;
  readonly industries: string[];
  readonly previewRef: string | null;
  readonly flagKey: string | null;
  readonly targeting: unknown;
  readonly status: CatalogItemStatus;
  readonly currentVersion: number;
}

function toCatalogSection(row: CatalogRow, rawDefinition: unknown): CatalogSection | null {
  const definition = catalogSectionDefinitionValidationSchema.safeParse(rawDefinition);
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

function queryCatalogRows(
  tx: Prisma.TransactionClient,
  organizationId: string
): Promise<CatalogRow[]> {
  return tx.cmsCatalogItem.findMany({
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
      previewRef: true,
      flagKey: true,
      targeting: true,
      status: true,
      currentVersion: true,
    },
  });
}

/**
 * Lists only ACTIVE sections the tenant may see: global sections plus this
 * workspace's own rows, then resolved through the shared targeting resolver
 * against the tenant's own plan and industries (FR-007, FR-008, FR-022). The
 * definition comes from the immutable published version the item's currentVersion
 * names, so an unpublished edit of an active section is invisible until it is
 * published (FR-012). Malformed, flagged-off or untargeted rows never reach the
 * drawer, and an unresolvable flag fails closed.
 */
export async function listTenantCatalogSections(input: {
  readonly organizationId: string;
  readonly limit: number;
}): Promise<readonly CatalogSection[]> {
  const [tenant, catalog] = await Promise.all([
    readTenantCatalogContext(input.organizationId),
    withTenantContext(input.organizationId, async (tx) => {
      const rows = await queryCatalogRows(tx, input.organizationId);
      const definitions = await readPublishedDefinitions(tx, rows);
      return { rows, definitions };
    }),
  ]);
  const flagStates = await readCatalogFlagStates(catalog.rows, input.organizationId);
  const context = { ...tenant, flagStates };
  return catalog.rows
    .filter((row) => row.currentVersion > 0 && isCatalogItemVisibleToTenant(row, context))
    .map((row) => {
      const definition = catalog.definitions.get(
        publishedDefinitionKey(row.id, row.currentVersion)
      );
      return definition === undefined ? null : toCatalogSection(row, definition);
    })
    .filter((section): section is CatalogSection => section !== null)
    .slice(0, input.limit);
}
