"use client";

import { useState } from "react";
import { Button } from "@suite/ui";
import type { TenantLifecycleAction } from "@suite/core";
import { LIFECYCLE_ACTION_CONFIG, availableLifecycleActions, type LifecycleTenant } from "./lifecycle-form.config";
import { LifecycleModal } from "./lifecycle-modal";

export function TenantLifecycleActions({
  tenant, canManage, onApplied, onReload,
}: {
  readonly tenant: LifecycleTenant; readonly canManage: boolean;
  readonly onApplied: (message: string) => void; readonly onReload: () => void;
}) {
  const [activeAction, setActiveAction] = useState<TenantLifecycleAction | null>(null);
  if (!canManage) return null;
  const actions = availableLifecycleActions(tenant.status);
  if (actions.length === 0) return null;

  return (
    <div className="flex flex-wrap items-center justify-end gap-2">
      {actions.map((action) => (
        <Button key={action} variant={LIFECYCLE_ACTION_CONFIG[action].variant} onClick={() => setActiveAction(action)}>
          {LIFECYCLE_ACTION_CONFIG[action].label}
        </Button>
      ))}
      {activeAction !== null ? (
        <LifecycleModal
          key={activeAction}
          action={activeAction}
          tenant={tenant}
          onClose={() => setActiveAction(null)}
          onApplied={() => {
            const message = LIFECYCLE_ACTION_CONFIG[activeAction].successMessage;
            setActiveAction(null);
            onApplied(message);
          }}
          onReload={() => { setActiveAction(null); onReload(); }}
        />
      ) : null}
    </div>
  );
}
