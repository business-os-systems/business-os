import { prisma } from "./client.js";

interface PermissionDef {
  appId: string;
  action: string;
  description: string;
}

const CORE_PERMISSIONS: PermissionDef[] = [
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

  // Modular App: Website Builder (App 01)
  { appId: "cms", action: "cms:sites:read", description: "View published and draft website sites" },
  { appId: "cms", action: "cms:sites:write", description: "Create and modify websites and custom domains" },
  { appId: "cms", action: "cms:pages:read", description: "View pages and draft visual canvas revisions" },
  { appId: "cms", action: "cms:pages:write", description: "Edit canvas pages, layout blocks, and SEO tags" },
  { appId: "cms", action: "cms:publish", description: "Publish website revisions to edge live production" },
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
    permissionActions: CORE_PERMISSIONS.map((p) => p.action),
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
  // Purge any deprecated legacy global system roles (retaining strictly Owner)
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

  const roleMap = new Map<string, string>();
  for (const roleDef of MASTER_ROLES) {
    // Unique constraint on Role is (organizationId, slug)
    // Find existing role first or create
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
    roleMap.set(roleDef.slug, role.id);

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

  // 3. Seed Default System Admin Organization (org_system_master)
  console.log("  • Seeding System Master platform organization...");
  await prisma.organization.upsert({
    where: { id: "org_system_master" },
    update: {
      name: "Business OS Master Platform",
      slug: "system-master",
      currency: "USD",
      country: "US",
      jurisdiction: "GLOBAL_SYSTEM",
      status: "ACTIVE",
    },
    create: {
      id: "org_system_master",
      name: "Business OS Master Platform",
      slug: "system-master",
      currency: "USD",
      country: "US",
      jurisdiction: "GLOBAL_SYSTEM",
      status: "ACTIVE",
      themeConfig: { brand: "Business OS Master Control" },
      metadata: { isPlatformMaster: true },
    },
  });

  // 4. Seed Default Demo Enterprise Tenant (org_riverview_hospitality)
  console.log("  • Seeding Riverview Hospitality Group tenant...");
  const addressRiverview = await prisma.address.upsert({
    where: { id: "addr_riverview_manali" },
    update: {
      streetAddress: "Club House Road, Old Manali",
      landmark: "Near Hadimba Temple",
      city: "Manali",
      state: "Himachal Pradesh",
      postalCode: "175131",
      country: "IN",
      latitude: 32.2471,
      longitude: 77.1887,
    },
    create: {
      id: "addr_riverview_manali",
      streetAddress: "Club House Road, Old Manali",
      landmark: "Near Hadimba Temple",
      city: "Manali",
      state: "Himachal Pradesh",
      postalCode: "175131",
      country: "IN",
      latitude: 32.2471,
      longitude: 77.1887,
    },
  });

  const tenantOrg = await prisma.organization.upsert({
    where: { id: "org_riverview_hospitality" },
    update: {
      name: "Riverview Hospitality Group",
      slug: "riverview-hospitality",
      customDomain: "app.riverviewstay.com",
      currency: "INR",
      country: "IN",
      jurisdiction: "IN_DEFAULT",
      status: "ACTIVE",
      registeredAddressId: addressRiverview.id,
      themeConfig: {
        primaryColor: "#1e3a8a",
        accentColor: "#0ea5e9",
        fontHeading: "Inter",
        radius: "0.5rem",
      },
    },
    create: {
      id: "org_riverview_hospitality",
      name: "Riverview Hospitality Group",
      slug: "riverview-hospitality",
      customDomain: "app.riverviewstay.com",
      currency: "INR",
      country: "IN",
      jurisdiction: "IN_DEFAULT",
      status: "ACTIVE",
      registeredAddressId: addressRiverview.id,
      themeConfig: {
        primaryColor: "#1e3a8a",
        accentColor: "#0ea5e9",
        fontHeading: "Inter",
        radius: "0.5rem",
      },
      metadata: {
        tier: "enterprise_suite",
        onboardedAt: new Date().toISOString(),
      },
    },
  });

  // Statutory Tax Profile
  await prisma.organizationTaxProfile.upsert({
    where: { organizationId: tenantOrg.id },
    update: {
      taxSystem: "IN_GST",
      legalBusinessName: "Riverview Hospitality Pvt Ltd",
      taxIdentificationNo: "02AAAAA0000A1Z5",
      isEInvoicingActive: false,
    },
    create: {
      organizationId: tenantOrg.id,
      taxSystem: "IN_GST",
      legalBusinessName: "Riverview Hospitality Pvt Ltd",
      taxIdentificationNo: "02AAAAA0000A1Z5",
      registeredAddress: {
        street: "Club House Road, Old Manali",
        city: "Manali",
        state: "Himachal Pradesh",
        postalCode: "175131",
        country: "IN",
      },
      isEInvoicingActive: false,
    },
  });

  // 5. Seed Branches (HQ, Homestay Main, Riverside Cafe)
  console.log("  • Seeding operational branches...");
  const hqBranch = await prisma.branch.upsert({
    where: {
      organizationId_code: {
        organizationId: tenantOrg.id,
        code: "HQ-01",
      },
    },
    update: {
      name: "Riverview Corporate Headquarters",
      type: "headquarters",
      capabilities: ["administration", "finance"],
      timezone: "Asia/Kolkata",
      nightAuditHour: 4,
      currency: "INR",
      addressId: addressRiverview.id,
    },
    create: {
      id: "branch_riverview_hq",
      organizationId: tenantOrg.id,
      code: "HQ-01",
      name: "Riverview Corporate Headquarters",
      type: "headquarters",
      capabilities: ["administration", "finance"],
      timezone: "Asia/Kolkata",
      nightAuditHour: 4,
      currency: "INR",
      addressId: addressRiverview.id,
    },
  });

  const homestayBranch = await prisma.branch.upsert({
    where: {
      organizationId_code: {
        organizationId: tenantOrg.id,
        code: "STAY-01",
      },
    },
    update: {
      name: "Riverview Homestay Main",
      parentBranchId: hqBranch.id,
      type: "homestay",
      capabilities: ["lodging", "dining", "events"],
      timezone: "Asia/Kolkata",
      nightAuditHour: 4,
      currency: "INR",
      addressId: addressRiverview.id,
    },
    create: {
      id: "branch_riverview_homestay",
      organizationId: tenantOrg.id,
      parentBranchId: hqBranch.id,
      code: "STAY-01",
      name: "Riverview Homestay Main",
      type: "homestay",
      capabilities: ["lodging", "dining", "events"],
      timezone: "Asia/Kolkata",
      nightAuditHour: 4,
      currency: "INR",
      addressId: addressRiverview.id,
    },
  });

  const cafeBranch = await prisma.branch.upsert({
    where: {
      organizationId_code: {
        organizationId: tenantOrg.id,
        code: "CAFE-01",
      },
    },
    update: {
      name: "Riverview Riverside Cafe",
      parentBranchId: homestayBranch.id,
      type: "restaurant",
      capabilities: ["dining", "retail"],
      timezone: "Asia/Kolkata",
      nightAuditHour: 4,
      currency: "INR",
      addressId: addressRiverview.id,
    },
    create: {
      id: "branch_riverview_cafe",
      organizationId: tenantOrg.id,
      parentBranchId: homestayBranch.id,
      code: "CAFE-01",
      name: "Riverview Riverside Cafe",
      type: "restaurant",
      capabilities: ["dining", "retail"],
      timezone: "Asia/Kolkata",
      nightAuditHour: 4,
      currency: "INR",
      addressId: addressRiverview.id,
    },
  });

  // 6. Seed Installed Apps & Branch Configs
  console.log("  • Seeding modular app suite activations...");
  const apps = [
    {
      appId: "website_builder",
      version: "1.0.0",
      settings: {
        name: "Website Builder",
        title: "Website Builder & Headless CMS",
        code: "App 01",
        description: "Visual canvas studio, section blueprints, responsive device preview, and edge storefront delivery.",
        href: "/sites",
        iconName: "sites",
      },
    },
    {
      appId: "lodging_pms",
      version: "1.0.0",
      settings: {
        name: "Lodging PMS",
        title: "Lodging Property Management (PMS)",
        code: "App 03",
        description: "Multi-property reservation calendar, unit inventory, guest check-in, and night audit rollover.",
        href: "/pms",
        iconName: "pms",
      },
    },
    {
      appId: "restaurant_pos",
      version: "1.0.0",
      settings: {
        name: "Restaurant POS",
        title: "Restaurant POS & KDS",
        code: "App 04",
        description: "Fast touch counter ordering, KOT ticket printing, table management, and shift reconciliation.",
        href: "/pos",
        iconName: "pos",
      },
    },
    {
      appId: "stock_inventory",
      version: "1.0.0",
      settings: {
        name: "Central Stock",
        title: "Central Inventory & Stock Requisitions",
        code: "App 05",
        description: "Multi-warehouse stock balances, inter-branch transfers, wastage logs, and vendor procurement.",
        href: "/inventory",
        iconName: "inventory",
      },
    },
  ];

  for (const app of apps) {
    await prisma.installedApp.upsert({
      where: {
        organizationId_appId: {
          organizationId: tenantOrg.id,
          appId: app.appId,
        },
      },
      update: { isEnabled: true, version: app.version, settings: app.settings },
      create: {
        organizationId: tenantOrg.id,
        appId: app.appId,
        version: app.version,
        isEnabled: true,
        settings: app.settings,
      },
    });
  }

  // 6.1 Seed Global CMS Starter Templates
  console.log("  • Seeding CMS starter templates...");
  const starterTemplates = [
    {
      id: "tpl_hero_starter",
      name: "Curated Hero Starter",
      category: "general",
      blueprintJson: {
        id: "hero_starter",
        title: "Curated Hero Starter (Recommended)",
        description: "Pre-configured with a responsive Hero section, call-to-action banner, and brand header.",
        badge: "Fastest Setup",
        ast: {
          root: {
            id: "root-section-1",
            type: "section",
            children: [
              {
                id: "hero-block-1",
                type: "hero",
                props: {
                  heading: "Welcome to our website",
                  subheading: "Designed with Business OS Visual Studio.",
                  ctaText: "Explore Now",
                  ctaLink: "/#services",
                },
              },
            ],
          },
        },
      },
    },
    {
      id: "tpl_blank",
      name: "Blank Canvas",
      category: "general",
      blueprintJson: {
        id: "blank",
        title: "Blank Canvas",
        description: "Start with an empty section tree and compose custom layouts.",
        badge: "Clean Slate",
        ast: {
          root: {
            id: "root-section-1",
            type: "section",
            children: [],
          },
        },
      },
    },
  ];

  for (const tpl of starterTemplates) {
    await prisma.cmsTemplate.upsert({
      where: { id: tpl.id },
      update: {
        name: tpl.name,
        category: tpl.category,
        blueprintJson: tpl.blueprintJson,
      },
      create: {
        id: tpl.id,
        organizationId: null,
        name: tpl.name,
        category: tpl.category,
        blueprintJson: tpl.blueprintJson,
      },
    });
  }

  // Branch App Configs
  const branchAppConfigs = [
    { branchId: homestayBranch.id, appId: "lodging_pms" },
    { branchId: homestayBranch.id, appId: "stock_inventory" },
    { branchId: cafeBranch.id, appId: "restaurant_pos" },
    { branchId: cafeBranch.id, appId: "stock_inventory" },
  ];

  for (const bac of branchAppConfigs) {
    await prisma.appBranchConfig.upsert({
      where: {
        branchId_appId: {
          branchId: bac.branchId,
          appId: bac.appId,
        },
      },
      update: { isEnabled: true },
      create: {
        organizationId: tenantOrg.id,
        branchId: bac.branchId,
        appId: bac.appId,
        isEnabled: true,
      },
    });
  }

  // 7. Seed Demo Staff Users & Roles
  console.log("  • Seeding demo enterprise team members...");
  const users = [
    {
      email: "rohit@riverviewstay.com",
      name: "Rohit Bahuguna",
      roleSlug: "tenant-owner",
      branchId: null, // Organization-Wide access
    },
  ];

  for (const u of users) {
    const user = await prisma.user.upsert({
      where: { email: u.email },
      update: { name: u.name, emailVerified: true },
      create: {
        email: u.email,
        name: u.name,
        emailVerified: true,
      },
    });

    // Link User to Organization
    await prisma.userOrganization.upsert({
      where: {
        userId_organizationId: {
          userId: user.id,
          organizationId: tenantOrg.id,
        },
      },
      update: { status: "ACTIVE" },
      create: {
        userId: user.id,
        organizationId: tenantOrg.id,
        status: "ACTIVE",
      },
    });

    // Assign Branch Role
    const roleId = roleMap.get(u.roleSlug);
    if (roleId) {
      if (u.branchId !== null) {
        await prisma.userBranchRole.upsert({
          where: {
            userId_organizationId_branchId_roleId: {
              userId: user.id,
              organizationId: tenantOrg.id,
              branchId: u.branchId,
              roleId,
            },
          },
          update: {},
          create: {
            userId: user.id,
            organizationId: tenantOrg.id,
            branchId: u.branchId,
            roleId,
          },
        });
      } else {
        const existing = await prisma.userBranchRole.findFirst({
          where: {
            userId: user.id,
            organizationId: tenantOrg.id,
            branchId: null,
            roleId,
          },
        });
        if (!existing) {
          await prisma.userBranchRole.create({
            data: {
              userId: user.id,
              organizationId: tenantOrg.id,
              branchId: null,
              roleId,
            },
          });
        }
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
