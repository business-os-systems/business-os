import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, expect, it } from "vitest";
import { Prisma, createPlatformPrismaClient, type PrismaClient } from "@suite/db";
import { loadPlatformTestEnv } from "../../helpers/platform-env.js";

loadPlatformTestEnv();

const tenantDatabaseUrl = process.env.TENANT_DATABASE_URL;
const ownerDatabaseUrl = process.env.DIRECT_URL;
const enabled = Boolean(tenantDatabaseUrl && ownerDatabaseUrl);

interface CoreTenantFixture {
  readonly organizationId: string;
  readonly branchId: string;
  readonly userId: string;
  readonly userOrganizationId: string;
}

interface CmsTenantFixture {
  readonly siteId: string;
  readonly pageId: string;
  readonly domainId: string;
}

interface CatalogItems {
  readonly globalItemId: string;
  readonly globalVersionId: string;
  readonly tenantItemId: string;
  readonly otherItemId: string;
}

interface PresetThemes {
  readonly globalThemeId: string;
  readonly tenantThemeId: string;
  readonly otherThemeId: string;
}

interface CatalogFixture extends CatalogItems, PresetThemes {}

interface TenantFixture extends CoreTenantFixture, CmsTenantFixture {}

interface FlagFixture {
  readonly key: string;
  readonly otherOrganizationId: string;
}

async function createCoreTenant(owner: PrismaClient, suffix: string): Promise<CoreTenantFixture> {
  const organization = await owner.organization.create({
    data: { name: "RLS tenant " + suffix, slug: "rls-tenant-" + suffix },
  });
  const branch = await owner.branch.create({
    data: {
      organizationId: organization.id,
      name: "RLS branch " + suffix,
      code: "RLS-" + suffix.toUpperCase(),
      type: "HOSPITALITY_LODGING",
    },
  });
  const user = await owner.user.create({
    data: {
      email: "rls-" + suffix + "@example.test",
      name: "RLS user " + suffix,
    },
  });
  const userOrganization = await owner.userOrganization.create({
    data: { userId: user.id, organizationId: organization.id },
  });
  return {
    organizationId: organization.id,
    branchId: branch.id,
    userId: user.id,
    userOrganizationId: userOrganization.id,
  };
}

async function createCmsTenant(
  owner: PrismaClient,
  organizationId: string,
  suffix: string,
): Promise<CmsTenantFixture> {
  const site = await owner.cmsSite.create({
    data: {
      organizationId,
      title: "RLS site " + suffix,
      slug: "rls-site-" + suffix,
    },
  });
  const page = await owner.cmsPage.create({
    data: {
      organizationId,
      siteId: site.id,
      title: "RLS page " + suffix,
      slug: "/home",
    },
  });
  const domain = await owner.cmsDomain.create({
    data: {
      organizationId,
      siteId: site.id,
      hostname: "rls-" + suffix + ".example.test",
      verificationToken: "verify-" + suffix,
    },
  });
  return { siteId: site.id, pageId: page.id, domainId: domain.id };
}

function catalogDefinition(suffix: string) {
  return { schemaVersion: "2026-03", block: { id: "blk_" + suffix, type: "hero" } };
}

function catalogItemData(
  scope: "GLOBAL" | "TENANT",
  organizationId: string | null,
  label: string,
  suffix: string,
) {
  return {
    kind: "SECTION" as const,
    scope,
    organizationId,
    name: "RLS " + label + " section " + suffix,
    slug: "rls-" + label + "-" + suffix,
    category: "hero",
    definition: catalogDefinition(suffix),
    createdBy: "rls-test",
    updatedBy: "rls-test",
  };
}

async function createCatalogItems(
  owner: PrismaClient,
  tenantA: TenantFixture,
  tenantB: TenantFixture,
  suffix: string,
): Promise<CatalogItems> {
  const globalItem = await owner.cmsCatalogItem.create({
    data: catalogItemData("GLOBAL", null, "global", suffix),
  });
  const globalVersion = await owner.cmsCatalogItemVersion.create({
    data: {
      itemId: globalItem.id,
      version: 1,
      definition: catalogDefinition(suffix),
      publishedAt: new Date(),
      publishedBy: "rls-test",
      createdBy: "rls-test",
    },
  });
  const tenantItem = await owner.cmsCatalogItem.create({
    data: catalogItemData("TENANT", tenantA.organizationId, "tenant", suffix),
  });
  const otherItem = await owner.cmsCatalogItem.create({
    data: catalogItemData("TENANT", tenantB.organizationId, "other", suffix),
  });
  return {
    globalItemId: globalItem.id,
    globalVersionId: globalVersion.id,
    tenantItemId: tenantItem.id,
    otherItemId: otherItem.id,
  };
}

async function createPresetThemes(
  owner: PrismaClient,
  tenantA: TenantFixture,
  tenantB: TenantFixture,
  suffix: string,
): Promise<PresetThemes> {
  const globalTheme = await owner.cmsTheme.create({
    data: { name: "RLS global theme " + suffix, code: "rls-global-" + suffix, tokens: {} },
  });
  const tenantTheme = await owner.cmsTheme.create({
    data: {
      organizationId: tenantA.organizationId,
      name: "RLS tenant theme " + suffix,
      code: "rls-tenant-" + suffix,
      tokens: {},
    },
  });
  const otherTheme = await owner.cmsTheme.create({
    data: {
      organizationId: tenantB.organizationId,
      name: "RLS other tenant theme " + suffix,
      code: "rls-other-" + suffix,
      tokens: {},
    },
  });
  return {
    globalThemeId: globalTheme.id,
    tenantThemeId: tenantTheme.id,
    otherThemeId: otherTheme.id,
  };
}

async function createCatalogFixture(
  owner: PrismaClient,
  tenantA: TenantFixture,
  tenantB: TenantFixture,
  suffix: string,
): Promise<CatalogFixture> {
  const items = await createCatalogItems(owner, tenantA, tenantB, suffix);
  const themes = await createPresetThemes(owner, tenantA, tenantB, suffix);
  return { ...items, ...themes };
}

async function createTenantFixture(owner: PrismaClient, suffix: string): Promise<TenantFixture> {
  const core = await createCoreTenant(owner, suffix);
  const cms = await createCmsTenant(owner, core.organizationId, suffix);
  return { ...core, ...cms };
}

async function createFlagFixture(
  owner: PrismaClient,
  tenantA: TenantFixture,
  tenantB: TenantFixture,
  suffix: string,
): Promise<FlagFixture> {
  const key = "rls-projection-" + suffix;
  const flag = await owner.featureFlag.create({
    data: {
      key,
      name: "RLS projection flag",
      environment: "development",
      isEnabled: true,
      defaultEnabled: false,
      owner: "platform-engineering",
      expiresAt: new Date(Date.now() + 86_400_000),
      removalTicket: "#315",
    },
  });
  await owner.featureFlagRule.createMany({
    data: [
      {
        flagId: flag.id,
        ruleType: "ENVIRONMENT",
        targetId: "development",
        enabled: true,
        priority: 10,
      },
      {
        flagId: flag.id,
        ruleType: "ORGANIZATION",
        targetId: tenantA.organizationId,
        enabled: false,
        priority: 5,
      },
      {
        flagId: flag.id,
        ruleType: "ORGANIZATION",
        targetId: tenantB.organizationId,
        enabled: true,
        priority: 5,
      },
    ],
  });
  return { key, otherOrganizationId: tenantB.organizationId };
}

let tenantPrisma: PrismaClient;
let ownerPrisma: PrismaClient;
let tenantA: TenantFixture;
let tenantB: TenantFixture;
let flag: FlagFixture;
let catalog: CatalogFixture;

beforeAll(async () => {
  if (tenantDatabaseUrl === undefined || ownerDatabaseUrl === undefined) {
    throw new Error("Tenant and owner database URLs are required");
  }
  tenantPrisma = createPlatformPrismaClient({ databaseUrl: tenantDatabaseUrl });
  ownerPrisma = createPlatformPrismaClient({ databaseUrl: ownerDatabaseUrl });

  const suffix = randomUUID().slice(0, 12);
  tenantA = await createTenantFixture(ownerPrisma, "a-" + suffix);
  tenantB = await createTenantFixture(ownerPrisma, "b-" + suffix);
  flag = await createFlagFixture(ownerPrisma, tenantA, tenantB, suffix);
  catalog = await createCatalogFixture(ownerPrisma, tenantA, tenantB, suffix);
});

afterAll(async () => {
  await tenantPrisma.$disconnect();
  await ownerPrisma.featureFlag.deleteMany({ where: { key: flag.key } });
  await ownerPrisma.cmsCatalogItemVersion.deleteMany({
    where: { id: catalog.globalVersionId },
  });
  await ownerPrisma.cmsCatalogItem.deleteMany({
    where: {
      id: {
        in: [
          catalog.globalItemId,
          catalog.tenantItemId,
          catalog.otherItemId,
        ],
      },
    },
  });
  await ownerPrisma.cmsTheme.deleteMany({
    where: {
      id: { in: [catalog.globalThemeId, catalog.tenantThemeId, catalog.otherThemeId] },
    },
  });
  await ownerPrisma.cmsSite.deleteMany({
    where: {
      organizationId: { in: [tenantA.organizationId, tenantB.organizationId] },
    },
  });
  await ownerPrisma.organization.deleteMany({
    where: {
      id: { in: [tenantA.organizationId, tenantB.organizationId] },
    },
  });
  await ownerPrisma.user.deleteMany({
    where: { id: { in: [tenantA.userId, tenantB.userId] } },
  });
  await ownerPrisma.$disconnect();
});

async function withTenantContext<T>(
  organizationId: string,
  action: (tx: Prisma.TransactionClient) => Promise<T>,
): Promise<T> {
  return tenantPrisma.$transaction(async (tx) => {
    await tx.$queryRawUnsafe(
      "SELECT set_config($1, $2, true)",
      "app.current_organization_id",
      organizationId,
    );
    return action(tx);
  });
}

async function expectPermissionDenied(sql: string): Promise<void> {
  try {
    await tenantPrisma.$queryRawUnsafe(sql);
    throw new Error("The tenant identity unexpectedly read a protected table");
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    expect(message).toMatch(/42501|permission denied/i);
  }
}

it.skipIf(!enabled)("denies the tenant identity access to platform.operators", async () => {
  await expectPermissionDenied('SELECT "id" FROM "platform"."operators" LIMIT 1');
});

it.skipIf(!enabled)("denies the tenant identity access to platform.audit_events", async () => {
  await expectPermissionDenied('SELECT "id" FROM "platform"."audit_events" LIMIT 1');
});

it.skipIf(!enabled)("denies the tenant identity access to system_feature_flags", async () => {
  await expectPermissionDenied('SELECT "id" FROM "public"."system_feature_flags" LIMIT 1');
});

it.skipIf(!enabled)("denies the tenant identity access to system_feature_flag_rules", async () => {
  await expectPermissionDenied('SELECT "id" FROM "public"."system_feature_flag_rules" LIMIT 1');
});

it.skipIf(!enabled)("denies the tenant identity access to the flag audit log", async () => {
  await expectPermissionDenied(
    'SELECT "id" FROM "public"."system_feature_flag_audit_logs" LIMIT 1',
  );
});

it.skipIf(!enabled)("reports no USAGE privilege on the platform schema", async () => {
  const rows = await tenantPrisma.$queryRawUnsafe<{ allowed: boolean }[]>(
    "SELECT has_schema_privilege(current_user, 'platform', 'USAGE') AS allowed",
  );

  expect(rows[0]?.allowed).toBe(false);
});

it.skipIf(!enabled)("fails closed when app.current_organization_id is unset", async () => {
  const rows = await tenantPrisma.$queryRawUnsafe<{ count: bigint }[]>(
    'SELECT count(*) FROM "branches"',
  );

  expect(rows[0]?.count).toBe(0n);
});

it.skipIf(!enabled)("only exposes the current tenant's branches", async () => {
  const own = await withTenantContext(tenantA.organizationId, (tx) =>
    tx.$queryRawUnsafe<{ id: string }[]>(
      'SELECT "id" FROM "branches" WHERE "id" = $1',
      tenantA.branchId,
    ),
  );
  const other = await withTenantContext(tenantA.organizationId, (tx) =>
    tx.$queryRawUnsafe<{ id: string }[]>(
      'SELECT "id" FROM "branches" WHERE "id" = $1',
      tenantB.branchId,
    ),
  );

  expect(own.map((row) => row.id)).toEqual([tenantA.branchId]);
  expect(other).toHaveLength(0);
});

it.skipIf(!enabled)("only exposes the current tenant's memberships", async () => {
  const own = await withTenantContext(tenantA.organizationId, (tx) =>
    tx.$queryRawUnsafe<{ id: string }[]>(
      'SELECT "id" FROM "user_organizations" WHERE "id" = $1',
      tenantA.userOrganizationId,
    ),
  );
  const other = await withTenantContext(tenantA.organizationId, (tx) =>
    tx.$queryRawUnsafe<{ id: string }[]>(
      'SELECT "id" FROM "user_organizations" WHERE "id" = $1',
      tenantB.userOrganizationId,
    ),
  );

  expect(own.map((row) => row.id)).toEqual([tenantA.userOrganizationId]);
  expect(other).toHaveLength(0);
});

it.skipIf(!enabled)("only exposes the current tenant's CMS rows", async () => {
  const result = await withTenantContext(tenantA.organizationId, async (tx) => {
    const sites = await tx.$queryRawUnsafe<{ id: string }[]>(
      'SELECT "id" FROM "cms"."cms_sites" WHERE "id" = ANY($1::text[])',
      [tenantA.siteId, tenantB.siteId],
    );
    const pages = await tx.$queryRawUnsafe<{ id: string }[]>(
      'SELECT "id" FROM "cms"."cms_pages" WHERE "id" = ANY($1::text[])',
      [tenantA.pageId, tenantB.pageId],
    );
    const domains = await tx.$queryRawUnsafe<{ id: string }[]>(
      'SELECT "id" FROM "cms"."cms_domains" WHERE "id" = ANY($1::text[])',
      [tenantA.domainId, tenantB.domainId],
    );
    return { sites, pages, domains };
  });

  expect(result.sites.map((row) => row.id)).toEqual([tenantA.siteId]);
  expect(result.pages.map((row) => row.id)).toEqual([tenantA.pageId]);
  expect(result.domains.map((row) => row.id)).toEqual([tenantA.domainId]);
});

it.skipIf(!enabled)(
  "only exposes global and current-tenant catalog rows, never another tenant's",
  async () => {
    const result = await withTenantContext(tenantA.organizationId, async (tx) => {
      const items = await tx.$queryRawUnsafe<{ id: string }[]>(
        'SELECT "id" FROM cms."cms_catalog_items" WHERE "id" = ANY($1::text[])',
        [catalog.globalItemId, catalog.tenantItemId, catalog.otherItemId],
      );
      const versions = await tx.$queryRawUnsafe<{ id: string }[]>(
        'SELECT "id" FROM cms."cms_catalog_item_versions" WHERE "id" = $1',
        catalog.globalVersionId,
      );
      return { items, versions };
    });

    expect(new Set(result.items.map((row) => row.id))).toEqual(
      new Set([catalog.globalItemId, catalog.tenantItemId]),
    );
    expect(result.versions.map((row) => row.id)).toEqual([catalog.globalVersionId]);
  },
);

it.skipIf(!enabled)("refuses a tenant write to the platform-owned catalog", async () => {
  await expect(
    withTenantContext(tenantA.organizationId, (tx) =>
      tx.$executeRawUnsafe(
        'INSERT INTO cms."cms_catalog_items" ("id", "kind", "scope", "organizationId", "name", "slug", "category", "definition", "createdBy", "updatedBy") VALUES ($1, $2::cms."CmsCatalogKind", $3::cms."CmsCatalogScope", $4, $5, $6, $7, $8::jsonb, $9, $10)',
        randomUUID(),
        "SECTION",
        "TENANT",
        tenantA.organizationId,
        "Tenant written catalog",
        "tenant-written",
        "hero",
        "{}",
        "rls-test",
        "rls-test",
      ),
    ),
  ).rejects.toThrow(/42501|permission denied/i);
});

it.skipIf(!enabled)("reads global themes and own themes but not another tenant's", async () => {
  const rows = await withTenantContext(tenantA.organizationId, (tx) =>
    tx.$queryRawUnsafe<{ id: string }[]>(
      'SELECT "id" FROM cms."cms_themes" WHERE "id" = ANY($1::text[])',
      [catalog.globalThemeId, catalog.tenantThemeId, catalog.otherThemeId],
    ),
  );

  expect(new Set(rows.map((row) => row.id))).toEqual(
    new Set([catalog.globalThemeId, catalog.tenantThemeId]),
  );
});

it.skipIf(!enabled)("refuses a cross-tenant theme insert", async () => {
  await expect(
    withTenantContext(tenantA.organizationId, (tx) =>
      tx.$executeRawUnsafe(
        'INSERT INTO cms."cms_themes" ("id", "organizationId", "name", "code", "tokens", "createdAt", "updatedAt") VALUES ($1, $2, $3, $4, $5::jsonb, NOW(), NOW())',
        randomUUID(),
        tenantB.organizationId,
        "Cross tenant theme",
        "cross-tenant-theme-" + randomUUID().slice(0, 8),
        "{}",
      ),
    ),
  ).rejects.toThrow(/row-level security|42501/i);
});

it.skipIf(!enabled)("refuses a cross-tenant branch insert", async () => {
  await expect(
    withTenantContext(tenantA.organizationId, (tx) =>
      tx.$executeRawUnsafe(
        'INSERT INTO "branches" ("id", "organizationId", "name", "code", "type", "updatedAt") VALUES ($1, $2, $3, $4, $5, NOW())',
        randomUUID(),
        tenantB.organizationId,
        "Cross tenant",
        "CROSS-TENANT",
        "HOSPITALITY_LODGING",
      ),
    ),
  ).rejects.toThrow(/row-level security|42501/i);
});

it.skipIf(!enabled)(
  "exposes the tenant feature-flag projection and filters foreign org rules",
  async () => {
    const rows = await withTenantContext(tenantA.organizationId, (tx) =>
      tx.$queryRawUnsafe<{ key: string; isEnabled: boolean; rules: { targetId: string }[] }[]>(
        'SELECT "key", "isEnabled", "rules" FROM "public"."v_tenant_feature_flags" WHERE "key" = $1',
        flag.key,
      ),
    );

    expect(rows).toHaveLength(1);
    expect(rows[0]?.isEnabled).toBe(true);
    const targetIds = rows[0]?.rules.map((rule) => rule.targetId) ?? [];
    expect(targetIds).toContain(tenantA.organizationId);
    expect(targetIds).toContain("development");
    expect(targetIds).not.toContain(tenantB.organizationId);
  },
);
