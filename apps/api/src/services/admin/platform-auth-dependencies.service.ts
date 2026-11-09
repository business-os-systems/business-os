import {
  getPlatformPrismaClient,
  getPlatformRedis,
} from "../../lib/platform-db.js";
import {
  getControlPlaneOrigin,
  getControlSessionSecret,
  getControlWebauthnRpId,
} from "../../lib/platform-env.js";
import {
  PLATFORM_WEBAUTHN_RP_NAME,
  type PlatformAuthDependencies,
} from "./platform-auth.service.js";

/**
 * Composition for the operator passkey surface: identity, cache, signing key
 * and WebAuthn relying-party config in one place the route can pass through.
 */
export function platformAuthDependencies(): PlatformAuthDependencies {
  return {
    prisma: getPlatformPrismaClient(),
    redis: getPlatformRedis(),
    secret: getControlSessionSecret(),
    config: {
      rpID: getControlWebauthnRpId(),
      rpName: PLATFORM_WEBAUTHN_RP_NAME,
      origin: getControlPlaneOrigin(),
    },
  };
}
