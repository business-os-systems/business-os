import { PERMISSIONS } from "@suite/core";
import { workspacePath } from "@/lib/workspace-paths";

export interface StudioSiteLink {
  readonly id: "settings" | "domains" | "inquiries" | "redirects";
  readonly label: string;
  readonly segment: string;
  readonly capability: string;
}

/**
 * Site-level destinations reachable from inside the studio (FR-082). Appearance
 * and review are part of the studio top bar; these four are their own routes.
 * Every destination names the capability that opens it (H-3.6).
 */
export const STUDIO_SITE_LINKS: readonly StudioSiteLink[] = [
  {
    id: "settings",
    label: "Site settings",
    segment: "settings",
    capability: PERMISSIONS.WEBSITE_BUILDER.SITES_READ,
  },
  {
    id: "domains",
    label: "Domains",
    segment: "domains",
    capability: PERMISSIONS.WEBSITE_BUILDER.SITES_READ,
  },
  {
    id: "inquiries",
    label: "Enquiries",
    segment: "inquiries",
    capability: PERMISSIONS.WEBSITE_BUILDER.LEADS_READ,
  },
  {
    id: "redirects",
    label: "Redirects",
    segment: "redirects",
    capability: PERMISSIONS.WEBSITE_BUILDER.PAGES_READ,
  },
];

/** Ids arrive from route params, so every helper encodes them once (FR-081). */
export function studioHomePath(siteId: string): string {
  return workspacePath("/sites/" + encodeURIComponent(siteId) + "/studio");
}

export function studioPagePath(siteId: string, pageId: string): string {
  return workspacePath(
    "/sites/" + encodeURIComponent(siteId) + "/studio/" + encodeURIComponent(pageId)
  );
}

export function studioSiteLinkPath(siteId: string, segment: string): string {
  return workspacePath("/sites/" + encodeURIComponent(siteId) + "/" + segment);
}

export function studioReviewPath(siteId: string): string {
  return studioSiteLinkPath(siteId, "review");
}

export function studioPreviewPath(siteId: string, pageId: string): string {
  return workspacePath(
    "/sites/" + encodeURIComponent(siteId) + "/preview/" + encodeURIComponent(pageId)
  );
}
