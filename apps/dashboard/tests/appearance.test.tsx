// @vitest-environment jsdom
import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { renderToString } from "react-dom/server";
import { PERMISSIONS } from "@suite/core";
import { DEFAULT_APPEARANCE_TOKENS } from "@suite/website-builder/appearance";
import {
  CUSTOM_FONT_PAIRING_ID,
  FONT_PAIRINGS,
  appearanceFormConfig,
  appearanceFormSchema,
  findFontPairing,
  fontPairingOptions,
  initialAppearanceFormValues,
} from "../src/components/studio/appearance-form.config";
import { AppearancePreview } from "../src/components/studio/appearance-preview";
import { AppearanceThemeGallery } from "../src/components/studio/appearance-theme-gallery";
import { AppearancePanel } from "../src/components/studio/appearance-panel";
import type {
  CmsAppearanceDto,
  CmsAppearanceThemeDto,
  CmsSiteDto,
} from "../src/lib/api/site-client";

const NOW = "2026-11-11T00:00:00.000Z";
const SITE_ID = "site_appearance";
const BRAND_NAME = "Riverview Bistro";

const SITE: CmsSiteDto = {
  id: SITE_ID,
  organizationId: "org_1",
  branchId: null,
  title: BRAND_NAME,
  slug: "riverview-bistro",
  status: "DRAFT",
  timezone: "Asia/Kolkata",
  primaryLocale: "en",
  pagesCount: 2,
  createdAt: NOW,
  updatedAt: NOW,
};

const APPEARANCE: CmsAppearanceDto = {
  siteId: SITE_ID,
  brandName: BRAND_NAME,
  brandLogoUrl: null,
  draftTokens: DEFAULT_APPEARANCE_TOKENS,
  publishedTokens: DEFAULT_APPEARANCE_TOKENS,
  sourceItemId: null,
  sourceVersion: null,
  version: 1,
  publishedAt: NOW,
  hasUnpublishedChanges: false,
};

const THEMES: CmsAppearanceThemeDto[] = [
  {
    id: "theme_warm",
    name: "Warm stone",
    slug: "warm-stone",
    category: "hospitality",
    industries: ["hospitality"],
    currentVersion: 1,
    previewRef: null,
    tokens: { ...DEFAULT_APPEARANCE_TOKENS, colorPrimary: "#A43A2B" },
  },
  {
    id: "theme_coastal",
    name: "Coastal",
    slug: "coastal",
    category: "hospitality",
    industries: ["hospitality"],
    currentVersion: 2,
    previewRef: null,
    tokens: { ...DEFAULT_APPEARANCE_TOKENS, colorPrimary: "#0F766E" },
  },
];

function requestUrl(input: RequestInfo | URL): string {
  if (typeof input === "string") {
    return input;
  }
  if (input instanceof URL) {
    return input.href;
  }
  return input.url;
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function envelope(data: unknown): unknown {
  return { success: true, data, requestId: "req_appearance", timestamp: NOW };
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("Appearance form configuration (T117, T121)", () => {
  it("declares logo, primary colour and curated font pairing fields", () => {
    const config = appearanceFormConfig(DEFAULT_APPEARANCE_TOKENS);
    const fields = config.sections.flatMap((section) => section.fields ?? []);
    const names = fields.map((field) => field.name);
    expect(names).toContain("brandLogoUrl");
    expect(names).toContain("primaryColor");
    expect(names).toContain("fontPairing");
    const pairing = fields.find((field) => field.name === "fontPairing");
    expect(pairing?.type).toBe("select");
    if (pairing?.type === "select") {
      expect(pairing.options).toHaveLength(FONT_PAIRINGS.length);
      expect(pairing.options.map((option) => option.value)).toEqual(
        FONT_PAIRINGS.map((option) => option.id)
      );
    }
  });

  it("validates the colour as a six-digit hex value", () => {
    const valid = {
      brandName: BRAND_NAME,
      brandLogoUrl: "",
      primaryColor: "#A43A2B",
      fontPairing: "inter",
    };
    expect(appearanceFormSchema.safeParse(valid).success).toBe(true);
    expect(
      appearanceFormSchema.safeParse({ ...valid, primaryColor: "red" }).success
    ).toBe(false);
  });

  it("keeps an uncurated theme font pair selectable instead of rewriting it", () => {
    const tokens = {
      ...DEFAULT_APPEARANCE_TOKENS,
      fontHeading: "Lora, Georgia, serif",
      fontBody: "Nunito Sans, system-ui, sans-serif",
    };
    expect(findFontPairing("inter")?.heading).toBe("Inter, system-ui, sans-serif");
    expect(fontPairingOptions(tokens)).toContainEqual({
      label: "Current theme fonts",
      value: CUSTOM_FONT_PAIRING_ID,
    });
    expect(initialAppearanceFormValues({ brandName: "B", brandLogoUrl: null, tokens })).toEqual({
      brandName: "B",
      brandLogoUrl: "",
      primaryColor: DEFAULT_APPEARANCE_TOKENS.colorPrimary,
      fontPairing: CUSTOM_FONT_PAIRING_ID,
    });
  });
});

describe("Appearance theme gallery (T121)", () => {
  it("shows every catalog theme and marks the selected source", () => {
    const html = renderToString(
      <AppearanceThemeGallery
        themes={THEMES}
        selectedThemeId="theme_warm"
        isSaving={false}
        onSelect={() => Promise.resolve()}
      />
    );
    expect(html).toContain("Warm stone");
    expect(html).toContain("Coastal");
    expect(html).toContain("Selected theme");
    expect(html).toContain("Use this theme");
  });

  it("reports a real empty state when the catalog has no published theme", () => {
    const html = renderToString(
      <AppearanceThemeGallery
        themes={[]}
        selectedThemeId={null}
        isSaving={false}
        onSelect={() => Promise.resolve()}
      />
    );
    expect(html).toContain("No published themes are available");
  });
});

describe("Appearance preview (T121)", () => {
  it("renders the site snapshot as CSS custom properties", () => {
    const html = renderToString(
      <AppearancePreview
        tokens={{ ...DEFAULT_APPEARANCE_TOKENS, colorPrimary: "#123456" }}
        brandName={BRAND_NAME}
        brandLogoUrl={null}
      />
    );
    expect(html).toContain("data-cms-theme=\"true\"");
    expect(html).toContain("--cms-color-primary:#123456");
    expect(html).toContain(BRAND_NAME);
  });
});

describe("Appearance panel (T116, T121)", () => {
  it("loads the site appearance and exposes save, publish and reset", async () => {
    const fetchMock = vi.fn((input: RequestInfo | URL) => {
      const url = requestUrl(input);
      if (url.endsWith("/appearance/theme")) {
        return Promise.resolve(
          jsonResponse(
            envelope({
              appearance: {
                ...APPEARANCE,
                sourceItemId: "theme_coastal",
                sourceVersion: 2,
                version: 2,
                hasUnpublishedChanges: true,
              },
            })
          )
        );
      }
      if (url.endsWith("/appearance")) {
        return Promise.resolve(
          jsonResponse(
            envelope({
              appearance: { ...APPEARANCE, hasUnpublishedChanges: true },
            })
          )
        );
      }
      if (url.endsWith("/themes")) {
        return Promise.resolve(jsonResponse(envelope({ items: THEMES })));
      }
      if (url.endsWith("/sites/" + SITE_ID)) {
        return Promise.resolve(jsonResponse(envelope({ site: SITE })));
      }
      return Promise.reject(new Error("Unexpected request: " + url));
    });
    vi.stubGlobal("fetch", fetchMock);

    render(
      <AppearancePanel
        siteId={SITE_ID}
        permissions={[PERMISSIONS.WEBSITE_BUILDER.THEME_MANAGE]}
      />
    );

    expect(await screen.findByText("Theme gallery")).toBeTruthy();
    expect(screen.getByText("Brand basics")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Publish appearance" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Reset to theme" })).toBeTruthy();
    expect(screen.getByText("Unpublished changes")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: /Coastal/ }));
    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/v1/cms/sites/" + SITE_ID + "/appearance/theme",
        expect.objectContaining({ method: "POST" })
      );
    });
  });
});
