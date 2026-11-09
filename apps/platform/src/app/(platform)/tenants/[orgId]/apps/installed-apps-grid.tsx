"use client";

import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@suite/ui";
import { ArrowRightIcon, PackageIcon } from "@suite/ui/icons";
import { getAppManifest } from "@suite/core";
import { PlatformViewState } from "@/components/states/view-state";
import { appDisplayTitle } from "@/lib/apps-api";

const APPLICATIONS_CONSOLE_HREF = "/apps";

function InstalledAppTile({ appId }: { readonly appId: string }) {
  const manifest = getAppManifest(appId);
  return (
    <li className="rounded-lg border border-border bg-surface p-3">
      <div className="flex items-start gap-2">
        <div className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-md bg-brand-tint text-brand">
          <PackageIcon className="h-4 w-4" />
        </div>
        <div className="min-w-0 space-y-1">
          <p className="truncate text-sm font-semibold text-text">
            {appDisplayTitle(appId)}
          </p>
          <p className="font-mono text-[11px] text-text-muted">{appId}</p>
          {manifest === undefined ? null : (
            <p className="text-xs text-text-secondary">{manifest.description}</p>
          )}
          <p className="text-[11px] font-medium text-text-secondary">Installed</p>
        </div>
      </div>
    </li>
  );
}

export function InstalledAppsGrid({
  apps,
  canManageEntitlements,
}: {
  readonly apps: readonly string[];
  readonly canManageEntitlements: boolean;
}) {
  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <CardTitle className="text-base">Installed apps</CardTitle>
            <p className="mt-1 text-sm text-text-secondary">
              Entitlements are read-only here. Changes are made in the
              Applications console.
            </p>
          </div>
          {canManageEntitlements ? (
            <Link
              href={APPLICATIONS_CONSOLE_HREF}
              prefetch={false}
              className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-border-strong bg-surface px-3 text-xs font-medium text-text hover:bg-surface-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring"
            >
              Applications console
              <ArrowRightIcon className="h-4 w-4" />
            </Link>
          ) : null}
        </div>
      </CardHeader>
      <CardContent>
        {apps.length === 0 ? (
          <PlatformViewState
            state={{
              kind: "empty",
              title: "No installed apps",
              description:
                "This tenant has no application installed. Entitlements are managed in the Applications console.",
            }}
          />
        ) : (
          <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {apps.map((appId) => (
              <InstalledAppTile key={appId} appId={appId} />
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
