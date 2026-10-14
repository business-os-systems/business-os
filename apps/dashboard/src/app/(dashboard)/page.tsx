"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import {
  Card,
  CardHeader,
  CardTitle,
  CardContent,
  Button,
  Badge,
} from "@suite/ui";
import { resolveAppIcon } from "@/lib/app-registry";

export interface AppLauncherCard {
  title: string;
  code: string;
  desc: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  status: "Available" | "Coming Soon";
  isAvailable: boolean;
  accent?: "primary" | "secondary" | "tertiary";
}

export interface OverviewPageProps {
  initialApps?: AppLauncherCard[];
  installedAppIds?: string[];
  organizationId?: string;
}

const DEFAULT_APPS: AppLauncherCard[] = [];

export default function OverviewPage({
  initialApps = DEFAULT_APPS,
  installedAppIds,
  organizationId,
}: OverviewPageProps = {}) {
  const [apps, setApps] = useState<AppLauncherCard[]>(initialApps);
  const [loading, setLoading] = useState(initialApps.length === 0);

  const installedIdsKey = installedAppIds ? installedAppIds.join(",") : "";

  useEffect(() => {
    if (initialApps.length > 0) {
      setApps(initialApps);
      setLoading(false);
      return;
    }

    let isMounted = true;
    async function loadInstalled() {
      try {
        const endpoint = organizationId
          ? `/api/v1/organizations/${organizationId}/installed-apps`
          : "/api/v1/installed-apps";
        const res = await fetch(endpoint);
        if (res.ok) {
          const data = await res.json();
          const list = Array.isArray(data.apps)
            ? data.apps
            : data.installedApps || [];
          if (isMounted && Array.isArray(list)) {
            const installedSet = installedIdsKey
              ? new Set(installedIdsKey.split(","))
              : null;
            setApps(
              list.map(
                (a: {
                  appId: string;
                  title: string;
                  code: string;
                  description: string;
                  href: string;
                  iconName?: string;
                }) => {
                  const isAvailable = installedSet
                    ? installedSet.has(a.appId)
                    : true;
                  return {
                    title: a.title,
                    code: a.code,
                    desc: a.description,
                    href: a.href,
                    icon: resolveAppIcon(a.iconName || a.appId),
                    status: isAvailable
                      ? ("Available" as const)
                      : ("Coming Soon" as const),
                    isAvailable,
                  };
                },
              ),
            );
          }
        }
      } catch {
        // Fallback silently if offline
      } finally {
        if (isMounted) setLoading(false);
      }
    }

    loadInstalled();
    return () => {
      isMounted = false;
    };
  }, [initialApps, installedIdsKey, organizationId]);

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold font-heading tracking-tight text-on-surface">
          Executive App Launcher
        </h1>
        <p className="text-sm text-on-surface-variant mt-1">
          Welcome to your Business OS workspace. Select an installed module to
          launch its environment.
        </p>
      </div>

      {apps.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border-hairline p-8 text-center">
          <p className="text-sm text-on-surface-variant">
            {loading
              ? "Loading installed applications..."
              : "No applications installed for this workspace."}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {apps.map((app) => {
            const Icon = app.icon;
            return (
              <Card
                key={app.code}
                className="hover:shadow-md transition-shadow border-border-hairline bg-surface-container-lowest"
              >
                <CardHeader className="flex flex-row items-center justify-between pb-2">
                  <div className="flex items-center gap-3">
                    <div
                      className={`p-2.5 rounded-lg ${
                        app.isAvailable
                          ? "bg-surface-brand-tint text-primary"
                          : "bg-surface-container text-outline"
                      }`}
                    >
                      <Icon className="h-6 w-6" />
                    </div>
                    <div>
                      <CardTitle className="text-base font-semibold font-heading text-on-surface">
                        {app.title}
                      </CardTitle>
                    </div>
                  </div>
                  <Badge
                    variant={app.isAvailable ? "default" : "secondary"}
                    className="text-xs font-semibold"
                  >
                    {app.status}
                  </Badge>
                </CardHeader>
                <CardContent className="space-y-4 pt-2">
                  <p className="text-xs text-on-surface-variant leading-relaxed">
                    {app.desc}
                  </p>
                  {app.isAvailable ? (
                    <Link href={app.href} className="inline-block">
                      <Button
                        variant="default"
                        size="sm"
                        className="bg-primary hover:bg-brand-hover text-white text-xs font-medium"
                      >
                        Open Application
                      </Button>
                    </Link>
                  ) : (
                    <Button
                      variant="outline"
                      size="sm"
                      disabled
                      className="opacity-60 cursor-not-allowed text-xs"
                    >
                      Coming Soon
                    </Button>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
