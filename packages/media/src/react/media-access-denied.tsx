"use client";

import React from "react";
import { Alert } from "@suite/ui";
import { PERMISSIONS } from "@suite/core";

export interface MediaAccessDeniedAlertProps {
  readonly className?: string;
}

/**
 * The one fail-closed denial surfaced by the library, the picker and the asset
 * detail. A missing capability always renders this, never the browsing UI.
 */
export function MediaAccessDeniedAlert({ className }: MediaAccessDeniedAlertProps) {
  return (
    <Alert
      variant="error"
      role="alert"
      className={className}
      title="Media access denied"
      message={`Your role does not include the ${PERMISSIONS.MEDIA.READ} capability.`}
    />
  );
}
