import { z } from "zod";
import type { PlatformCapability } from "../constants/platform-capabilities.js";

export const platformOperatorSchema = z.object({
  id: z.string(),
  email: z.string().email(),
  displayName: z.string(),
});

export const platformSessionViewSchema = z.object({
  operator: platformOperatorSchema,
  capabilities: z.array(z.custom<PlatformCapability>()),
});

export const platformBootstrapOptionsSchema = z.object({
  flowId: z.string(),
  options: z.record(z.string(), z.unknown()),
  email: z.string().email(),
});

export const platformSignInOptionsSchema = z.object({
  flowId: z.string(),
  options: z.record(z.string(), z.unknown()),
});

export type PlatformOperatorView = z.infer<typeof platformOperatorSchema>;
export type PlatformSessionView = z.infer<typeof platformSessionViewSchema>;
export type PlatformBootstrapOptions = z.infer<
  typeof platformBootstrapOptionsSchema
>;
export type PlatformSignInOptions = z.infer<
  typeof platformSignInOptionsSchema
>;
