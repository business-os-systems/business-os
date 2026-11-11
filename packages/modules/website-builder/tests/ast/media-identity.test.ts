import { describe, expect, it } from "vitest";
import {
  PageAstSchema,
  collectMediaAssetIds,
  collectMediaReferences,
} from "../../src/ast/index.js";
import { resolveMediaImage } from "../../src/render/media-resolution.js";
import type { PageAst } from "../../src/ast/types.js";

const ASSET_ID = "ma_identity_1";
const ASSET_URL = "https://cdn.example.com/media/hero.png";
const LEGACY_URL = "https://cdn.example.com/legacy.png";
const COPIED_URL = "https://cdn.example.com/copied.png";
const HEADLINE = "Harbour views";

function pageWithHeroImage(image: Record<string, unknown>): unknown {
  return {
    version: 1,
    schemaVersion: "2026-03",
    sections: [
      {
        id: "sec_hero",
        blocks: [
          {
            id: "blk_hero",
            type: "hero",
            props: { headline: HEADLINE, image },
          },
        ],
      },
    ],
  };
}

function pageWithHeroMedia(): PageAst {
  return pageWithHeroImage({
    kind: "asset",
    assetId: ASSET_ID,
  }) as PageAst;
}

describe("media identity in the block AST (FR-120)", () => {
  it("accepts an asset identity without a copied URL", () => {
    const parsed = PageAstSchema.safeParse(pageWithHeroMedia());
    expect(parsed.success).toBe(true);
    if (!parsed.success) {
      throw parsed.error;
    }
    expect(parsed.data.sections[0]?.blocks[0]).toMatchObject({
      type: "hero",
      props: { image: { kind: "asset", assetId: ASSET_ID } },
    });
  });

  it("rejects a copied URL smuggled into the asset variant", () => {
    const invalid = pageWithHeroImage({ kind: "asset", assetId: ASSET_ID, url: COPIED_URL });
    expect(PageAstSchema.safeParse(invalid).success).toBe(false);
  });

  it("keeps legacy direct URLs valid for previously authored blocks", () => {
    const legacy = {
      version: 1 as const,
      schemaVersion: "2026-03" as const,
      sections: [
        {
          id: "sec_legacy",
          blocks: [
            {
              id: "blk_legacy",
              type: "hero" as const,
              props: { headline: "Legacy hero", imageUrl: LEGACY_URL },
            },
          ],
        },
      ],
    };
    expect(PageAstSchema.safeParse(legacy).success).toBe(true);
  });

  it("collects the referenced asset identity and owning block", () => {
    const ast = pageWithHeroMedia();
    expect(collectMediaAssetIds(ast)).toEqual([ASSET_ID]);
    expect(collectMediaReferences(ast)).toEqual([
      { assetId: ASSET_ID, blockId: "blk_hero", field: "image", alt: null },
    ]);
  });
});

describe("render-time resolution of a media identity", () => {
  const media = {
    [ASSET_ID]: {
      assetId: ASSET_ID,
      url: ASSET_URL,
      fileName: "hero.png",
      width: 800,
      height: 600,
    },
  };

  it("resolves the asset identity to its public URL and alt text", () => {
    expect(
      resolveMediaImage({
        reference: { kind: "asset", assetId: ASSET_ID },
        legacyUrl: undefined,
        legacyAlt: undefined,
        media,
      })
    ).toEqual({
      url: ASSET_URL,
      alt: "hero.png",
      fileName: "hero.png",
      width: 800,
      height: 600,
    });
  });

  it("renders nothing when the referenced asset is unavailable", () => {
    expect(
      resolveMediaImage({
        reference: { kind: "asset", assetId: "ma_missing" },
        legacyUrl: LEGACY_URL,
        legacyAlt: "Legacy",
        media,
      })
    ).toBeNull();
  });

  it("prefers the asset identity over a legacy URL", () => {
    expect(
      resolveMediaImage({
        reference: { kind: "asset", assetId: ASSET_ID },
        legacyUrl: LEGACY_URL,
        legacyAlt: "Legacy",
        media,
      })?.url
    ).toBe(ASSET_URL);
  });

  it("still renders a legacy URL when no identity exists", () => {
    expect(
      resolveMediaImage({
        reference: undefined,
        legacyUrl: LEGACY_URL,
        legacyAlt: "Legacy",
        media,
      })
    ).toMatchObject({ url: LEGACY_URL, alt: "Legacy" });
  });
});
