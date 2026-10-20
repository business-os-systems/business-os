import { redirect } from "next/navigation";

/**
 * Settings root route redirects immediately to the primary general settings tab
 * via server-side redirect, eliminating client-side flash and double navigation.
 */
export default function SettingsRootPage(): never {
  redirect("/settings/general");
}
