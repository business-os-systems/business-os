"use client";

import { useId } from "react";
import { Alert, Checkbox, Label } from "@suite/ui";
import { appDisplayTitle, setTenantEntitlement, type TenantEntitlement } from "@/lib/apps-api";
import { useIdempotentMutation } from "@/lib/use-idempotent-mutation";

function EntitlementToggle({
  orgId,
  app,
  onUpdated,
}: {
  readonly orgId: string;
  readonly app: TenantEntitlement;
  readonly onUpdated: (apps: readonly TenantEntitlement[]) => void;
}) {
  const inputId = useId();
  const mutation = useIdempotentMutation();

  async function change(enabled: boolean): Promise<void> {
    await mutation.run(
      (idempotencyKey) =>
        setTenantEntitlement({
          orgId,
          appId: app.appId,
          enabled,
          expectedVersion: app.version,
          idempotencyKey,
        }),
      onUpdated
    );
  }

  return (
    <div className="space-y-1 rounded-lg border border-border bg-surface p-3">
      <div className="flex items-start gap-2">
        <Checkbox
          id={inputId}
          checked={app.isEnabled}
          disabled={mutation.isSaving}
          onChange={(event) => void change(event.target.checked)}
        />
        <div className="space-y-0.5">
          <Label htmlFor={inputId} className="text-xs font-medium text-text">
            {appDisplayTitle(app.appId)}
          </Label>
          <p className="text-[11px] text-text-muted">
            {app.isEnabled
              ? "Enabled: the tenant workspace exposes this application."
              : "Disabled: the tenant workspace hides this application."}
          </p>
        </div>
      </div>
      {mutation.error === null ? null : (
        <Alert variant="error" message={mutation.error} />
      )}
    </div>
  );
}

export function TenantEntitlementToggles({
  orgId,
  apps,
  onUpdated,
}: {
  readonly orgId: string;
  readonly apps: readonly TenantEntitlement[];
  readonly onUpdated: (apps: readonly TenantEntitlement[]) => void;
}) {
  return (
    <div className="space-y-2">
      {apps.map((app) => (
        <EntitlementToggle
          key={app.appId}
          orgId={orgId}
          app={app}
          onUpdated={onUpdated}
        />
      ))}
    </div>
  );
}
