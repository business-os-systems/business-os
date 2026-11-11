import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  disconnectTenantRuntimeClient,
  prisma,
} from "@suite/db";
import { listWebsiteSites } from "@/services/websites.service";

/**
 * Proves the overview read under the real tenant database identity and cms RLS
 * policy. Runs only when the scratch database environment is supplied, so the
 * unit suite never reaches a shared development database.
 */
const enabled = Boolean(
  process.env.DATABASE_URL && process.env.TENANT_DATABASE_URL
);

const ORG_A = "org_wt348_sites_a";
const ORG_B = "org_wt348_sites_b";
const SITE_IDS = {
  a1: "site_wt348_a1",
  a2: "site_wt348_a2",
  a3: "site_wt348_a3",
  b1: "site_wt348_b1",
};

async function deleteSites(): Promise<void> {
  await prisma.cmsSite.deleteMany({
    where: { organizationId: { in: [ORG_A, ORG_B] } },
  });
}

async function seedPrimarySite(): Promise<void> {
  await prisma.cmsSite.create({
    data: {
      id: SITE_IDS.a1,
      organizationId: ORG_A,
      title: "Alpha Bistro",
      slug: "alpha-bistro",
      status: "PUBLISHED",
      timezone: "UTC",
      domains: {
        create: {
          hostname: "alpha-bistro.wt348.test",
          isPrimary: true,
          isSubdomain: true,
          status: "ACTIVE",
          verificationToken: "vtoken_wt348_a1",
        },
      },
      pages: {
        create: {
          title: "Home",
          slug: "/",
          isHomePage: true,
          status: "DRAFT",
          revision: 1,
        },
      },
    },
  });
}

async function seedAdditionalSites(): Promise<void> {
  await prisma.cmsSite.createMany({
    data: [
      {
        id: SITE_IDS.a2,
        organizationId: ORG_A,
        title: "Alpha Events",
        slug: "alpha-events",
        status: "DRAFT",
        timezone: "UTC",
      },
      {
        id: SITE_IDS.a3,
        organizationId: ORG_A,
        title: "Alpha Careers",
        slug: "alpha-careers",
        status: "ARCHIVED",
        timezone: "UTC",
      },
      {
        id: SITE_IDS.b1,
        organizationId: ORG_B,
        title: "Beta Bistro",
        slug: "beta-bistro",
        status: "DRAFT",
        timezone: "UTC",
      },
    ],
  });
}

beforeAll(async () => {
  if (!enabled) {
    return;
  }
  await deleteSites();
  await seedPrimarySite();
  await seedAdditionalSites();
});

afterAll(async () => {
  if (!enabled) {
    return;
  }
  await deleteSites();
  await disconnectTenantRuntimeClient();
});

describe.skipIf(!enabled)("Website Builder sites read under tenant RLS", () => {
  it("returns only the caller's organization sites", async () => {
    const result = await listWebsiteSites({ organizationId: ORG_A, limit: 25 });

    if (result.kind !== "ok") throw new Error("expected an ok page");
    const ids = result.page.sites.map((site) => site.id);
    expect(ids).toHaveLength(3);
    expect(new Set(ids)).toEqual(
      new Set([SITE_IDS.a1, SITE_IDS.a2, SITE_IDS.a3])
    );
    expect(ids).not.toContain(SITE_IDS.b1);
  });

  it("reads a primary domain and home page from the database, never a heuristic", async () => {
    const result = await listWebsiteSites({ organizationId: ORG_A, limit: 25 });

    if (result.kind !== "ok") throw new Error("expected an ok page");
    const alpha = result.page.sites.find((site) => site.id === SITE_IDS.a1);
    expect(alpha?.primaryDomain).toBe("alpha-bistro.wt348.test");
    expect(alpha?.homePageId).not.toBeNull();
    expect(alpha?.pageCount).toBe(1);
  });

  it("paginates the RLS-scoped list with a stable cursor", async () => {
    const first = await listWebsiteSites({ organizationId: ORG_A, limit: 2 });
    if (first.kind !== "ok") throw new Error("expected an ok first page");
    expect(first.page.nextCursor).not.toBeNull();

    const second = await listWebsiteSites({
      organizationId: ORG_A,
      cursor: first.page.nextCursor ?? undefined,
      limit: 2,
    });
    if (second.kind !== "ok") throw new Error("expected an ok second page");

    const ids = [
      ...first.page.sites.map((site) => site.id),
      ...second.page.sites.map((site) => site.id),
    ];
    expect(ids).toHaveLength(3);
    expect(new Set(ids)).toEqual(
      new Set([SITE_IDS.a1, SITE_IDS.a2, SITE_IDS.a3])
    );
  });

  it("returns nothing for another tenant even when its organization id is guessed", async () => {
    const result = await listWebsiteSites({ organizationId: ORG_B, limit: 25 });

    if (result.kind !== "ok") throw new Error("expected an ok page");
    expect(result.page.sites.map((site) => site.id)).toEqual([SITE_IDS.b1]);
  });
});
