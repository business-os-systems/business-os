import { prisma } from "../../../packages/db/src/index.js";
import { getTenantDatabaseUrl } from "../../../packages/db/src/env.js";
import { WEBSITE_BUILDER_MANIFEST } from "../../../packages/modules/website-builder/src/manifest.js";

/**
 * Deterministic tenant fixture for the release-gate Playwright job (OP-12).
 *
 * Only the scratch database named by TENANT_DATABASE_URL is touched. The
 * fixture is idempotent so a rerun never depends on leftover rows.
 */

export const RELEASE_GATE_ORGANIZATION_ID = "org_release_gates";
export const RELEASE_GATE_USER_ID = "usr_release_gates";

async function seed(): Promise<void> {
  getTenantDatabaseUrl();
  await prisma.organization.upsert({
    where: { id: RELEASE_GATE_ORGANIZATION_ID },
    update: { name: "Northwind Studio Test Tenant", status: "ACTIVE" },
    create: {
      id: RELEASE_GATE_ORGANIZATION_ID,
      name: "Northwind Studio Test Tenant",
      slug: "release-gates-northwind",
      status: "ACTIVE",
    },
  });
  await prisma.user.upsert({
    where: { id: RELEASE_GATE_USER_ID },
    update: { emailVerified: true },
    create: {
      id: RELEASE_GATE_USER_ID,
      email: "release-gates@example.test",
      name: "Release Gates",
      emailVerified: true,
    },
  });
  await prisma.installedApp.upsert({
    where: {
      organizationId_appId: {
        organizationId: RELEASE_GATE_ORGANIZATION_ID,
        appId: WEBSITE_BUILDER_MANIFEST.appId,
      },
    },
    update: { isEnabled: true },
    create: {
      organizationId: RELEASE_GATE_ORGANIZATION_ID,
      appId: WEBSITE_BUILDER_MANIFEST.appId,
      isEnabled: true,
      settings: { title: "Website Builder", href: "/sites", iconName: "sites", permission: "cms:sites:read" },
    },
  });
  process.stdout.write("Release-gate tenant fixture is ready.\n");
}

seed()
  .catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write("Release-gate fixture provisioning failed: " + message + "\n");
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
