"use client";

import type { ReactNode } from "react";
import { usePathname } from "next/navigation";
import { Alert, Button, Spinner, ThemeToggle } from "@suite/ui";
import { LogOutIcon } from "@suite/ui/icons";
import { usePlatformAuth } from "@/components/auth/auth-provider";
import {
  canAccessPath,
  visibleNavigationGroups,
} from "./navigation.config";
import { isPlatformHubRoute } from "./hub-routes";
import { PlatformSidebar } from "./platform-sidebar";
import {
  PlatformHubMobileSwitcher,
  PlatformHubNavSidebar,
} from "./platform-hub-nav";
import { SupportSessionMarker } from "./support-session-marker";

export function PlatformShell({ children }: { children: ReactNode }) {
  const { session, loading, error, signOutFailed, refresh, signOut, forceSignOut } =
    usePlatformAuth();
  const pathname = usePathname();

  if (loading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-background">
        <Spinner size="lg" />
      </main>
    );
  }

  if (error !== null) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-background p-6">
        <div className="w-full max-w-md space-y-4">
          <Alert
            variant="error"
            title={signOutFailed ? "Sign out failed" : "Unable to load Platform"}
            message={error}
          />
          {signOutFailed ? (
            <Button fullWidth variant="secondary" onClick={forceSignOut}>
              Sign out on this device
            </Button>
          ) : null}
          <Button fullWidth onClick={() => void refresh()}>
            Retry
          </Button>
        </div>
      </main>
    );
  }

  if (session === null) {
    return null;
  }

  const pathnameValue = pathname ?? "/";
  const groups = visibleNavigationGroups(session.capabilities);
  const allowed = canAccessPath(session.capabilities, pathnameValue);

  // The shell owns the viewport so the document cannot scroll; only <main> does.
  return (
    <div className="fixed inset-0 flex h-dvh w-full overflow-hidden bg-background text-text">
      <PlatformSidebar
        groups={groups}
        pathname={pathnameValue}
        collapsed={isPlatformHubRoute(pathnameValue)}
      />
      <PlatformHubNavSidebar
        pathname={pathnameValue}
        capabilities={session.capabilities}
        allowed={allowed}
      />

      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <header className="flex h-12 w-full items-center justify-between border-b border-border bg-surface-container-lowest px-3 sm:px-5">
          <div className="flex flex-col leading-tight">
            <span className="text-xs font-semibold text-on-surface">
              {session.operator.displayName}
            </span>
            <span className="text-[10px] font-medium text-on-surface-variant">
              Platform operator
            </span>
          </div>
          <div className="flex items-center gap-2 sm:gap-3">
            <div className="hidden text-right leading-tight md:flex md:flex-col">
              <span className="max-w-[180px] truncate text-xs font-semibold text-on-surface">
                {session.operator.email}
              </span>
              <span className="text-[10px] font-medium text-on-surface-variant">
                {session.capabilities.length} capabilities
              </span>
            </div>
            <ThemeToggle />
            <Button
              variant="ghost"
              size="sm"
              onClick={() => void signOut()}
              className="h-7 gap-1.5 px-2 text-xs text-text-muted hover:bg-danger/10 hover:text-danger"
              title="Sign out"
            >
              <LogOutIcon className="h-4 w-4" />
              <span className="hidden sm:inline">Sign Out</span>
            </Button>
          </div>
        </header>
        <PlatformHubMobileSwitcher
          pathname={pathnameValue}
          capabilities={session.capabilities}
          allowed={allowed}
        />
        <SupportSessionMarker />
        <main className="flex min-h-0 flex-1 flex-col overflow-y-auto p-4 md:p-6">
          {allowed ? (
            children
          ) : (
            <div className="mx-auto w-full max-w-md pt-10">
              <Alert
                variant="error"
                title="Access denied"
                message="Your operator account does not have the capability required for this page."
              />
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
