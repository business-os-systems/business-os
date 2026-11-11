import { redirect } from "next/navigation";
import { workspacePath } from "@/lib/workspace-paths";

export default async function SitePagesRedirect({
  params,
}: {
  params: Promise<{ siteId: string }>;
}) {
  const { siteId } = await params;
  redirect(workspacePath("/sites/" + siteId + "/studio"));
}
