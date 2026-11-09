"use client";

import React from "react";
import { AlertTriangleIcon } from "@suite/ui/icons";

export interface AuthErrorAlertProps {
  message: string;
  alertId?: string;
  action?: React.ReactNode;
}

/**
 * Single semantic error banner for every auth surface (P1/P3): danger tokens
 * only, one icon, role="alert" and an optional inline recovery action.
 */
export function AuthErrorAlert({
  message,
  alertId,
  action,
}: AuthErrorAlertProps) {
  return (
    <div
      id={alertId}
      role="alert"
      className="p-3 text-xs rounded-lg border border-danger/30 bg-danger/10 text-danger flex items-start gap-2"
    >
      <AlertTriangleIcon
        size={16}
        className="shrink-0 mt-0.5"
        aria-hidden="true"
      />
      <div className="flex-1">
        <span className="leading-tight">{message}</span>
        {action}
      </div>
    </div>
  );
}
