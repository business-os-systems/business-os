import { PLATFORM_CAPABILITIES } from "@suite/core";
import { redis } from "@suite/redis";
import { getControlSessionSecret } from "../../lib/platform-env.js";
import { getPlatformPrismaClient } from "../../lib/platform-db.js";
import {
  createAdminFlagsService,
  type AdminFlagsService,
} from "./flags.service.js";

/**
 * Composition root for the Platform flags router. The transport never builds
 * the platform database or Redis clients itself; it receives this runtime and
 * only validates, calls the service and maps the response (AGENTS 5.4 P2).
 */
export interface AdminFlagsRuntime {
  readonly service: AdminFlagsService;
  readonly platformClient: ReturnType<typeof getPlatformPrismaClient>;
  readonly redisClient: typeof redis;
  readonly controlSessionSecret: string;
  readonly capability: (typeof PLATFORM_CAPABILITIES.FLAGS_MANAGE)["code"];
}

export function composeAdminFlagsRuntime(): AdminFlagsRuntime {
  const platformClient = getPlatformPrismaClient();
  return {
    service: createAdminFlagsService(platformClient),
    platformClient,
    redisClient: redis,
    controlSessionSecret: getControlSessionSecret(),
    capability: PLATFORM_CAPABILITIES.FLAGS_MANAGE.code,
  };
}
