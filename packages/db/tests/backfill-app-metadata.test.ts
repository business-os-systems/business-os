import { describe, expect, it } from "vitest";
import { getAppManifest } from "@suite/core";
import { mergeAppSettings } from "../src/backfill-app-metadata.js";

const manifest = getAppManifest("website-builder");
if (manifest === undefined) throw new Error("Website Builder manifest missing");

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
