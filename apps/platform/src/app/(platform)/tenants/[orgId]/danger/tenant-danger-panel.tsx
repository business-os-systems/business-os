"use client";

import { useState } from "react";
import { Button, Card, CardContent, CardHeader, CardTitle } from "@suite/ui";
import { canApplyLifecycleAction, type TenantLifecycleAction } from "@suite/core";
import {
  ACTION_ORDER,
  LIFECYCLE_ACTION_CONFIG,
  type LifecycleTenant,
} from "@/components/forms/lifecycle-form.config";
import { LifecycleModal } from "@/components/forms/lifecycle-modal";

function DangerActionCard({
  action,
  tenant,
  onOpen,
}: {
  readonly action: TenantLifecycleAction;
  readonly tenant: LifecycleTenant;
  readonly onOpen: (action: TenantLifecycleAction) => void;
}) {
  const config = LIFECYCLE_ACTION_CONFIG[action];
  const available = canApplyLifecycleAction(action, tenant.status);
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{config.label}</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-wrap items-center justify-between gap-3">
        <p className="max-w-2xl text-sm text-text-secondary">
          {config.description}
        </p>
        <Button
          variant={config.variant}
          disabled={!available}
          onClick={() => onOpen(action)}
        >
          {config.label}
        </Button>
      </CardContent>
    </Card>
  );
}

export function TenantDangerPanel({
  tenant,
  onApplied,
  onReload,
}: {
  readonly tenant: LifecycleTenant;
  readonly onApplied: (message: string) => void;
  readonly onReload: () => void;
}) {
  const [activeAction, setActiveAction] =
    useState<TenantLifecycleAction | null>(null);

  function apply(action: TenantLifecycleAction): void {
    const message = LIFECYCLE_ACTION_CONFIG[action].successMessage;
    setActiveAction(null);
    onApplied(message);
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-text-secondary">
        These actions change tenant access. Every action records a reason and an
        audit row in the same transaction.
      </p>
      <div className="space-y-3">
        {ACTION_ORDER.map((action) => (
          <DangerActionCard
            key={action}
            action={action}
            tenant={tenant}
            onOpen={setActiveAction}
          />
        ))}
      </div>
      {activeAction === null ? null : (
        <LifecycleModal
          key={activeAction}
          action={activeAction}
          tenant={tenant}
          onClose={() => setActiveAction(null)}
          onApplied={() => apply(activeAction)}
          onReload={() => {
            setActiveAction(null);
            onReload();
          }}
        />
      )}
    </div>
  );
}
