import { prisma, Prisma } from "@suite/db";
import { ConflictError, NotFoundError } from "@suite/core/errors";
import { invalidateFlagCache } from "@suite/flags";
import { redis } from "@suite/redis";
import type { CreateFlagBodySchema, UpdateFlagBodySchema } from "../routes/schemas/admin-flags.schema.js";
import type { z } from "@hono/zod-openapi";

export type CreateFlagInput = z.infer<typeof CreateFlagBodySchema>;
export type UpdateFlagInput = z.infer<typeof UpdateFlagBodySchema>;

export interface FlagRecord {
  id: string;
  key: string;
  name: string;
  description: string | null;
  environment: string;
  isEnabled: boolean;
  defaultEnabled: boolean;
  version: number;
  metadata: Record<string, unknown> | null;
  createdAt: string;
  updatedAt: string;
}

function serializeFlag(flag: {
  id: string;
  key: string;
  name: string;
  description: string | null;
  environment: string;
  isEnabled: boolean;
  defaultEnabled: boolean;
  version: number;
  metadata: unknown;
  createdAt: Date;
  updatedAt: Date;
}): FlagRecord {
  return {
    id: flag.id,
    key: flag.key,
    name: flag.name,
    description: flag.description,
    environment: flag.environment,
    isEnabled: flag.isEnabled,
    defaultEnabled: flag.defaultEnabled,
    version: flag.version,
    metadata: (flag.metadata as Record<string, unknown>) ?? null,
    createdAt: flag.createdAt.toISOString(),
    updatedAt: flag.updatedAt.toISOString(),
  };
}

async function writeAuditLog(options: {
  flagId: string;
  flagKey: string;
  environment: string;
  actorUserId?: string;
  actorEmail?: string;
  previousState: Prisma.InputJsonValue;
  newState: Prisma.InputJsonValue;
  reason?: string;
}): Promise<void> {
  await prisma.featureFlagAuditLog.create({
    data: {
      flagId: options.flagId,
      flagKey: options.flagKey,
      environment: options.environment,
      actorUserId: options.actorUserId ?? null,
      actorEmail: options.actorEmail ?? null,
      source: "API",
      previousState: options.previousState,
      newState: options.newState,
      reason: options.reason ?? null,
    },
  });
}

/**
 * Service layer for super-admin feature flag administration.
 * Encapsulates all CRUD, optimistic concurrency, audit logging, and cache invalidation.
 */
export class AdminFlagsService {
  async listFlags(environment?: string): Promise<FlagRecord[]> {
    const flags = await prisma.featureFlag.findMany({
      where: environment ? { environment } : undefined,
      orderBy: [{ environment: "asc" }, { key: "asc" }],
    });

    return flags.map(serializeFlag);
  }

  async createFlag(
    input: CreateFlagInput,
    actor: { userId?: string; email?: string }
  ): Promise<FlagRecord> {
    const environment = input.environment ?? "development";

    const flag = await prisma.featureFlag.create({
      data: {
        key: input.key,
        name: input.name,
        description: input.description ?? null,
        environment,
        isEnabled: input.isEnabled ?? true,
        defaultEnabled: input.defaultEnabled ?? false,
        metadata: (input.metadata ?? {}) as Prisma.InputJsonValue,
      },
    });

    const flagSnapshot = serializeFlag(flag) as unknown as Prisma.InputJsonValue;

    await writeAuditLog({
      flagId: flag.id,
      flagKey: flag.key,
      environment: flag.environment,
      actorUserId: actor.userId,
      actorEmail: actor.email,
      previousState: {},
      newState: flagSnapshot,
      reason: "Flag created via Admin API",
    });

    await invalidateFlagCache(redis, environment, input.key);

    return serializeFlag(flag);
  }

  async updateFlag(
    key: string,
    input: UpdateFlagInput,
    actor: { userId?: string; email?: string }
  ): Promise<FlagRecord> {
    const existing = await prisma.featureFlag.findFirst({ where: { key } });

    if (!existing) {
      throw new NotFoundError(`Feature flag with key '${key}' does not exist.`, {
        code: "FLAG_NOT_FOUND",
      });
    }

    if (existing.version !== input.expectedVersion) {
      throw new ConflictError(
        `Optimistic concurrency conflict: expected version ${input.expectedVersion} but current version is ${existing.version}. Reload the flag and retry.`,
        { code: "FLAG_VERSION_CONFLICT" }
      );
    }

    const patch: {
      isEnabled?: boolean;
      defaultEnabled?: boolean;
      description?: string;
      version: number;
    } = {
      version: existing.version + 1,
    };

    if (input.isEnabled !== undefined) {
      patch.isEnabled = input.isEnabled;
    }
    if (input.defaultEnabled !== undefined) {
      patch.defaultEnabled = input.defaultEnabled;
    }
    if (input.description !== undefined) {
      patch.description = input.description;
    }

    const updated = await prisma.featureFlag.update({
      where: { id: existing.id },
      data: patch,
    });

    await writeAuditLog({
      flagId: updated.id,
      flagKey: updated.key,
      environment: updated.environment,
      actorUserId: actor.userId,
      actorEmail: actor.email,
      previousState: serializeFlag(existing) as unknown as Prisma.InputJsonValue,
      newState: serializeFlag(updated) as unknown as Prisma.InputJsonValue,
      reason: input.reason,
    });

    await invalidateFlagCache(redis, updated.environment, updated.key);

    return serializeFlag(updated);
  }
}

export const adminFlagsService = new AdminFlagsService();
