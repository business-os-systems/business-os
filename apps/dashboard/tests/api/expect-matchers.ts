import { expect } from "vitest";

/**
 * Typed wrapper around expect.objectContaining for partial assertions.
 * The matcher itself is untyped at runtime; returning unknown keeps the
 * surrounding expectations free of implicit any.
 */
export function partiallyMatches(value: Record<string, unknown>): unknown {
  return expect.objectContaining(value) as unknown;
}
