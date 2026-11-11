import { hasPermission } from "@suite/core";
import { resolveEffectivePermissions } from "@/services/effective-permissions.service";
import { readWebsiteBuilderInstallation } from "@/services/website-builder-entitlement.service";
import type { WebsiteBuilderDenialReason } from "@/components/layout/website-builder-nav.config";

/** The session fields the entitlement gate is allowed to trust. */
export interface WebsiteBuilderActor {
  readonly userId: string;
  readonly organizationId: string;
  readonly permissions?: readonly string[];
  readonly activeBranchId?: string;
}

export type WebsiteBuilderAccess =
  | { readonly kind: "granted"; readonly permissions: readonly string[] }
  | { readonly kind: "denied"; readonly reason: WebsiteBuilderDenialReason };

function describeError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function denied(reason: WebsiteBuilderDenialReason): WebsiteBuilderAccess {
  return { kind: "denied", reason };
}

/**
 * Fail-closed application gate. The tenant identity comes only from the
 * authenticated session; no header or query parameter is consulted.
 */
export async function evaluateWebsiteBuilderAccess(input: {
  readonly actor: WebsiteBuilderActor;
  readonly capability: string;
}): Promise<WebsiteBuilderAccess> {
  const installation = await readWebsiteBuilderInstallation(
    input.actor.organizationId
  );
  if (installation === "unavailable") {
    return denied("entitlements_unavailable");
  }
  if (installation === "not_installed") {
    return denied("app_not_installed");
  }

  let permissions: readonly string[];
  try {
    permissions = await resolveEffectivePermissions(input.actor);
  } catch (error) {
    console.error("Website Builder capability resolution failed:", describeError(error));
    return denied("entitlements_unavailable");
  }

  if (!hasPermission(permissions, input.capability)) {
    return denied("capability_denied");
  }
  return { kind: "granted", permissions };
}
