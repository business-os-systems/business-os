"use client";

import React from "react";
import { Button } from "@suite/ui";
import { AuthErrorAlert } from "@/components/auth/auth-error-alert";

export interface ChooseTenantErrorProps {
  message: string;
  onRetry: () => void;
}

/** Load/switch failure banner with an inline retry action. */
export function ChooseTenantError({ message, onRetry }: ChooseTenantErrorProps) {
  return (
    <AuthErrorAlert
      message={message}
      action={
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={onRetry}
          className="ml-2 h-auto p-0 font-semibold underline hover:no-underline text-danger hover:text-danger hover:bg-transparent"
        >
          Retry
        </Button>
      }
    />
  );
}
