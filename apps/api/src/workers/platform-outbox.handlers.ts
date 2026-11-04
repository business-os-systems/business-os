import type { PrismaClient } from "@suite/db";
import type {
  PlatformOutboxEvent,
  PlatformOutboxHandlers,
  Redis,
} from "@suite/redis";
import {
  PLATFORM_ERROR_CODE,
  TENANT_LIFECYCLE_EVENT_TYPES,
  tenantLifecycleEventSchema,
} from "@suite/core";
import { NotFoundError, ValidationError } from "@suite/core/errors";
import { logger } from "@suite/logger";
import { invalidateTenantAccessStatus } from "../services/admin/tenant-access.service.js";
import { notifyTenantRestored } from "../services/admin/tenant-notify.service.js";
import { readTenantOverview } from "../services/admin/tenant-view.service.js";

export interface PlatformOutboxHandlerOptions {
  readonly prisma: PrismaClient;
  readonly redis: Redis;
}

/**
 * Reacts to a committed lifecycle change: the tenant access cache is dropped so
 * the next tenant request sees the new state immediately (R15), and a restore
 * also notifies the tenant's administrators (FR-018). A payload that does not
 * match the published contract is refused rather than guessed at, so the
 * dispatcher retries it and a malformed event never half-applies.
 */
export function createPlatformOutboxHandlers(
  options: PlatformOutboxHandlerOptions
): PlatformOutboxHandlers {
  const handleLifecycleChange = async (
    event: PlatformOutboxEvent
  ): Promise<void> => {
    const parsed = tenantLifecycleEventSchema.safeParse(event.payload);
    if (!parsed.success) {
      throw new ValidationError(
        `Event ${event.id} (${event.eventType}) does not match the lifecycle event contract.`,
        [{ name: "payload", reason: "Contract validation failed" }],
        { code: PLATFORM_ERROR_CODE.VALIDATION_FAILED }
      );
    }
    const payload = parsed.data;

    await invalidateTenantAccessStatus(options.redis, payload.organizationId);

    if (payload.type !== "platform.tenant.restored") {
      return;
    }

    const tenant = await readTenantOverview(options.prisma, payload.organizationId);
    if (tenant === null) {
      throw new NotFoundError(
        `Cannot notify a restore for missing tenant ${payload.organizationId}.`,
        { code: PLATFORM_ERROR_CODE.TENANT_NOT_FOUND }
      );
    }

    const outcome = await notifyTenantRestored(options.prisma, {
      organizationId: payload.organizationId,
      organizationName: tenant.name,
      actorId: payload.actor.id,
      requestId: payload.correlationId,
    });

    logger.info(
      { organizationId: payload.organizationId, delivered: outcome.delivered },
      "Tenant administrators notified of the restore"
    );
  };

  return {
    [TENANT_LIFECYCLE_EVENT_TYPES.SUSPEND]: handleLifecycleChange,
    [TENANT_LIFECYCLE_EVENT_TYPES.RESTORE]: handleLifecycleChange,
    [TENANT_LIFECYCLE_EVENT_TYPES.ARCHIVE]: handleLifecycleChange,
  };
}
