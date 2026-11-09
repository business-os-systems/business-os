"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { Badge } from "@suite/ui";
import { ArrowRightIcon } from "@suite/ui/icons";
import { hasPermission } from "@suite/core";
import {
  defaultDashboardOverviewConfig,
  type DashboardOverviewConfig,
} from "./dashboard.config";
import {
  loadInstalledApps,
  toAppLauncherCards,
  type AppLauncherCard,
} from "./overview-apps";

export type { AppLauncherCard } from "./overview-apps";

export interface OverviewPageProps {
  initialApps?: AppLauncherCard[];
  installedAppIds?: string[];
  organizationId?: string;
  userPermissions?: readonly string[];
  config?: DashboardOverviewConfig;
}

const DEFAULT_APPS: AppLauncherCard[] = [];

function installedAppsEndpoint(organizationId?: string): string {
  return organizationId
    ? `/api/v1/organizations/${organizationId}/installed-apps`
    : "/api/v1/installed-apps";
}

function readInstalledAppIds(installedIdsKey: string): readonly string[] | undefined {
  return installedIdsKey === "" ? undefined : installedIdsKey.split(",");
}

export default function OverviewPage({
  initialApps = DEFAULT_APPS,
  installedAppIds,
  organizationId,
  userPermissions,
  config,
}: OverviewPageProps = {}) {
  const [apps, setApps] = useState<AppLauncherCard[]>(initialApps);
  const [loading, setLoading] = useState(initialApps.length === 0);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [resolvedPermissions, setResolvedPermissions] = useState<
    readonly string[] | undefined
  >(userPermissions);

  const installedIdsKey = installedAppIds ? installedAppIds.join(",") : "";

  useEffect(() => {
    if (userPermissions) {
      setResolvedPermissions(userPermissions);
    }
  }, [userPermissions]);

  useEffect(() => {
    if (initialApps.length > 0) {
      setApps(initialApps);
      setLoading(false);
      return;
    }

    let isMounted = true;
    async function loadInstalled() {
      try {
        const result = await loadInstalledApps(
          installedAppsEndpoint(organizationId)
        );
        if (result.kind === "error") {
          if (isMounted) {
            setLoadError(result.message);
          }
          return;
        }
        if (
          result.payload.userPermissions !== undefined &&
          !userPermissions
        ) {
          setResolvedPermissions(result.payload.userPermissions);
        }
        if (isMounted) {
          setApps(
            toAppLauncherCards(
              result.payload.apps,
              readInstalledAppIds(installedIdsKey)
            )
          );
          setLoadError(null);
        }
      } catch (error) {
        if (isMounted) {
          setLoadError(
            error instanceof Error
              ? error.message
              : "Unable to load installed applications."
          );
          console.error(
            "[OverviewDashboard] Failed to load installed applications:",
            error
          );
        }
      } finally {
        if (isMounted) setLoading(false);
      }
    }

    void loadInstalled();
    return () => {
      isMounted = false;
    };
  }, [initialApps, installedIdsKey, organizationId, userPermissions]);

  const effectivePermissions = userPermissions ?? resolvedPermissions;

  // Pure capability-based filtering (Principle VIII)
  const authorizedApps = apps.filter((app) => {
    if (effectivePermissions === undefined) return true;
    const requiredPermission = app.permission;
    if (!requiredPermission) return true;
    return hasPermission(effectivePermissions, requiredPermission);
  });

  const title = config?.title ?? defaultDashboardOverviewConfig.title;
  const subtitle = config?.subtitle ?? defaultDashboardOverviewConfig.subtitle;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl sm:text-2xl font-bold font-heading tracking-tight text-text">
          {title}
        </h1>
        <p className="text-xs sm:text-sm text-text-secondary mt-1">
          {subtitle}
        </p>
      </div>

      {authorizedApps.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border p-8 text-center bg-surface">
          {loadError === null ? (
            <p className="text-xs sm:text-sm text-text-secondary">
              {loading
                ? "Loading installed applications..."
                : "No applications installed for this workspace."}
            </p>
          ) : (
            <p role="alert" className="text-xs sm:text-sm text-danger">
              {loadError}
            </p>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {authorizedApps.map((app) => {
            const Icon = app.icon;

            const cardInner = (
              <>
                <div className="flex items-center justify-between gap-2">
                  <div
                    className={`flex h-8 w-8 items-center justify-center rounded-lg flex-shrink-0 transition-colors ${
                      app.isAvailable
                        ? "bg-brand-tint text-brand group-hover:bg-brand group-hover:text-white"
                        : "bg-surface-hover text-text-muted"
                    }`}
                  >
                    <Icon className="h-4 w-4" />
                  </div>
                  <Badge
                    variant={app.isAvailable ? "default" : "secondary"}
                    className="text-[10px] py-0 px-1.5 font-medium flex-shrink-0"
                  >
                    {app.status}
                  </Badge>
                </div>

                <div className="mt-3 flex-1">
                  <h2 className="text-sm font-semibold text-text truncate group-hover:text-brand transition-colors">
                    {app.title}
                  </h2>
                  <p className="text-xs text-text-secondary leading-relaxed line-clamp-2 mt-1">
                    {app.desc}
                  </p>
                </div>

                {app.isAvailable ? (
                  <div className="flex items-center text-xs font-medium text-brand group-hover:text-brand-hover gap-1 pt-3 mt-auto">
                    <span>Open Application</span>
                    <ArrowRightIcon className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
                  </div>
                ) : (
                  <div className="flex items-center text-xs font-medium text-text-muted gap-1 pt-3 mt-auto">
                    <span>Coming Soon</span>
                  </div>
                )}
              </>
            );

            if (app.isAvailable) {
              return (
                <Link
                  key={app.code}
                  href={app.href}
                  className="group relative flex flex-col justify-between p-4 rounded-xl border border-border bg-surface hover:border-brand/40 hover:shadow-2xs transition-all duration-150 min-h-[148px]"
                >
                  {cardInner}
                </Link>
              );
            }

            return (
              <div
                key={app.code}
                className="relative flex flex-col justify-between p-4 rounded-xl border border-border bg-surface/60 opacity-70 cursor-not-allowed min-h-[148px]"
              >
                {cardInner}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
