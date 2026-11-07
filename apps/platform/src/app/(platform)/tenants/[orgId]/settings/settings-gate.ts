import type { ViewState } from "@/components/states/view-state";
import type { TenantEntitlement } from "@/lib/apps-api";
import { useInstalledApps } from "./use-tenant-settings";

type SettingsGateKind = "error" | "loading" | "empty" | "ready";

type InstalledApps = ReturnType<typeof useInstalledApps>;

const SETTINGS_GATE_STATES = {
  error: (installed: InstalledApps): ViewState => ({
    kind: "error",
    problem: installed.problem ?? {
      status: null,
      title: "Request failed",
      detail: "The installed applications could not be read.",
      code: null,
      requestId: null,
      invalidParams: [],
    },
    onRetry: () => void installed.load(),
  }),
  loading: (): ViewState => ({
    kind: "loading",
    label: "Loading installed applications...",
  }),
  empty: (): ViewState => ({
    kind: "empty",
    title: "No configured application",
    description:
      "This tenant has no installed application with a declared settings schema.",
  }),
  ready: (): null => null,
} as const satisfies Record<
  SettingsGateKind,
  (installed: InstalledApps) => ViewState | null
>;

function settingsGateKind(
  installed: InstalledApps,
  apps: readonly TenantEntitlement[]
): SettingsGateKind {
  if (installed.problem !== null) return "error";
  if (installed.apps === null) return "loading";
  if (apps.length === 0) return "empty";
  return "ready";
}

export function settingsGateState(
  installed: InstalledApps,
  apps: readonly TenantEntitlement[]
): ViewState | null {
  return SETTINGS_GATE_STATES[settingsGateKind(installed, apps)](installed);
}
