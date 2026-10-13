"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { Card, CardHeader, CardTitle, CardContent, Button, Badge } from "@suite/ui";
import { KNOWN_APPS_CATALOG } from "@/lib/app-registry";

export interface AppLauncherCard {
  title: string;
  code: string;
  desc: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  status: "Available" | "Coming Soon";
  isAvailable: boolean;
}

export interface OverviewPageProps {
  installedAppIds?: string[];
  organizationId?: string;
}

export default function OverviewPage({
  installedAppIds,
  organizationId,
}: OverviewPageProps = {}) {
  const [activeInstalledIds, setActiveInstalledIds] = useState<string[]>(
    installedAppIds ?? ["website_builder"]
  );

  useEffect(() => {
    if (installedAppIds) {
      setActiveInstalledIds(installedAppIds);
      return;
    }

    if (!organizationId) return;

    let isMounted = true;
    async function loadInstalled() {
      try {
        const res = await fetch(`/api/v1/organizations/${organizationId}/installed-apps`);
        if (res.ok) {
          const data = await res.json();
          if (isMounted && Array.isArray(data.installedApps)) {
            setActiveInstalledIds(data.installedApps.map((a: { appId: string }) => a.appId));
          }
        }
      } catch {
        // Fallback silently if offline
      }
    }

    loadInstalled();
    return () => {
      isMounted = false;
    };
  }, [installedAppIds, organizationId]);

  const installedSet = new Set(activeInstalledIds);

  // Build dynamic catalog cards matching activation state
  const catalogEntries = Object.values(KNOWN_APPS_CATALOG);
  const cards: AppLauncherCard[] = catalogEntries.map((app) => {
    const isInstalled = installedSet.has(app.appId);
    return {
      title: app.title,
      code: app.code,
      desc: app.description,
      href: app.href,
      icon: app.icon,
      status: isInstalled ? "Available" : "Coming Soon",
      isAvailable: isInstalled,
    };
  });

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">
          Executive App Launcher
        </h1>
        <p className="text-sm text-slate-500 mt-1">
          Welcome to your Business OS workspace. Select an installed module to launch its environment.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {cards.map((app) => {
          const Icon = app.icon;
          return (
            <Card key={app.code} className="hover:shadow-md transition-shadow">
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <div className="flex items-center gap-3">
                  <div
                    className={`p-2 rounded-lg ${
                      app.isAvailable
                        ? "bg-blue-50 text-blue-600"
                        : "bg-slate-100 text-slate-400"
                    }`}
                  >
                    <Icon className="h-6 w-6" />
                  </div>
                  <div>
                    <CardTitle className="text-base font-semibold">{app.title}</CardTitle>
                    <Badge variant="secondary" className="text-[10px] mt-0.5">
                      {app.code}
                    </Badge>
                  </div>
                </div>
                <Badge
                  variant={app.isAvailable ? "default" : "secondary"}
                  className="text-xs"
                >
                  {app.status}
                </Badge>
              </CardHeader>
              <CardContent className="space-y-4 pt-2">
                <p className="text-xs text-slate-600 leading-relaxed">{app.desc}</p>
                {app.isAvailable ? (
                  <Link href={app.href} className="inline-block">
                    <Button variant="default" size="sm">
                      Open Application
                    </Button>
                  </Link>
                ) : (
                  <Button variant="outline" size="sm" disabled className="opacity-60 cursor-not-allowed">
                    Coming Soon
                  </Button>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
