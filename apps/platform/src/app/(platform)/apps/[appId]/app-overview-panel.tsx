"use client";

import type { ReactNode } from "react";
import { Badge, Card, CardContent, CardHeader, CardTitle } from "@suite/ui";
import {
  APP_CATALOG_AVAILABILITY_LABELS,
  appManifestVersion,
  type CatalogApp,
} from "@/lib/apps-api";
import { formatDateTime } from "@/lib/format";

function DefinitionRow({ label, value }: { readonly label: string; readonly value: ReactNode }) {
  return (
    <div className="grid grid-cols-1 gap-1 border-b border-border py-2 last:border-b-0 sm:grid-cols-3 sm:gap-3">
      <dt className="text-xs font-semibold uppercase tracking-wide text-text-muted">{label}</dt>
      <dd className="text-sm text-text sm:col-span-2">{value}</dd>
    </div>
  );
}

function missingValue(label: string) {
  return <span className="text-text-muted">{label}</span>;
}

export function AppOverviewPanel({ app }: { readonly app: CatalogApp }) {
  const applicationVersion = appManifestVersion(app.appId);
  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Overview</CardTitle>
        </CardHeader>
        <CardContent>
          <dl>
            <DefinitionRow label="Title" value={app.title} />
            <DefinitionRow label="Name" value={app.name} />
            <DefinitionRow
              label="Application id"
              value={<span className="font-mono">{app.appId}</span>}
            />
            <DefinitionRow label="Description" value={app.description} />
            <DefinitionRow label="Category" value={app.category ?? missingValue("No category")} />
            <DefinitionRow
              label="Status"
              value={
                <Badge variant="tertiary">
                  {APP_CATALOG_AVAILABILITY_LABELS[app.availability]}
                </Badge>
              }
            />
            <DefinitionRow
              label="Application version"
              value={
                applicationVersion === null
                  ? missingValue("Unavailable")
                  : <span className="font-mono">{applicationVersion}</span>
              }
            />
            <DefinitionRow
              label="Catalog version"
              value={
                app.version === null
                  ? missingValue("No catalog override")
                  : <span className="font-mono">{app.version}</span>
              }
            />
            <DefinitionRow label="Installed tenants" value={String(app.installedCount)} />
            <DefinitionRow
              label="Override updated"
              value={app.updatedAt === null ? missingValue("Never") : formatDateTime(app.updatedAt)}
            />
          </dl>
        </CardContent>
      </Card>
    </div>
  );
}
