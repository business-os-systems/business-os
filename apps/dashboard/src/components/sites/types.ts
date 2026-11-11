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
