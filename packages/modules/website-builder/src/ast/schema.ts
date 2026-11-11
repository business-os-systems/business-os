import { z } from "zod";

/**
 * Strict Zod Schemas for Website Builder Abstract Syntax Tree (AST)
 * Zero-eval security: strictly rejects unknown fields and unsafe link protocols.
 */

/**
 * AstIdSchema permits standard UUIDs (from Postgres/DB persistence) as well as
 * semantic prefixed IDs (e.g. b_hero_123, sec_nav, fld_email) created in editor canvas.
 */
export const AstIdSchema = z.string().min(1).max(100);

// Safe URL regex: permits relative paths (/...), http, https, mailto, tel. Rejects javascript:, data:, etc.
export const SafeUrlSchema = z
  .string()
  .trim()
  .refine(
    (url) => {
      if (url.startsWith("/") || url.startsWith("#")) return true;
      try {
        const parsed = new URL(url);
        return ["http:", "https:", "mailto:", "tel:"].includes(parsed.protocol);
      } catch {
        return false;
      }
    },
    {
      message:
        "URL must be a relative path or use http, https, mailto, or tel protocol.",
    }
  );

export const LinkTargetSchema = z
  .object({
    url: SafeUrlSchema,
    isExternal: z.boolean().optional(),
    openInNewTab: z.boolean().optional(),
    rel: z.string().optional(),
  })
  .strict();

export const ResponsiveVisibilitySchema = z
  .object({
    hideOnMobile: z.boolean().optional(),
    hideOnTablet: z.boolean().optional(),
    hideOnDesktop: z.boolean().optional(),
  })
  .strict();

export const BlockStyleTokensSchema = z
  .object({
    backgroundColor: z.string().optional(),
    textColor: z.string().optional(),
    paddingTop: z.number().min(0).max(500).optional(),
    paddingBottom: z.number().min(0).max(500).optional(),
    paddingLeft: z.number().min(0).max(500).optional(),
    paddingRight: z.number().min(0).max(500).optional(),
    marginTop: z.number().min(-100).max(500).optional(),
    marginBottom: z.number().min(-100).max(500).optional(),
    borderRadius: z.number().min(0).max(100).optional(),
    borderWidth: z.number().min(0).max(50).optional(),
    borderColor: z.string().optional(),
    textAlign: z.enum(["left", "center", "right", "justify"]).optional(),
    customClassName: z.string().max(100).optional(),
  })
  .strict();

export const SectionStyleTokensSchema = BlockStyleTokensSchema.extend({
  maxWidth: z.enum(["sm", "md", "lg", "xl", "2xl", "full"]).optional(),
  backgroundImageUrl: SafeUrlSchema.optional(),
  backgroundOverlayColor: z.string().optional(),
  backgroundRepeat: z.enum(["no-repeat", "repeat", "repeat-x", "repeat-y"]).optional(),
  backgroundSize: z.enum(["cover", "contain", "auto"]).optional(),
}).strict();

/**
 * Media references are identity-first. The asset variant carries only the
 * workspace asset id (plus an optional sub-key and alt text); no URL is copied
 * into the AST. The url variant keeps blocks authored before the media library.
 */
const MediaAssetIdSchema = z
  .string()
  .min(1)
  .max(64)
  .regex(/^[A-Za-z0-9_-]+$/, "Asset ids contain letters, digits, hyphens and underscores only.");

export const MediaReferenceSchema = z.discriminatedUnion("kind", [
  z
    .object({
      kind: z.literal("asset"),
      assetId: MediaAssetIdSchema,
      subKey: z.string().max(64).optional(),
      alt: z.string().max(200).optional(),
    })
    .strict(),
  z.object({ kind: z.literal("url"), url: SafeUrlSchema }).strict(),
]);

const HttpMediaUrlSchema = z
  .string()
  .url()
  .refine((value) => {
    const protocol = new URL(value).protocol;
    return protocol === "http:" || protocol === "https:";
  }, "Media URLs must use the http or https scheme.");

/** The render-time asset projection; URLs are server-issued, never AST data. */
export const MediaAssetResolutionSchema = z
  .object({
    assetId: MediaAssetIdSchema,
    url: HttpMediaUrlSchema,
    fileName: z.string().min(1).max(255),
    width: z.number().int().positive().nullable(),
    height: z.number().int().positive().nullable(),
  })
  .strict();

export const MediaAssetMapSchema = z.record(MediaAssetResolutionSchema);

// 1. Hero Block Schema
export const HeroBlockPropsSchema = z
  .object({
    badge: z.string().max(60).optional(),
    headline: z.string().min(1).max(250),
    subheadline: z.string().max(1000).optional(),
    primaryCta: z
      .object({
        label: z.string().min(1).max(60),
        target: LinkTargetSchema,
      })
      .optional(),
    secondaryCta: z
      .object({
        label: z.string().min(1).max(60),
        target: LinkTargetSchema,
      })
      .optional(),
    image: MediaReferenceSchema.optional(),
    imageUrl: SafeUrlSchema.optional(),
    imageAlt: z.string().max(200).optional(),
    imagePosition: z.enum(["right", "left", "bottom", "background"]).optional(),
  })
  .strict();

export const HeroBlockAstSchema = z
  .object({
    id: AstIdSchema,
    type: z.literal("hero"),
    props: HeroBlockPropsSchema,
    styles: BlockStyleTokensSchema.optional(),
  })
  .strict();

// 2. Features Grid Block Schema
export const FeatureItemSchema = z
  .object({
    id: AstIdSchema,
    iconName: z.string().max(60).optional(),
    title: z.string().min(1).max(120),
    description: z.string().max(600),
    link: LinkTargetSchema.optional(),
  })
  .strict();

export const FeaturesBlockPropsSchema = z
  .object({
    headline: z.string().max(250).optional(),
    subheadline: z.string().max(1000).optional(),
    columns: z.union([z.literal(2), z.literal(3), z.literal(4)]).optional(),
    features: z.array(FeatureItemSchema).max(24),
  })
  .strict();

export const FeaturesBlockAstSchema = z
  .object({
    id: AstIdSchema,
    type: z.literal("features"),
    props: FeaturesBlockPropsSchema,
    styles: BlockStyleTokensSchema.optional(),
  })
  .strict();

// 3. Pricing Table Block Schema
export const PricingTierFeatureSchema = z
  .object({
    text: z.string().min(1).max(150),
    included: z.boolean(),
  })
  .strict();

export const PricingTierItemSchema = z
  .object({
    id: AstIdSchema,
    name: z.string().min(1).max(80),
    description: z.string().max(300).optional(),
    priceAmount: z.number().min(0),
    currency: z.string().length(3),
    interval: z.enum(["month", "year", "one-time"]),
    isFeatured: z.boolean().optional(),
    badge: z.string().max(40).optional(),
    cta: z.object({
      label: z.string().min(1).max(60),
      target: LinkTargetSchema,
    }),
    features: z.array(PricingTierFeatureSchema).max(20),
  })
  .strict();

export const PricingBlockPropsSchema = z
  .object({
    headline: z.string().max(250).optional(),
    subheadline: z.string().max(1000).optional(),
    tiers: z.array(PricingTierItemSchema).min(1).max(6),
  })
  .strict();

export const PricingBlockAstSchema = z
  .object({
    id: AstIdSchema,
    type: z.literal("pricing"),
    props: PricingBlockPropsSchema,
    styles: BlockStyleTokensSchema.optional(),
  })
  .strict();

// 4. Form Block Schema
export const FormFieldItemSchema = z
  .object({
    id: AstIdSchema,
    name: z.string().min(1).max(60).regex(/^[a-zA-Z0-9_]+$/),
    label: z.string().min(1).max(100),
    type: z.enum(["text", "email", "tel", "textarea", "select", "checkbox"]),
    placeholder: z.string().max(100).optional(),
    required: z.boolean().optional(),
    options: z.array(z.string().max(100)).max(50).optional(),
  })
  .strict();

export const FormBlockPropsSchema = z
  .object({
    headline: z.string().max(250).optional(),
    subheadline: z.string().max(1000).optional(),
    formId: AstIdSchema,
    submitButtonText: z.string().max(60).optional(),
    successMessage: z.string().max(300).optional(),
    errorMessage: z.string().max(300).optional(),
    fields: z.array(FormFieldItemSchema).min(1).max(25),
  })
  .strict();

export const FormBlockAstSchema = z
  .object({
    id: AstIdSchema,
    type: z.literal("form"),
    props: FormBlockPropsSchema,
    styles: BlockStyleTokensSchema.optional(),
  })
  .strict();

// 5. FAQ Block Schema
export const FaqItemSchema = z
  .object({
    id: AstIdSchema,
    question: z.string().min(1).max(300),
    answer: z.string().min(1).max(3000),
  })
  .strict();

export const FaqBlockPropsSchema = z
  .object({
    headline: z.string().max(250).optional(),
    subheadline: z.string().max(1000).optional(),
    items: z.array(FaqItemSchema).min(1).max(30),
  })
  .strict();

export const FaqBlockAstSchema = z
  .object({
    id: AstIdSchema,
    type: z.literal("faq"),
    props: FaqBlockPropsSchema,
    styles: BlockStyleTokensSchema.optional(),
  })
  .strict();

// 6. Rich Text Block Schema
export const RichTextBlockPropsSchema = z
  .object({
    contentHtml: z.string().max(100000),
  })
  .strict();

export const RichTextBlockAstSchema = z
  .object({
    id: AstIdSchema,
    type: z.literal("rich-text"),
    props: RichTextBlockPropsSchema,
    styles: BlockStyleTokensSchema.optional(),
  })
  .strict();

// 7. Navbar Block Schema
export interface NavItemType {
  id: string;
  label: string;
  target: z.infer<typeof LinkTargetSchema>;
  children?: NavItemType[];
}

export const NavItemSchema: z.ZodType<NavItemType> = z.lazy(() =>
  z
    .object({
      id: AstIdSchema,
      label: z.string().min(1).max(60),
      target: LinkTargetSchema,
      children: z.array(NavItemSchema).max(10).optional(),
    })
    .strict()
);


export const NavbarBlockPropsSchema = z
  .object({
    logo: MediaReferenceSchema.optional(),
    logoUrl: SafeUrlSchema.optional(),
    logoText: z.string().max(60).optional(),
    items: z.array(NavItemSchema).max(12),
    ctaButton: z
      .object({
        label: z.string().min(1).max(60),
        target: LinkTargetSchema,
      })
      .optional(),
  })
  .strict();

export const NavbarBlockAstSchema = z
  .object({
    id: AstIdSchema,
    type: z.literal("navbar"),
    props: NavbarBlockPropsSchema,
    styles: BlockStyleTokensSchema.optional(),
  })
  .strict();

// 8. Footer Block Schema
export const FooterColumnSchema = z
  .object({
    id: AstIdSchema,
    title: z.string().min(1).max(60),
    links: z
      .array(
        z
          .object({
            id: AstIdSchema,
            label: z.string().min(1).max(60),
            target: LinkTargetSchema,
          })
          .strict()
      )
      .max(12),
  })
  .strict();

export const FooterBlockPropsSchema = z
  .object({
    logo: MediaReferenceSchema.optional(),
    logoUrl: SafeUrlSchema.optional(),
    logoText: z.string().max(60).optional(),
    copyrightText: z.string().max(120).optional(),
    columns: z.array(FooterColumnSchema).max(6),
    socialLinks: z
      .array(
        z
          .object({
            platform: z.enum([
              "twitter",
              "facebook",
              "instagram",
              "linkedin",
              "github",
            ]),
            url: SafeUrlSchema,
          })
          .strict()
      )
      .max(10)
      .optional(),
  })
  .strict();

export const FooterBlockAstSchema = z
  .object({
    id: AstIdSchema,
    type: z.literal("footer"),
    props: FooterBlockPropsSchema,
    styles: BlockStyleTokensSchema.optional(),
  })
  .strict();

// Discriminated Union of all Block AST types
export const BlockAstSchema = z.discriminatedUnion("type", [
  HeroBlockAstSchema,
  FeaturesBlockAstSchema,
  PricingBlockAstSchema,
  FormBlockAstSchema,
  FaqBlockAstSchema,
  RichTextBlockAstSchema,
  NavbarBlockAstSchema,
  FooterBlockAstSchema,
]);

// Section AST Schema
export const SectionAstSchema = z
  .object({
    id: AstIdSchema,
    name: z.string().max(100).optional(),
    visibility: ResponsiveVisibilitySchema.optional(),
    styles: SectionStyleTokensSchema.optional(),
    blocks: z.array(BlockAstSchema).max(50),
  })
  .strict();

// Root Page AST Schema
export const PageAstSchema = z
  .object({
    version: z.literal(1),
    schemaVersion: z.literal("2026-03"),
    meta: z
      .object({
        title: z.string().max(200).optional(),
        description: z.string().max(500).optional(),
        keywords: z.array(z.string().max(50)).max(30).optional(),
        ogImageUrl: SafeUrlSchema.optional(),
      })
      .strict()
      .optional(),
    globalStyles: z
      .object({
        fontFamily: z.string().max(80).optional(),
        primaryColor: z.string().max(40).optional(),
        backgroundColor: z.string().max(40).optional(),
        textColor: z.string().max(40).optional(),
      })
      .strict()
      .optional(),
    sections: z.array(SectionAstSchema).max(100),
  })
  .strict();
