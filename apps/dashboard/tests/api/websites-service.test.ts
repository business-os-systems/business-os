import { beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";

const mocks = vi.hoisted(() => ({
  withTenantContext: vi.fn(),
  findMany: vi.fn(),
}));

vi.mock("@suite/db", () => ({
  Prisma: {},
  withTenantContext: mocks.withTenantContext,
}));

import { listWebsiteSites } from "@/services/websites.service";

function siteRow(overrides: Partial<{
  id: string;
  updatedAt: Date;
  primaryDomain: string | null;
  homePageId: string | null;
  pageCount: number;
}> = {}) {
  return {
    id: overrides.id ?? "site_1",
    title: "Riverview",
    slug: "riverview",
    status: "DRAFT",
    timezone: "UTC",
    updatedAt: overrides.updatedAt ?? new Date("2026-11-11T10:00:00.000Z"),
    domains:
      overrides.primaryDomain === null
        ? []
        : [{ hostname: overrides.primaryDomain ?? "riverview.example.com" }],
    pages: overrides.homePageId === null ? [] : [{ id: overrides.homePageId ?? "page_home" }],
    _count: { pages: overrides.pageCount ?? 2 },
  };
}

const cursorPayloadSchema = z.object({
  updatedAt: z.string(),
  id: z.string(),
});

const ORG_ID = "org_tenant";
const CURSOR_ID = "site_2";
const CURSOR_TIME = "2026-11-11T11:00:00.000Z";

function decodeCursor(cursor: string): z.infer<typeof cursorPayloadSchema> {
  const decoded: unknown = JSON.parse(Buffer.from(cursor, "base64url").toString("utf8"));
  return cursorPayloadSchema.parse(decoded);
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.withTenantContext.mockImplementation(
    (organizationId: string, callback: (tx: unknown) => unknown) =>
      callback({ cmsSite: { findMany: mocks.findMany } })
  );
  mocks.findMany.mockResolvedValue([siteRow()]);
});

describe("listWebsiteSites tenant scoping", () => {
  it("runs inside the tenant context and always scopes by organization", async () => {
    await listWebsiteSites({ organizationId: ORG_ID, limit: 25 });

    expect(mocks.withTenantContext).toHaveBeenCalledWith(
      ORG_ID,
      expect.any(Function)
    );
    expect(mocks.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { organizationId: ORG_ID },
        take: 26,
        orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
      })
    );
  });

  it("maps real rows without inventing a domain or a home page", async () => {
    mocks.findMany.mockResolvedValue([
      siteRow({ primaryDomain: null, homePageId: null, pageCount: 0 }),
    ]);

    const result = await listWebsiteSites({ organizationId: ORG_ID, limit: 25 });

    expect(result).toEqual({
      kind: "ok",
      page: {
        sites: [
          {
            id: "site_1",
            title: "Riverview",
            slug: "riverview",
            status: "DRAFT",
            timezone: "UTC",
            primaryDomain: null,
            pageCount: 0,
            homePageId: null,
            updatedAt: "2026-11-11T10:00:00.000Z",
          },
        ],
        nextCursor: null,
      },
    });
  });
});

describe("listWebsiteSites cursor pagination", () => {
  it("returns a cursor for the next page and stops reading after the page size", async () => {
    mocks.findMany.mockResolvedValue([
      siteRow({ id: "site_3", updatedAt: new Date("2026-11-11T12:00:00.000Z") }),
      siteRow({ id: CURSOR_ID, updatedAt: new Date(CURSOR_TIME) }),
      siteRow({ id: "site_1", updatedAt: new Date("2026-11-11T10:00:00.000Z") }),
    ]);

    const result = await listWebsiteSites({ organizationId: ORG_ID, limit: 2 });

    if (result.kind !== "ok") throw new Error("expected an ok page");
    expect(result.page.sites.map((site) => site.id)).toEqual(["site_3", CURSOR_ID]);
    expect(result.page.nextCursor).not.toBeNull();
    expect(decodeCursor(result.page.nextCursor ?? "")).toEqual({
      updatedAt: CURSOR_TIME,
      id: CURSOR_ID,
    });
  });

  it("translates a cursor into a stable keyset filter", async () => {
    const cursor = Buffer.from(
      JSON.stringify({ updatedAt: CURSOR_TIME, id: CURSOR_ID }),
      "utf8"
    ).toString("base64url");

    await listWebsiteSites({ organizationId: ORG_ID, cursor, limit: 2 });

    expect(mocks.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          organizationId: ORG_ID,
          OR: [
            { updatedAt: { lt: new Date("2026-11-11T11:00:00.000Z") } },
            { updatedAt: new Date(CURSOR_TIME), id: { lt: CURSOR_ID } },
          ],
        },
      })
    );
  });

  it("rejects a cursor that is not our encoded payload without querying", async () => {
    const result = await listWebsiteSites({
      organizationId: ORG_ID,
      cursor: "not-a-cursor",
      limit: 2,
    });

    expect(result).toEqual({ kind: "invalid_cursor" });
    expect(mocks.withTenantContext).not.toHaveBeenCalled();
  });
});
