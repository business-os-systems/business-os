import { redirect } from "next/navigation";
import { workspacePath } from "@/lib/workspace-paths";

/**
 * Settings root route redirects immediately to the primary general settings tab
 * via server-side redirect, eliminating client-side flash and double navigation.
 */
export default function SettingsRootPage(): never {
  redirect(workspacePath("/settings/general"));
}
