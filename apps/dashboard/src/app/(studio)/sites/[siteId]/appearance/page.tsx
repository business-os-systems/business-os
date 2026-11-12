import { redirect } from "next/navigation";
import { studioHomePath } from "@/components/studio/studio-links.config";

export interface AppearancePageProps {
  readonly params: Promise<{ readonly siteId: string }>;
}

/**
 * Appearance editing moved into the studio body (FR-151, T152). The old
 * address stays a real route so a bookmark lands on the editable site instead
 * of a 404; the studio top bar owns the appearance surface.
 */
export default async function AppearancePage({ params }: AppearancePageProps) {
  const { siteId } = await params;
  redirect(studioHomePath(siteId));
}
