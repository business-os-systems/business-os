import { beforeEach, describe, expect, it, vi } from "vitest";
import { getAppManifest } from "@suite/core";

const prismaMock = vi.hoisted(() => ({
  permission: { upsert: vi.fn() },
  role: { findMany: vi.fn() },
  rolePermission: { upsert: vi.fn() },
  installedApp: {
    findMany: vi.fn(),
    update: vi.fn<
      (args: {
        where: { id: string };
        data: { settings: Record<string, unknown> };
      }) => Promise<void>
    >(),
  },
}));

vi.mock("../src/client.js", () => ({ prisma: prismaMock }));

const { backfillAppMetadata, mergeAppSettings } = await import(
  "../src/backfill-app-metadata.js"
);

const WEBSITE_BUILDER = "website-builder";
const manifest = getAppManifest(WEBSITE_BUILDER);
if (manifest === undefined) throw new Error("Website Builder manifest missing");

beforeEach(() => {
  vi.clearAllMocks();
  prismaMock.permission.upsert.mockResolvedValue({ id: "perm_1" });
  prismaMock.role.findMany.mockResolvedValue([]);
  prismaMock.installedApp.findMany.mockResolvedValue([
    { id: "app_1", appId: WEBSITE_BUILDER, settings: {} },
  ]);
});

describe("mergeAppSettings", () => {
  it("fills every missing field from the manifest", () => {
    const merged = mergeAppSettings({}, manifest, WEBSITE_BUILDER);
    expect(merged.iconName).toBe(manifest.iconKey);
    expect(merged.title).toBe(manifest.title);
    expect(merged.href).toBe(manifest.href);
  });

  it("keeps an existing icon and title", () => {
    const merged = mergeAppSettings(
      { iconName: "custom", title: "Custom title" },
      manifest,
      WEBSITE_BUILDER,
    );
    expect(merged.iconName).toBe("custom");
    expect(merged.title).toBe("Custom title");
  });
});

describe("backfillAppMetadata", () => {
  it("writes the manifest fields into an installed app", async () => {
    await backfillAppMetadata();
    expect(prismaMock.installedApp.update).toHaveBeenCalledTimes(1);
    const call = prismaMock.installedApp.update.mock.calls[0]?.[0];
    expect(call?.data.settings.iconName).toBe(manifest.iconKey);
    expect(call?.data.settings.title).toBe(manifest.title);
  });
});
