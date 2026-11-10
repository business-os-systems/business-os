"use client";

import type { ReactNode } from "react";
import { PLATFORM_CAPABILITIES } from "@suite/core";
import { usePlatformAuth } from "@/components/auth/auth-provider";
import {
  CapabilityDeniedView,
  PlatformViewState,
} from "@/components/states/view-state";
import { hasPlatformCapability } from "@/lib/capability";
import { CatalogsProvider } from "./catalogs-context";
import { useCatalogs } from "./use-catalogs";

/**
 * Catalogs hub layout (H-1/H-3). The catalog list is fetched once here and
 * shared with every panel through context, so switching catalogs never
 * refetches it (H-3.11). Each panel is its own route (H-3.2).
 */
export default function CatalogsLayout({
  children,
}: {
  readonly children: ReactNode;
}) {
  const { session } = usePlatformAuth();
  const capabilities = session?.capabilities;
  const allowed = hasPlatformCapability(
    capabilities,
    PLATFORM_CAPABILITIES.CATALOGS_MANAGE.code,
  );
  const resource = useCatalogs({ enabled: allowed });

  if (!allowed) {
    return (
      <CapabilityDeniedView message="Your operator account cannot manage reference catalogs." />
    );
  }
  if (resource.problem !== null) {
    return (
      <PlatformViewState
        state={{
          kind: "error",
          problem: resource.problem,
          onRetry: resource.reload,
        }}
      />
    );
  }
  if (resource.catalogs === null) {
    return (
      <PlatformViewState
        state={{ kind: "loading", label: "Loading reference catalogs..." }}
      />
    );
  }

  return (
    <CatalogsProvider
      value={{
        catalogs: resource.catalogs,
        applyValue: resource.applyValue,
        reload: resource.reload,
      }}
    >
      {children}
    </CatalogsProvider>
  );
}
