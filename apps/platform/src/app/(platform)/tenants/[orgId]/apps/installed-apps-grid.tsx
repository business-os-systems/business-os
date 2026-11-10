"use client";

import Link from "next/link";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Checkbox,
} from "@suite/ui";
import { ArrowRightIcon, PackageIcon } from "@suite/ui/icons";
import { getAppManifest } from "@suite/core";
import { PlatformViewState } from "@/components/states/view-state";
import { appDisplayTitle, type TenantEntitlement } from "@/lib/apps-api";

const APPLICATIONS_CONSOLE_HREF = "/apps";

function InstalledAppTile({
  entitlement,
  canManage,
  isPending,
  onToggle,
}: {
  readonly entitlement: TenantEntitlement;
  readonly canManage: boolean;
  readonly isPending: boolean;
  readonly onToggle: (app: TenantEntitlement, enabled: boolean) => void;
}) {
  const manifest = getAppManifest(entitlement.appId);
  return (
    <li className="rounded-lg border border-border bg-surface p-3">
      <div className="flex items-start gap-2">
        <div className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-md bg-brand-tint text-brand">
          <PackageIcon className="h-4 w-4" />
        </div>
        <div className="min-w-0 flex-1 space-y-1">
          <p className="truncate text-sm font-semibold text-text">
            {appDisplayTitle(entitlement.appId)}
          </p>
          <p className="font-mono text-[11px] text-text-muted">
            {entitlement.appId}
          </p>
          {manifest === undefined ? null : (
            <p className="text-xs text-text-secondary">{manifest.description}</p>
          )}
          <div className="flex items-center justify-between gap-2 pt-1">
            <span
              className={
                entitlement.isEnabled
                  ? "text-[11px] font-semibold text-success"
                  : "text-[11px] font-semibold text-text-secondary"
              }
            >
              {entitlement.isEnabled ? "Enabled" : "Disabled"}
            </span>
            <Checkbox
              label="Enabled"
              aria-label={`Enable ${appDisplayTitle(entitlement.appId)}`}
              checked={entitlement.isEnabled}
              disabled={!canManage || isPending}
              onChange={(event) =>
                onToggle(entitlement, event.target.checked)
              }
            />
          </div>
        </div>
      </div>
    </li>
  );
}

function AppsHeader({ canManage }: { readonly canManage: boolean }) {
  return (
    <CardHeader>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <CardTitle className="text-base">Installed apps</CardTitle>
          <p className="mt-1 text-sm text-text-secondary">
            Enable or disable an installed app for this tenant. The tenant
            navigation reflects the change without a redeployment.
          </p>
        </div>
        {canManage ? (
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
  );
}

export function InstalledAppsGrid({
  entitlements,
  canManageEntitlements,
  pendingAppId,
  onToggle,
}: {
  readonly entitlements: readonly TenantEntitlement[];
  readonly canManageEntitlements: boolean;
  readonly pendingAppId: string | null;
  readonly onToggle: (app: TenantEntitlement, enabled: boolean) => void;
}) {
  return (
    <Card>
      <AppsHeader canManage={canManageEntitlements} />
      <CardContent>
        {entitlements.length === 0 ? (
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
            {entitlements.map((entitlement) => (
              <InstalledAppTile
                key={entitlement.appId}
                entitlement={entitlement}
                canManage={canManageEntitlements}
                isPending={pendingAppId === entitlement.appId}
                onToggle={onToggle}
              />
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
