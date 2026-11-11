import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma, type Prisma } from "@suite/db";
import { listTenantCatalogSections } from "../../src/services/cms/catalog-section.service.js";
import { listPublishedTemplates } from "../../src/services/cms/site-service.js";

/**
 * Targeting is resolved from the tenant's own data for sections and templates
 * alike (FR-007, FR-008, T143). Every case reads a real database row through the
 * same reader the tenant surfaces use.
 */

const enabled = Boolean(process.env.DATABASE_URL && process.env.TENANT_DATABASE_URL);
const RUN = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
const ORG_PLAN_A = "org_wt374_plan_a_" + RUN;
const ORG_PLAN_B = "org_wt374_plan_b_" + RUN;
const ORG_UNPLANNED = "org_wt374_unplanned_" + RUN;
const ORG_INVALID_PLAN = "org_wt374_invalid_" + RUN;
const SLUG_PREFIX = "wt374-targeting-" + RUN;
const FLAG_PREFIX = "wt374_targeting_" + RUN;
const FLAG_KEY = FLAG_PREFIX + ".phase_one";
const ACTOR = "usr_wt374";

interface ItemIds {
  planSection: string;
  planTemplate: string;
  industrySection: string;
  otherIndustryTemplate: string;
  flagSection: string;
  flagTemplate: string;
  allowSection: string;
  denyTemplate: string;
  invalidTargetingSection: string;
  draftTemplate: string;
  unpublishedTemplate: string;
}

const IDS: ItemIds = {
  planSection: "",
  planTemplate: "",
  industrySection: "",
  otherIndustryTemplate: "",
  flagSection: "",
  flagTemplate: "",
  allowSection: "",
  denyTemplate: "",
  invalidTargetingSection: "",
  draftTemplate: "",
  unpublishedTemplate: "",
};

function sectionDefinition(headline: string) {
  return {
    schemaVersion: "2026-03",
    block: { id: "blk_wt374", type: "hero", props: { headline } },
  };
}

function templateDefinition() {
  return {
    schemaVersion: "2026-03",
    pages: [
      {
        version: 1,
        schemaVersion: "2026-03",
        sections: [
          {
            id: "sec_wt374",
            blocks: [
              {
                id: "blk_wt374_template",
                type: "hero",
                props: { headline: "Template hero" },
              },
            ],
          },
        ],
      },
    ],
  };
}

async function cleanup(): Promise<void> {
  await prisma.cmsCatalogItemVersion.deleteMany({
    where: { item: { slug: { startsWith: SLUG_PREFIX } } },
  });
  await prisma.cmsCatalogItem.deleteMany({
    where: { slug: { startsWith: SLUG_PREFIX } },
  });
  await prisma.featureFlag.deleteMany({ where: { key: { startsWith: FLAG_PREFIX } } });
  await prisma.organization.deleteMany({
    where: { id: { in: [ORG_PLAN_A, ORG_PLAN_B, ORG_UNPLANNED, ORG_INVALID_PLAN] } },
  });
}

interface ItemInput {
  readonly key: keyof ItemIds;
  readonly name: string;
  readonly kind: "SECTION" | "TEMPLATE";
  readonly targeting?: Prisma.InputJsonValue;
  readonly flagKey?: string | null;
  readonly status?: "DRAFT" | "ACTIVE";
  readonly currentVersion?: number;
  readonly writePublishedVersion?: boolean;
}

async function createItem(input: ItemInput): Promise<void> {
  const currentVersion = input.currentVersion ?? 1;
  const definition = input.kind === "SECTION" ? sectionDefinition(input.name) : templateDefinition();
  const item = await prisma.cmsCatalogItem.create({
    data: {
      kind: input.kind,
      scope: "GLOBAL",
      organizationId: null,
      name: input.name,
      slug: SLUG_PREFIX + "-" + input.key,
      category: "hospitality",
      industries: [],
      definition,
      status: input.status ?? "ACTIVE",
      targeting: input.targeting ?? {},
      flagKey: input.flagKey ?? null,
      currentVersion,
      createdBy: ACTOR,
      updatedBy: ACTOR,
    },
  });
  IDS[input.key] = item.id;
  if (currentVersion > 0 && input.writePublishedVersion !== false) {
    await prisma.cmsCatalogItemVersion.create({
      data: {
        itemId: item.id,
        version: currentVersion,
        definition,
        status: "ACTIVE",
        publishedAt: new Date(),
        publishedBy: ACTOR,
        createdBy: ACTOR,
      },
    });
  }
}

interface OrganizationSeed {
  readonly id: string;
  readonly name: string;
  readonly slug: string;
  readonly metadata: Prisma.InputJsonValue;
}

const ORGANIZATIONS: readonly OrganizationSeed[] = [
  {
    id: ORG_PLAN_A,
    name: "WT-374 plan A",
    slug: "wt374-plan-a-" + RUN,
    metadata: { plan: "plan-a", industries: ["hospitality"] },
  },
  {
    id: ORG_PLAN_B,
    name: "WT-374 plan B",
    slug: "wt374-plan-b-" + RUN,
    metadata: { plan: "plan-b", industries: ["hospitality"] },
  },
  {
    id: ORG_UNPLANNED,
    name: "WT-374 no plan",
    slug: "wt374-no-plan-" + RUN,
    metadata: { industries: ["hospitality"] },
  },
  {
    id: ORG_INVALID_PLAN,
    name: "WT-374 invalid plan",
    slug: "wt374-invalid-plan-" + RUN,
    metadata: { plan: "Plan A!", industries: ["hospitality"] },
  },
];

const CATALOG_ITEMS: readonly ItemInput[] = [
  {
    key: "planSection",
    name: "Plan A section",
    kind: "SECTION",
    targeting: { plans: ["plan-a"] },
  },
  {
    key: "planTemplate",
    name: "Plan A template",
    kind: "TEMPLATE",
    targeting: { plans: ["plan-a"] },
  },
  {
    key: "industrySection",
    name: "Hospitality section",
    kind: "SECTION",
    targeting: { industries: ["hospitality"] },
  },
  {
    key: "otherIndustryTemplate",
    name: "Retail template",
    kind: "TEMPLATE",
    targeting: { industries: ["retail"] },
  },
  { key: "flagSection", name: "Flagged section", kind: "SECTION", flagKey: FLAG_KEY },
  { key: "flagTemplate", name: "Flagged template", kind: "TEMPLATE", flagKey: FLAG_KEY },
  {
    key: "allowSection",
    name: "Allowlisted section",
    kind: "SECTION",
    targeting: { orgAllowlist: [ORG_PLAN_A] },
  },
  {
    key: "denyTemplate",
    name: "Denylisted template",
    kind: "TEMPLATE",
    targeting: { orgDenylist: [ORG_PLAN_A] },
  },
  {
    key: "invalidTargetingSection",
    name: "Malformed targeting section",
    kind: "SECTION",
    targeting: { plans: "plan-a" },
  },
  { key: "draftTemplate", name: "Draft template", kind: "TEMPLATE", status: "DRAFT" },
  {
    key: "unpublishedTemplate",
    name: "Unpublished template",
    kind: "TEMPLATE",
    currentVersion: 0,
    writePublishedVersion: false,
  },
];

async function seedOrganizations(): Promise<void> {
  await Promise.all(
    ORGANIZATIONS.map((organization) => prisma.organization.create({ data: organization })),
  );
}

async function seedRolloutFlag(): Promise<void> {
  await prisma.featureFlag.create({
    data: {
      key: FLAG_KEY,
      name: "WT-374 rollout",
      description: "Targeting fixture for issue #374",
      environment: "development",
      isEnabled: true,
      defaultEnabled: false,
      owner: "platform-catalog",
      expiresAt: new Date(Date.now() + 86_400_000),
      removalTicket: "#374",
      rules: {
        create: { ruleType: "ORGANIZATION", targetId: ORG_PLAN_A, enabled: true },
      },
    },
  });
}

async function seedCatalogItems(): Promise<void> {
  await Promise.all(CATALOG_ITEMS.map((item) => createItem(item)));
}

beforeAll(async () => {
  if (!enabled) return;
  await cleanup();
  await seedOrganizations();
  await seedRolloutFlag();
  await seedCatalogItems();
});

afterAll(async () => {
  if (!enabled) return;
  await cleanup();
  await prisma.$disconnect();
});

async function sectionIds(organizationId: string): Promise<ReadonlySet<string>> {
  const sections = await listTenantCatalogSections({ organizationId, limit: 100 });
  return new Set(sections.map((section) => section.id));
}

async function templateIds(organizationId: string): Promise<ReadonlySet<string>> {
  const templates = await listPublishedTemplates(organizationId);
  return new Set(templates.map((template) => template.id));
}

describe.skipIf(!enabled)("Section and template targeting (FR-007, FR-008, T143)", () => {
  it("shows a plan-A section to a plan-A tenant and hides it from plan B", async () => {
    const planA = await sectionIds(ORG_PLAN_A);
    const planB = await sectionIds(ORG_PLAN_B);

    expect(planA.has(IDS.planSection)).toBe(true);
    expect(planB.has(IDS.planSection)).toBe(false);
  });

  it("applies the same plan rule to templates", async () => {
    const planA = await templateIds(ORG_PLAN_A);
    const planB = await templateIds(ORG_PLAN_B);

    expect(planA.has(IDS.planTemplate)).toBe(true);
    expect(planB.has(IDS.planTemplate)).toBe(false);
  });

  it("fails closed when the tenant declares no plan or an unreadable one", async () => {
    const unplanned = await sectionIds(ORG_UNPLANNED);
    const templates = await templateIds(ORG_UNPLANNED);
    const invalidPlanSections = await sectionIds(ORG_INVALID_PLAN);

    expect(unplanned.has(IDS.planSection)).toBe(false);
    expect(templates.has(IDS.planTemplate)).toBe(false);
    expect(invalidPlanSections.has(IDS.planSection)).toBe(false);
  });

  it("never offers a row whose targeting payload is malformed", async () => {
    const sections = await sectionIds(ORG_PLAN_A);

    expect(sections.has(IDS.invalidTargetingSection)).toBe(false);
  });

  it("applies industry, allowlist and denylist rules to both readers", async () => {
    const sections = await sectionIds(ORG_PLAN_A);
    const templates = await templateIds(ORG_PLAN_A);

    expect(sections.has(IDS.industrySection)).toBe(true);
    expect(templates.has(IDS.otherIndustryTemplate)).toBe(false);
    expect(sections.has(IDS.allowSection)).toBe(true);
    expect(templates.has(IDS.denyTemplate)).toBe(false);

    const planBSections = await sectionIds(ORG_PLAN_B);
    const planBTemplates = await templateIds(ORG_PLAN_B);
    expect(planBSections.has(IDS.allowSection)).toBe(false);
    expect(planBTemplates.has(IDS.denyTemplate)).toBe(true);
  });

  it("applies the declared rollout flag to both readers", async () => {
    const planASections = await sectionIds(ORG_PLAN_A);
    const planATemplates = await templateIds(ORG_PLAN_A);
    const planBSections = await sectionIds(ORG_PLAN_B);
    const planBTemplates = await templateIds(ORG_PLAN_B);

    expect(planASections.has(IDS.flagSection)).toBe(true);
    expect(planATemplates.has(IDS.flagTemplate)).toBe(true);
    expect(planBSections.has(IDS.flagSection)).toBe(false);
    expect(planBTemplates.has(IDS.flagTemplate)).toBe(false);
  });

  it("never offers a draft or unpublished template", async () => {
    const templates = await templateIds(ORG_PLAN_A);

    expect(templates.has(IDS.draftTemplate)).toBe(false);
    expect(templates.has(IDS.unpublishedTemplate)).toBe(false);
  });
});
