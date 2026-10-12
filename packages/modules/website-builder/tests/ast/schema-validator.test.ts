import { describe, it, expect } from "vitest";
import {
  validatePageAst,
  validateBlockAst,
  validateSectionAst,
  type PageAst,
  type BlockAst,
} from "../../src/ast/index.js";

describe("AST Schema Definition & Safe Zod Validator", () => {
  const validHeroBlock: BlockAst = {
    id: "550e8400-e29b-41d4-a716-446655440000",
    type: "hero",
    props: {
      headline: "Welcome to Mountain Luxury Resort",
      subheadline: "Experience world-class hospitality in the heart of nature.",
      primaryCta: {
        label: "Book Your Stay",
        target: { url: "/booking" },
      },
      imageUrl: "https://assets.business-os.site/hero.jpg",
      imagePosition: "right",
    },
    styles: {
      paddingTop: 48,
      paddingBottom: 48,
      textAlign: "center",
    },
  };

  const validFeaturesBlock: BlockAst = {
    id: "660e8400-e29b-41d4-a716-446655440001",
    type: "features",
    props: {
      headline: "Resort Amenities",
      columns: 3,
      features: [
        {
          id: "770e8400-e29b-41d4-a716-446655440002",
          title: "Heated Infinity Pool",
          description: "Panoramic mountain view pool open year-round.",
        },
      ],
    },
  };

  const validPricingBlock: BlockAst = {
    id: "880e8400-e29b-41d4-a716-446655440003",
    type: "pricing",
    props: {
      headline: "Seasonal Suites",
      tiers: [
        {
          id: "990e8400-e29b-41d4-a716-446655440004",
          name: "Deluxe Pine Suite",
          priceAmount: 250,
          currency: "USD",
          interval: "month",
          cta: {
            label: "Reserve",
            target: { url: "https://booking.example.com" },
          },
          features: [{ text: "King Bed", included: true }],
        },
      ],
    },
  };

  it("successfully validates a complete Page AST payload", () => {
    const validPage: PageAst = {
      version: 1,
      schemaVersion: "2026-03",
      meta: {
        title: "Mountain Luxury Resort & Spa",
        description: "Official site of Mountain Luxury Resort",
      },
      globalStyles: {
        primaryColor: "#0f172a",
        fontFamily: "Inter, sans-serif",
      },
      sections: [
        {
          id: "110e8400-e29b-41d4-a716-446655440010",
          name: "Hero Section",
          styles: { maxWidth: "xl" },
          blocks: [validHeroBlock],
        },
        {
          id: "220e8400-e29b-41d4-a716-446655440020",
          name: "Features & Pricing Section",
          blocks: [validFeaturesBlock, validPricingBlock],
        },
      ],
    };

    const result = validatePageAst(validPage);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.sections).toHaveLength(2);
      expect(result.data.sections[0]!.blocks[0]!.type).toBe("hero");
    }
  });

  it("validates individual blocks correctly", () => {
    const heroResult = validateBlockAst(validHeroBlock);
    expect(heroResult.success).toBe(true);

    const featuresResult = validateBlockAst(validFeaturesBlock);
    expect(featuresResult.success).toBe(true);
  });

  it("rejects malicious javascript: URLs in CTA targets", () => {
    const maliciousBlock = {
      id: "550e8400-e29b-41d4-a716-446655440000",
      type: "hero",
      props: {
        headline: "Malicious Hero",
        primaryCta: {
          label: "Click Me",
          target: { url: "javascript:alert(document.cookie)" },
        },
      },
    };

    const result = validateBlockAst(maliciousBlock);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.errorCode).toBe("INVALID_AST_PAYLOAD");
      expect(result.errors.some((e) => e.path.includes("primaryCta.target.url"))).toBe(
        true
      );
    }
  });

  it("rejects unknown properties due to strict schema evaluation", () => {
    const pollutedBlock = {
      ...validHeroBlock,
      __proto__: { injected: "bad" },
      evilExtraField: "should_fail",
    };

    const result = validateBlockAst(pollutedBlock);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.errorCode).toBe("INVALID_AST_PAYLOAD");
      expect(result.errors.some((e) => e.code === "unrecognized_keys")).toBe(true);
    }
  });

  it("rejects unknown block types gracefully via discriminated union", () => {
    const unknownBlock = {
      id: "550e8400-e29b-41d4-a716-446655440000",
      type: "unsupported-cryptominer-block",
      props: {},
    };

    const result = validateBlockAst(unknownBlock);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.errorCode).toBe("INVALID_AST_PAYLOAD");
    }
  });

  it("validates section AST and responsive visibility flags", () => {
    const section = {
      id: "330e8400-e29b-41d4-a716-446655440030",
      visibility: {
        hideOnMobile: true,
        hideOnTablet: false,
      },
      blocks: [validHeroBlock],
    };

    const result = validateSectionAst(section);
    expect(result.success).toBe(true);
  });
});
