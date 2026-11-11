import { workspacePath } from "@/lib/workspace-paths";

export interface StudioSiteLink {
  readonly id: string;
  readonly label: string;
  readonly segment: string;
}

/** Site-level destinations reachable inside the studio (FR-082). */
export const STUDIO_SITE_LINKS: readonly StudioSiteLink[] = [
  { id: "review", label: "Review & publish", segment: "review" },
  { id: "settings", label: "Site settings", segment: "settings" },
  { id: "domains", label: "Domains", segment: "domains" },
  { id: "appearance", label: "Appearance", segment: "appearance" },
  { id: "inquiries", label: "Enquiries", segment: "inquiries" },
  { id: "redirects", label: "Redirects", segment: "redirects" },
];

export function studioHomePath(siteId: string): string {
  return workspacePath("/sites/" + siteId + "/studio");
}

export function studioPagePath(siteId: string, pageId: string): string {
  return workspacePath("/sites/" + siteId + "/studio/" + pageId);
}

export function studioSiteLinkPath(siteId: string, segment: string): string {
  return workspacePath("/sites/" + siteId + "/" + segment);
}
