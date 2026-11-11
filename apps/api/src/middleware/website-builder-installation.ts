import type { MiddlewareHandler } from "hono";
import { PLATFORM_ERROR_CODE, PLATFORM_ERROR_CODES } from "@suite/core";
import { ForbiddenError, ServiceUnavailableError } from "@suite/core/errors";
import {
  readWebsiteBuilderInstallation,
  type WebsiteBuilderInstallationState,
} from "../services/cms/installation-reader.js";
import { readTenantActor } from "./tenant-capability.js";

export interface WebsiteBuilderInstallationGuardOptions {
  readonly readInstallation: (
    organizationId: string
  ) => Promise<WebsiteBuilderInstallationState>;
}

const DEFAULT_OPTIONS: WebsiteBuilderInstallationGuardOptions = {
  readInstallation: readWebsiteBuilderInstallation,
};

/**
 * Tenant-application gate for the CMS administration routes. It sits beside
 * requireAuth, so the workspace is always the verified session's and an
 * installation read that fails cannot grant access (FR-013, fail closed).
 */
export function createWebsiteBuilderInstallationGuard(
  options: WebsiteBuilderInstallationGuardOptions = DEFAULT_OPTIONS
): MiddlewareHandler {
  return async (c, next) => {
    const actor = readTenantActor(c);
    const installation = await options.readInstallation(actor.organizationId);

    if (installation === "unavailable") {
      throw new ServiceUnavailableError(
        "Website Builder entitlements could not be verified.",
        {
          code: PLATFORM_ERROR_CODE.DEPENDENCY_UNAVAILABLE,
          title: PLATFORM_ERROR_CODES.DEPENDENCY_UNAVAILABLE.title,
        }
      );
    }
    if (installation === "not_installed") {
      throw new ForbiddenError(
        "The Website Builder application is not installed for this workspace.",
        {
          code: PLATFORM_ERROR_CODE.APP_NOT_INSTALLED,
          title: PLATFORM_ERROR_CODES.APP_NOT_INSTALLED.title,
        }
      );
    }

    await next();
  };
}
