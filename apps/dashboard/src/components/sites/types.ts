export interface SiteSummary {
  id: string;
  organizationId: string;
  name: string;
  subdomain: string;
  customDomain?: string | null;
  status: "DRAFT" | "PUBLISHED" | "ARCHIVED";
  publishedAt?: string | null;
  pagesCount: number;
  updatedAt: string;
}

export interface PageSummary {
  id: string;
  siteId: string;
  name: string;
  slug: string;
  isHome: boolean;
  status: "DRAFT" | "PUBLISHED" | "ARCHIVED";
  version: number;
  updatedAt: string;
}
