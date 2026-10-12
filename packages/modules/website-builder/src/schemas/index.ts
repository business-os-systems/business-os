import { z } from "zod";

/**
 * Public contract version of the Website Builder module
 */
export const WEBSITE_BUILDER_MODULE_VERSION = "0.1.0" as const;

/**
 * Core AST Block Schema stub for S1-1 scaffold
 */
export const AstBlockSchema = z.object({
  id: z.string().uuid(),
  type: z.string().min(1),
  props: z.record(z.unknown()).default({}),
  children: z.array(z.string().uuid()).default([]),
});

export type AstBlock = z.infer<typeof AstBlockSchema>;
