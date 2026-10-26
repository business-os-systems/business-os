import type { PrismaClient } from "@suite/db";
import type { Redis } from "@suite/redis";
import {
  isPlatformCapability,
  type PlatformCapability,
} from "@suite/core";

export const PLATFORM_CAPABILITY_CACHE_TTL_SECONDS = 60;
export const PLATFORM_CAPABILITY_CACHE_PREFIX = "platform:capabilities:";

export function platformCapabilityCacheKey(operatorId: string): string {
  return `${PLATFORM_CAPABILITY_CACHE_PREFIX}${operatorId}`;
}

export interface ResolvePlatformCapabilitiesInput {
  readonly prisma: PrismaClient;
  readonly redis: Redis;
  readonly operatorId: string;
}

export interface InvalidatePlatformCapabilitiesInput {
  readonly redis: Redis;
  readonly operatorId: string;
}

function parseCachedCapabilities(raw: string): readonly PlatformCapability[] | null {
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      return null;
    }
    return parsed.filter(
      (value): value is PlatformCapability =>
        typeof value === "string" && isPlatformCapability(value)
    );
  } catch {
    console.warn("[platform-capabilities] ignoring invalid cache payload");
    return null;
  }
}

export async function resolvePlatformCapabilities(
  input: ResolvePlatformCapabilitiesInput
): Promise<readonly PlatformCapability[]> {
  const key = platformCapabilityCacheKey(input.operatorId);

  let cached: string | null = null;
  try {
    cached = await input.redis.get(key);
  } catch {
    console.warn("[platform-capabilities] cache read failed, using database");
  }

  if (cached !== null) {
    const parsed = parseCachedCapabilities(cached);
    if (parsed !== null) {
      return parsed;
    }
  }

  const rows = await input.prisma.operatorCapability.findMany({
    where: { operatorId: input.operatorId, revokedAt: null },
    select: { capability: true },
  });
  const capabilities = Array.from(
    new Set(
      rows
        .map((row) => row.capability)
        .filter((capability) => isPlatformCapability(capability))
    )
  );

  try {
    await input.redis.set(
      key,
      JSON.stringify(capabilities),
      "EX",
      PLATFORM_CAPABILITY_CACHE_TTL_SECONDS
    );
  } catch {
    console.warn("[platform-capabilities] cache write failed");
  }

  return capabilities;
}

export async function invalidatePlatformCapabilities(
  input: InvalidatePlatformCapabilitiesInput
): Promise<void> {
  await input.redis.del(platformCapabilityCacheKey(input.operatorId));
}
