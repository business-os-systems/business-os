"use client";

import { useCallback, useEffect, useState } from "react";
import { Alert, Button, Card, CardContent, CardHeader, CardTitle, Spinner } from "@suite/ui";
import {
  SITE_TAKEDOWN_ACTIONS,
  fetchTenantSites,
  type SiteTakedownAction,
  type TenantSite,
} from "@/lib/site-takedown-api";
import { toMessage } from "@/lib/error-message";
import {
  CMS_SITE_STATUS_LABELS,
  SITE_TAKEDOWN_CONFIG,
  canRestoreSite,
  canSuspendSite,
} from "@/components/forms/site-takedown-form.config";
import { SiteTakedownModal } from "@/components/forms/site-takedown-modal";

interface ActiveModal {
  readonly action: SiteTakedownAction;
  readonly site: TenantSite;
}

function siteActions(status: TenantSite["status"]): readonly SiteTakedownAction[] {
  const actions: SiteTakedownAction[] = [];
  if (canSuspendSite(status)) actions.push(SITE_TAKEDOWN_ACTIONS.SUSPEND);
  if (canRestoreSite(status)) actions.push(SITE_TAKEDOWN_ACTIONS.RESTORE);
  return actions;
}

function SiteRow({
  site,
  onOpen,
}: {
  readonly site: TenantSite;
  readonly onOpen: (action: SiteTakedownAction) => void;
}) {
  return (
    <div className="flex flex-col gap-3 rounded-md border border-border p-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0 space-y-1">
        <div className="flex flex-wrap items-center gap-2">
          <p className="truncate text-sm font-semibold text-text">{site.title}</p>
          <span className="text-xs font-medium text-text-secondary">
            {CMS_SITE_STATUS_LABELS[site.status]}
          </span>
        </div>
        <p className="truncate text-xs text-text-muted">
          {site.hostnames.length === 0 ? "No active host" : site.hostnames.join(", ")}
        </p>
      </div>
      <div className="flex shrink-0 flex-wrap gap-2">
        {siteActions(site.status).map((action) => (
          <Button
            key={action}
            size="sm"
            variant={SITE_TAKEDOWN_CONFIG[action].variant}
            onClick={() => onOpen(action)}
          >
            {SITE_TAKEDOWN_CONFIG[action].label}
          </Button>
        ))}
      </div>
    </div>
  );
}

function SitesBody({
  sites,
  error,
  onOpen,
}: {
  readonly sites: readonly TenantSite[] | null;
  readonly error: string | null;
  readonly onOpen: (action: SiteTakedownAction, site: TenantSite) => void;
}) {
  if (error !== null) return <Alert variant="error" message={error} />;
  if (sites === null) {
    return <div className="flex items-center justify-center py-4"><Spinner /></div>;
  }
  if (sites.length === 0) {
    return <p className="text-sm text-text-secondary">This tenant has no sites yet.</p>;
  }
  return (
    <div className="space-y-2">
      {sites.map((site) => (
        <SiteRow key={site.id} site={site} onOpen={(action) => onOpen(action, site)} />
      ))}
    </div>
  );
}

function useTenantSites(organizationId: string) {
  const [sites, setSites] = useState<readonly TenantSite[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    setSites(null);
    setError(null);
    fetchTenantSites(organizationId, controller.signal)
      .then((items) => {
        if (!controller.signal.aborted) setSites(items);
      })
      .catch((cause: unknown) => {
        if (!controller.signal.aborted) setError(toMessage(cause));
      });
    return () => controller.abort();
  }, [organizationId, reloadKey]);

  const reload = useCallback(() => setReloadKey((value) => value + 1), []);
  return { sites, error, reload };
}

export function TenantSitesPanel({
  organizationId,
  onApplied,
}: {
  readonly organizationId: string;
  readonly onApplied: (message: string) => void;
}) {
  const { sites, error, reload } = useTenantSites(organizationId);
  const [active, setActive] = useState<ActiveModal | null>(null);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Published sites</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-sm text-text-secondary">
          Suspend one site immediately with a recorded reason. The state change
          and both audit rows commit together; restore returns the site to the
          status it held before suspension.
        </p>
        <SitesBody
          sites={sites}
          error={error}
          onOpen={(action, site) => setActive({ action, site })}
        />
      </CardContent>
      {active === null ? null : (
        <SiteTakedownModal
          key={active.action + active.site.id}
          organizationId={organizationId}
          action={active.action}
          site={active.site}
          onClose={() => setActive(null)}
          onApplied={() => {
            setActive(null);
            onApplied(SITE_TAKEDOWN_CONFIG[active.action].successMessage);
            reload();
          }}
          onReload={() => {
            setActive(null);
            reload();
          }}
        />
      )}
    </Card>
  );
}
