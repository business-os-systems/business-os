import { redirect } from "next/navigation";
import { WEBSITE_BUILDER_HUB_ROOT } from "@/components/layout/website-builder-nav.config";

/** The application overview moved to the /websites hub. */
export default function SitesPage() {
  redirect(WEBSITE_BUILDER_HUB_ROOT);
}
