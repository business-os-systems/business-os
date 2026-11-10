import { APP_MANIFESTS, getAppManifest, type AppManifest } from "@suite/core";

export const DEFAULT_MANIFEST_APP_ID = "website-builder";

export interface InstalledAppSettings {
  // String-only map: the snapshot is persisted directly as Prisma JSON.
  readonly [key: string]: string;
  readonly code: string;
  readonly name: string;
  readonly title: string;
  readonly href: string;
  readonly iconName: string;
  readonly description: string;
  readonly permission: string;
  readonly installedBy: string;
}

export interface ResolvedAppSettings {
  readonly manifest: AppManifest | undefined;
  readonly settings: InstalledAppSettings;
}

function buildManifestSettings(
  manifest: AppManifest | undefined,
  appId: string,
  userId: string
): InstalledAppSettings {
  if (manifest) {
    return {
      code: manifest.code,
      name: manifest.name,
      title: manifest.title,
      href: manifest.href,
      iconName: manifest.iconKey,
      description: manifest.description,
      permission: manifest.permission,
      installedBy: userId,
    };
  }
  return {
    code: "App 01",
    name: appId,
    title: appId,
    href: `/${appId}`,
    iconName: "sites",
    description: "Launch and manage application environment.",
    permission: `${appId}:read`,
    installedBy: userId,
  };
}

/** Resolves an app manifest (falling back to the platform starter app) and the
 * settings snapshot persisted on the tenant's InstalledApp row. */
export function buildInstalledAppSettings(appId: string, userId: string): ResolvedAppSettings {
  const manifest = getAppManifest(appId) ?? APP_MANIFESTS[DEFAULT_MANIFEST_APP_ID];
  return { manifest, settings: buildManifestSettings(manifest, appId, userId) };
}
