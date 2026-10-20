import type { AppManifest } from "@suite/core";

export const WEBSITE_BUILDER_MANIFEST: AppManifest = {
  appId: "website-builder",
  name: "Website Builder",
  title: "Website Builder",
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
};
