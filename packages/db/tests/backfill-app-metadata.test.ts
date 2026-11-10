import { beforeEach, describe, expect, it, vi } from "vitest";
import { getAppManifest } from "@suite/core";

const prismaMock = vi.hoisted(() => ({
  permission: { upsert: vi.fn() },
  role: { findMany: vi.fn() },
  rolePermission: { upsert: vi.fn() },
  installedApp: { findMany: vi.fn(), update: vi.fn() },
}));

vi.mock("../src/client.js", () => ({ prisma: prismaMock }));

const { backfillAppMetadata, mergeAppSettings } = await import(
  "../src/backfill-app-metadata.js"
);

const manifest = getAppManifest("website-builder");
if (manifest === undefined) throw new Error("Website Builder manifest missing");

beforeEach(() => {
  vi.clearAllMocks();
  prismaMock.permission.upsert.mockResolvedValue({ id: "perm_1" });
  prismaMock.role.findMany.mockResolvedValue([]);
  prismaMock.installedApp.findMany.mockResolvedValue([
    { id: "app_1", appId: "website-builder", settings: {} },
  ]);
});

describe("mergeAppSettings", () => {
  it("fills every missing field from the manifest", () => {
    const merged = mergeAppSettings({}, manifest, "website-builder");
    expect(merged.iconName).toBe(manifest.iconKey);
    expect(merged.title).toBe(manifest.title);
    expect(merged.href).toBe(manifest.href);
  });

  it("keeps an existing icon and title", () => {
    const merged = mergeAppSettings(
      { iconName: "custom", title: "Custom title" },
      manifest,
      "website-builder",
    );
    expect(merged.iconName).toBe("custom");
    expect(merged.title).toBe("Custom title");
  });
});

describe("backfillAppMetadata", () => {
  it("writes the manifest fields into an installed app", async () => {
    await backfillAppMetadata();
    expect(prismaMock.installedApp.update).toHaveBeenCalledWith({
      where: { id: "app_1" },
      data: {
        settings: expect.objectContaining({
          iconName: manifest.iconKey,
          title: manifest.title,
        }),
      },
    });
  });
});
