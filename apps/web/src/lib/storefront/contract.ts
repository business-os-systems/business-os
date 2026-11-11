import { z } from "zod";
import { AppearanceTokensSchema } from "@suite/website-builder/appearance";
import { MediaAssetMapSchema, PageAstSchema } from "@suite/website-builder/ast";

/**
 * Wire contract for the anonymous storefront read endpoints (T054).
 * Strict schemas reject tenant identifiers and draft fields outright.
 */

export const storefrontResolveSchema = z
  .object({
    title: z.string().min(1),
    status: z.literal("PUBLISHED"),
    homePath: z.string().startsWith("/"),
    defaultLocale: z.string().min(1),
    theme: z.object({ tokens: AppearanceTokensSchema }).strict(),
  })
  .strict();

export const storefrontPageSchema = z
  .object({
    title: z.string().min(1),
    path: z.string().startsWith("/"),
    ast: PageAstSchema,
    media: MediaAssetMapSchema,
    tokens: AppearanceTokensSchema,
  })
  .strict();

export type StorefrontPage = z.infer<typeof storefrontPageSchema>;
