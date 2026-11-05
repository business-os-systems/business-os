"use client";

import { PLATFORM_CAPABILITIES } from "@suite/core";
import { usePlatformAuth } from "@/components/auth/auth-provider";
import { SystemView } from "@/components/system/system-view";
import { useSystemTelemetry } from "@/components/system/use-system-telemetry";
import { hasPlatformCapability } from "@/lib/capability";

export default function PlatformSystemPage() {
  const { session } = usePlatformAuth();
  // The shell owns the denial; this only decides whether to poll at all.
  const allowed = hasPlatformCapability(
    session?.capabilities,
    PLATFORM_CAPABILITIES.TELEMETRY_READ.code
  );
  const telemetry = useSystemTelemetry({ enabled: allowed });

  return (
    <div className="max-w-5xl space-y-4">
      <header>
        <h1 className="text-2xl font-semibold">System</h1>
        <p className="mt-1 text-sm text-text-secondary">
          Dependency health, queue backlog and the deployed build for every
          running service. It refreshes every minute and never reports a
          dependency as healthy when it cannot be reached.
        </p>
      </header>
      <SystemView
        view={telemetry.view}
        isRefreshing={telemetry.isRefreshing}
        onRefresh={telemetry.refresh}
      />
    </div>
  );
}
