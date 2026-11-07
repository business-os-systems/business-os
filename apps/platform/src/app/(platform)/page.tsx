"use client";

import { PLATFORM_CAPABILITIES } from "@suite/core";
import { usePlatformAuth } from "@/components/auth/auth-provider";
import { OverviewView } from "@/components/system/overview-view";
import { useSystemTelemetry } from "@/components/system/use-system-telemetry";
import { hasPlatformCapability } from "@/lib/capability";

export default function PlatformOverviewPage() {
  const { session } = usePlatformAuth();
  // The shell owns the denial; this only decides whether to poll at all.
  const allowed = hasPlatformCapability(
    session?.capabilities,
    PLATFORM_CAPABILITIES.TELEMETRY_READ.code,
  );
  const telemetry = useSystemTelemetry({ enabled: allowed });

  return (
    <div className="max-w-full space-y-4">
      <header>
        <h1 className="text-2xl font-semibold">Platform overview</h1>
        <p className="mt-1 text-sm text-text-secondary">
          Whether the platform is healthy, which build is running and what background work is
          failing — refreshed automatically without a page reload.
        </p>
      </header>
      <OverviewView
        view={telemetry.view}
        isRefreshing={telemetry.isRefreshing}
        onRefresh={telemetry.refresh}
      />
    </div>
  );
}
