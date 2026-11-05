import type { Context } from "hono";
import {
  createPlatformCapabilityGuard,
  type PlatformCapabilityGuardOptions,
} from "../../middleware/platform-capability.js";

/**
 * One lazy guard per router. The options factory runs on the first request so
 * importing the router does not require the Platform environment or a database
 * connection at module load.
 */
export function createLazyCapabilityGuard(
  createOptions: () => PlatformCapabilityGuardOptions
): () => ReturnType<typeof createPlatformCapabilityGuard> {
  let guard: ReturnType<typeof createPlatformCapabilityGuard> | null = null;
  return () => {
    guard ??= createPlatformCapabilityGuard(createOptions());
    return guard;
  };
}

export function readRequestId(c: Context): string {
  const value = c.get("requestId");
  return typeof value === "string" ? value : "unknown";
}
