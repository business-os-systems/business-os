import { afterEach, describe, expect, it, vi } from "vitest";
import {
  loadInstalledApps,
  parseInstalledApps,
  toAppLauncherCards,
} from "../src/app/(dashboard)/dashboard/overview-apps";

const SITES_READ = "cms:sites:read";

const installedAppsPayload = {
  userPermissions: [SITES_READ],
  apps: [
    {
      appId: "sites",
      title: "Website Builder",
      code: "website-builder",
      description: "Visual canvas studio and storefront delivery.",
      href: "/sites",
      iconName: "sites",
      permission: SITES_READ,
      isEnabled: true,
    },
  ],
};

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("Installed apps overview contract", () => {
  it("parses the canonical payload once and maps its declared fields", () => {
    const payload = parseInstalledApps(installedAppsPayload);
    const cards = toAppLauncherCards(payload.apps);

    expect(cards).toHaveLength(1);
    expect(cards[0]).toMatchObject({
      title: "Website Builder",
      code: "website-builder",
      desc: "Visual canvas studio and storefront delivery.",
      href: "/sites",
      permission: SITES_READ,
      status: "Available",
      isAvailable: true,
    });
  });

  it("refuses a legacy payload that only carries an alias", () => {
    expect(() =>
      parseInstalledApps({
        apps: [
          {
            appId: "sites",
            name: "Legacy name",
            code: "website-builder",
            description: "",
            href: "/sites",
            iconName: "sites",
            permission: SITES_READ,
            isEnabled: true,
          },
        ],
      })
    ).toThrow();
  });

  it("refuses an external application link", () => {
    expect(() =>
      parseInstalledApps({
        ...installedAppsPayload,
        apps: [{ ...installedAppsPayload.apps[0], href: "https://evil.example.com" }],
      })
    ).toThrow();
  });

  it("derives availability from the installed ids, not a guessed field", () => {
    const payload = parseInstalledApps(installedAppsPayload);
    const [available] = toAppLauncherCards(payload.apps, ["sites"]);
    const [comingSoon] = toAppLauncherCards(payload.apps, ["pos"]);

    expect(available?.status).toBe("Available");
    expect(comingSoon?.status).toBe("Coming Soon");
  });

});

describe("Installed apps loader", () => {
  it("returns a typed error result for a failed installed-apps request", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn<typeof fetch>().mockResolvedValue(
        new Response("upstream unavailable", { status: 503 })
      )
    );

    const result = await loadInstalledApps("/api/v1/installed-apps");
    expect(result).toEqual({
      kind: "error",
      message: "Installed applications request failed with status 503.",
    });
  });

  it("loads and parses a successful installed-apps response", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn<typeof fetch>().mockResolvedValue(
        new Response(JSON.stringify(installedAppsPayload), { status: 200 })
      )
    );

    const result = await loadInstalledApps("/api/v1/installed-apps");
    expect(result.kind).toBe("loaded");
    if (result.kind !== "loaded") return;
    expect(result.payload.apps[0]?.title).toBe("Website Builder");
  });
});
