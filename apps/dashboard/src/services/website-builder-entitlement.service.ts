import { prisma } from "@suite/db";
import { WEBSITE_BUILDER_APP_ID } from "@/components/layout/website-builder-nav.config";

export type WebsiteBuilderInstallationState =
  | "installed"
  | "not_installed"
  | "unavailable";

function describeError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * Reads the tenant's installation of the Website Builder. A failed read is
 * "unavailable", never "installed": the caller denies in every non-installed
 * state (FR-013, fail closed).
 */
export async function readWebsiteBuilderInstallation(
  organizationId: string
): Promise<WebsiteBuilderInstallationState> {
  try {
    const installation = await prisma.installedApp.findFirst({
      where: {
        organizationId,
        appId: WEBSITE_BUILDER_APP_ID,
        isEnabled: true,
      },
      select: { id: true },
    });
    return installation === null ? "not_installed" : "installed";
  } catch (error) {
    console.error("Website Builder entitlement read failed:", describeError(error));
    return "unavailable";
  }
}
