import { prisma } from "@suite/db";

/** Canonical identifier of the Website Builder application (App 01). */
export const WEBSITE_BUILDER_APP_ID = "website-builder" as const;

export type WebsiteBuilderInstallationState =
  | "installed"
  | "not_installed"
  | "unavailable";

function describeError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * Reads the tenant's installation of the Website Builder. InstalledApp lives on
 * the platform plane: the tenant identity has no grant on public.installed_apps
 * (DB-2), so this existence check reads through the root client and always
 * filters by the verified session's organization. A failed read is
 * "unavailable", never "installed" (FR-013).
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
    console.error(
      "Website Builder installation read failed:",
      describeError(error)
    );
    return "unavailable";
  }
}
