import { prisma } from "./client.js";

interface PermissionDef {
  appId: string;
  action: string;
  description: string;
}

const CORE_PERMISSIONS: PermissionDef[] = [
  // Universal Platform Superuser Wildcard
  {
    appId: "core",
    action: "*",
    description: "Universal platform administrator access across all domains and modular apps",
  },

  // Core Platform & Identity
  { appId: "core", action: "core:organization:read", description: "View organization details and settings" },
  { appId: "core", action: "core:organization:update", description: "Update organization settings" },
  { appId: "core", action: "core:branches:read", description: "View physical branches and configurations" },
  { appId: "core", action: "core:branches:write", description: "Create or modify branches" },
  { appId: "core", action: "core:users:read", description: "View team members and roles" },
  { appId: "core", action: "core:users:manage", description: "Invite, update, and remove members" },
  { appId: "core", action: "core:roles:read", description: "View RBAC roles and permissions" },
  { appId: "core", action: "core:roles:manage", description: "Create and update custom roles" },
  { appId: "core", action: "core:audit:read", description: "View compliance and audit log trails" },
  { appId: "core", action: "core:apps:manage", description: "Install and activate modular apps" },

  // Modular Apps Marketplace & Lifecycle
  { appId: "apps", action: "apps:read", description: "View available modular apps and extensions" },
  { appId: "apps", action: "apps:install", description: "Install modular apps to workspace" },
  { appId: "apps", action: "apps:manage", description: "Configure installed modular apps" },
  { appId: "apps", action: "apps:uninstall", description: "Uninstall modular apps from workspace" },

  // Shared Workspace Capability: Media Library
  { appId: "media", action: "media:read", description: "Browse and select the workspace media library" },
  { appId: "media", action: "media:upload", description: "Request and finalise media uploads" },
  { appId: "media", action: "media:delete", description: "Delete an unused media asset" },

  // Modular App: Website Builder (App 01)
  { appId: "cms", action: "cms:sites:read", description: "View published and draft website sites" },
  { appId: "cms", action: "cms:sites:write", description: "Create and modify websites and custom domains" },
  { appId: "cms", action: "cms:pages:read", description: "View pages and draft visual canvas revisions" },
  { appId: "cms", action: "cms:pages:write", description: "Edit canvas pages, layout blocks, and SEO tags" },
  { appId: "cms", action: "cms:publish", description: "Publish website revisions to edge live production" },

  // Subscription & Billing Governance
  { appId: "billing", action: "billing:read", description: "View invoices, payment methods, and subscription plans" },
  { appId: "billing", action: "billing:manage", description: "Update billing settings, payment methods, and plans" },
];

interface RoleDef {
  slug: string;
  name: string;
  description: string;
  permissionActions: string[];
}

const MASTER_ROLES: RoleDef[] = [
  {
    slug: "tenant-owner",
    name: "Organization Owner",
    description: "Full administrative authority across all organization branches, capability permissions, and installed apps",
    permissionActions: ["*", ...CORE_PERMISSIONS.map((p) => p.action)],
  },
];

export async function seed() {
  console.log("🌱 Starting Platform Core database seed...");

  // Purge any deprecated unbuilt app permissions from database
  await prisma.rolePermission.deleteMany({
    where: {
      permission: {
        appId: { in: ["lodging_pms", "restaurant_pos", "stock_inventory"] },
      },
    },
  });
  await prisma.permission.deleteMany({
    where: {
      appId: { in: ["lodging_pms", "restaurant_pos", "stock_inventory"] },
    },
  });

  // 1. Seed Core Permissions
  console.log("  • Seeding permissions registry...");
  const permissionMap = new Map<string, string>();
  for (const perm of CORE_PERMISSIONS) {
    const created = await prisma.permission.upsert({
      where: { action: perm.action },
      update: { appId: perm.appId, description: perm.description },
      create: {
        appId: perm.appId,
        action: perm.action,
        description: perm.description,
      },
    });
    permissionMap.set(perm.action, created.id);
  }

  // 2. Seed Master Roles (Global system roles: organizationId = null, isSystem = true)
  console.log("  • Seeding master system roles and permissions...");
  const legacyRoles = await prisma.role.findMany({
    where: {
      organizationId: null,
      slug: { notIn: ["tenant-owner", "owner"] },
    },
    select: { id: true },
  });
  if (legacyRoles.length > 0) {
    const legacyRoleIds = legacyRoles.map((r) => r.id);
    await prisma.userBranchRole.deleteMany({
      where: { roleId: { in: legacyRoleIds } },
    });
    await prisma.rolePermission.deleteMany({
      where: { roleId: { in: legacyRoleIds } },
    });
    await prisma.organizationInvitation.deleteMany({
      where: { roleId: { in: legacyRoleIds } },
    });
    await prisma.role.deleteMany({
      where: { id: { in: legacyRoleIds } },
    });
  }

  for (const roleDef of MASTER_ROLES) {
    let role = await prisma.role.findFirst({
      where: {
        organizationId: null,
        slug: roleDef.slug,
      },
    });

    if (!role) {
      role = await prisma.role.create({
        data: {
          organizationId: null,
          slug: roleDef.slug,
          name: roleDef.name,
          description: roleDef.description,
          isSystem: true,
        },
      });
    } else {
      role = await prisma.role.update({
        where: { id: role.id },
        data: {
          name: roleDef.name,
          description: roleDef.description,
          isSystem: true,
        },
      });
    }

    // Link RolePermissions
    for (const action of roleDef.permissionActions) {
      const permissionId = permissionMap.get(action);
      if (permissionId) {
        await prisma.rolePermission.upsert({
          where: {
            roleId_permissionId: {
              roleId: role.id,
              permissionId,
            },
          },
          update: {},
          create: {
            roleId: role.id,
            permissionId,
          },
        });
      }
    }
  }

  console.log("✅ Platform Core database seeded successfully!");
}

// Direct execution entrypoint
if (process.argv[1]?.endsWith("seed.ts") || process.argv[1]?.endsWith("seed.js")) {
  seed()
    .then(async () => {
      await prisma.$disconnect();
    })
    .catch(async (e) => {
      console.error("❌ Seed failed:", e);
      await prisma.$disconnect();
      process.exit(1);
    });
}
