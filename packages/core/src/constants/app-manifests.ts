/**
 * Canonical Application Manifests Registry (@suite/core)
 *
 * Defines the single source of truth for modular application metadata,
 * including display titles, routes, icons, descriptions, and required permissions.
 * Persisted directly into `InstalledApp.settings` in PostgreSQL at install/seed time.
 */

export interface AppManifest {
  appId: string;
  name: string;
  title: string;
  code: string;
  version: string;
  href: string;
  iconName: string;
  description: string;
  permission: string;
  category?: string;
  capabilities?: ReadonlyArray<{
    action: string;
    description: string;
  }>;
}

export const APP_MANIFESTS: Record<string, AppManifest> = {
  "website-builder": {
    appId: "website-builder",
    name: "Website Builder",
    title: "Website Builder & Headless CMS",
    code: "App 01",
    version: "1.0.0",
    href: "/sites",
    iconName: "sites",
    description:
      "Visual canvas studio, section blueprints, responsive device preview, and edge storefront delivery.",
    permission: "cms:sites:read",
    capabilities: [
      {
        action: "cms:sites:read",
        description: "View published and draft website sites",
      },
      {
        action: "cms:sites:write",
        description: "Create and modify websites and custom domains",
      },
      {
        action: "cms:pages:read",
        description: "View pages and draft visual canvas revisions",
      },
      {
        action: "cms:pages:write",
        description: "Edit canvas pages, layout blocks, and SEO tags",
      },
      {
        action: "cms:publish",
        description: "Publish website revisions to edge live production",
      },
    ],
  },
};

/**
 * Returns canonical app manifest metadata for an application identifier.
 */
export function getAppManifest(appId: string): AppManifest | undefined {
  return APP_MANIFESTS[appId];
}
