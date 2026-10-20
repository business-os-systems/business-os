import { prisma } from "./client.js";
import { APP_MANIFESTS, getAppManifest } from "@suite/core";

export async function backfillAppMetadata() {
  console.log("🔄 Starting App Manifest Metadata & Owner Wildcard Capability Backfill...");

  // 1. Ensure wildcard permission exists in PostgreSQL
  console.log("  • Ensuring wildcard (*) permission exists in PostgreSQL...");
  const wildcardPermission = await prisma.permission.upsert({
    where: { action: "*" },
    update: {
      appId: "core",
      description: "Universal platform administrator access across all domains and modular apps",
    },
    create: {
      appId: "core",
      action: "*",
      description: "Universal platform administrator access across all domains and modular apps",
    },
  });
  console.log(`    ✓ Wildcard permission verified (ID: ${wildcardPermission.id})`);

  // 2. Assign wildcard permission to ALL system and tenant Owner roles
  console.log("  • Assigning wildcard (*) permission to all Owner roles in role_permissions...");
  const ownerRoles = await prisma.role.findMany({
    where: {
      OR: [
        { slug: { in: ["owner", "tenant-owner"] } },
        { name: "Organization Owner" },
      ],
    },
  });

  let linkedOwnerCount = 0;
  for (const role of ownerRoles) {
    await prisma.rolePermission.upsert({
      where: {
        roleId_permissionId: {
          roleId: role.id,
          permissionId: wildcardPermission.id,
        },
      },
      update: {},
      create: {
        roleId: role.id,
        permissionId: wildcardPermission.id,
      },
    });
    linkedOwnerCount++;
  }
  console.log(`    ✓ Linked wildcard (*) to ${linkedOwnerCount} owner role(s) in PostgreSQL`);

  // 3. Backfill InstalledApp records with canonical manifest metadata
  console.log("  • Inspecting installed_apps records across all organizations...");
  const installedApps = await prisma.installedApp.findMany();
  let updatedAppCount = 0;

  for (const app of installedApps) {
    const existingSettings = (app.settings as Record<string, unknown>) || {};
    const manifest = getAppManifest(app.appId) || APP_MANIFESTS["website-builder"];

    // Check if backfill is needed
    const needsBackfill =
      !existingSettings.title ||
      !existingSettings.href ||
      !existingSettings.name ||
      !existingSettings.permission ||
      existingSettings.title === app.appId;

    if (needsBackfill && manifest) {
      const resolvedTitle =
        existingSettings.title && existingSettings.title !== app.appId
          ? (existingSettings.title as string)
          : manifest.title;
      const resolvedHref =
        (existingSettings.href as string) || manifest.href;

      const mergedSettings = {
        ...existingSettings,
        code: (existingSettings.code as string) || manifest.code,
        name: (existingSettings.name as string) || manifest.name,
        iconName: (existingSettings.iconName as string) || manifest.iconName,
        description: (existingSettings.description as string) || manifest.description,
        permission: (existingSettings.permission as string) || manifest.permission,
        title: resolvedTitle,
        href: resolvedHref,
      };


      await prisma.installedApp.update({
        where: { id: app.id },
        data: {
          settings: mergedSettings,
        },
      });
      updatedAppCount++;
      console.log(`    ✓ Backfilled app: ${app.appId} for Org: ${app.organizationId} -> "${manifest.title}"`);
    }
  }

  console.log(`✨ Successfully backfilled ${updatedAppCount} of ${installedApps.length} installed app record(s).`);
  return {
    wildcardPermissionId: wildcardPermission.id,
    linkedOwnerCount,
    updatedAppCount,
    totalInstalledApps: installedApps.length,
  };
}

// Allow direct CLI execution
if (process.argv[1]?.endsWith("backfill-app-metadata.ts") || process.argv[1]?.endsWith("backfill-app-metadata.js")) {
  backfillAppMetadata()
    .then(() => prisma.$disconnect())
    .catch((err) => {
      console.error("Backfill failed:", err);
      prisma.$disconnect();
      process.exit(1);
    });
}
