"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Alert, Button, Spinner, ThemeToggle } from "@suite/ui";
import { LayersIcon, LogOutIcon } from "@suite/ui/icons";
import { usePlatformAuth } from "@/components/auth/auth-provider";
import {
  canAccessPath,
  isNavigationHrefActive,
  PLATFORM_NAV_GROUPS,
  visibleNavigation,
} from "./navigation.config";
import { PLATFORM_NAV_ICONS } from "./icon-registry";

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
  const navigation = visibleNavigation(session.capabilities);
  const allowed = canAccessPath(session.capabilities, pathnameValue);

  // The shell owns the viewport so the document cannot scroll; only <main> does.
  return (
    <div className="fixed inset-0 flex h-dvh w-full overflow-hidden bg-background text-text">
      <aside className="flex w-52 flex-col border-r border-border bg-surface sm:w-56">
        <div className="flex h-12 flex-shrink-0 items-center gap-2.5 border-b border-border bg-surface px-3.5">
          <div className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-md bg-brand-tint text-brand shadow-2xs">
            <LayersIcon className="h-4 w-4" />
          </div>
          <div className="flex flex-col overflow-hidden leading-tight">
            <span className="truncate text-xs font-bold tracking-tight text-text">
              Business OS
            </span>
            <span className="truncate text-[10px] font-medium text-text-muted">
              Platform Control
            </span>
          </div>
        </div>

        <nav className="flex-1 space-y-1 overflow-y-auto p-2.5" aria-label="Platform">
          {PLATFORM_NAV_GROUPS.map((group) => {
            const groupItems = navigation.filter(
              (item) => item.group === group.id
            );
            if (groupItems.length === 0) return null;
            return (
              <div key={group.id}>
                <div className="px-3 pb-1.5 pt-0.5 text-[10px] font-semibold uppercase tracking-wider text-text-muted">
                  {group.label}
                </div>
                {groupItems.map((item) => {
                  const active = isNavigationHrefActive(
                    pathnameValue,
                    item.href
                  );
                  const Icon = PLATFORM_NAV_ICONS[item.icon];
                  return (
                    <Link
                      key={item.id}
                      href={item.href}
                      prefetch={false}
                      className={`group relative flex min-h-[38px] items-center gap-3 rounded-lg px-3 py-2 text-xs transition-colors sm:text-[13px] ${
                        active
                          ? "bg-brand-tint/70 font-semibold text-brand shadow-2xs before:absolute before:bottom-2 before:left-0 before:top-2 before:w-1 before:rounded-r-sm before:bg-brand"
                          : "font-medium text-text-secondary hover:bg-surface-hover hover:text-text"
                      }`}
                    >
                      <Icon
                        className={`h-4 w-4 flex-shrink-0 transition-colors ${
                          active
                            ? "text-brand"
                            : "text-text-muted group-hover:text-text"
                        }`}
                      />
                      <span className="truncate">{item.label}</span>
                    </Link>
                  );
                })}
              </div>
            );
          })}
        </nav>
      </aside>

      <div className="flex flex-1 flex-col overflow-hidden">
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
