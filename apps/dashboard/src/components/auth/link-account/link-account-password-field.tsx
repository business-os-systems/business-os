"use client";

import React from "react";
import { Button, Input, Label } from "@suite/ui";
import { EyeIcon, EyeOffIcon } from "@suite/ui/icons";
import type { LinkAccountController } from "./use-link-account";

const PASSWORD_FIELD_ID = "account-password";
const ERROR_ALERT_ID = "link-account-error";

export interface LinkAccountPasswordFieldProps {
  controller: LinkAccountController;
  hasError: boolean;
}

function VisibilityControl({
  visible,
  onToggle,
}: {
  visible: boolean;
  onToggle: () => void;
}) {
  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      onClick={onToggle}
      tabIndex={-1}
      aria-label={visible ? "Hide password" : "Show password"}
      className="w-8 h-8 p-0 flex items-center justify-center text-text-muted hover:text-text hover:bg-transparent"
    >
      {visible ? <EyeOffIcon size={16} /> : <EyeIcon size={16} />}
    </Button>
  );
}

function PasswordInput({ controller, hasError }: LinkAccountPasswordFieldProps) {
  return (
    <Input
      id={PASSWORD_FIELD_ID}
      name="password"
      type={controller.showPassword ? "text" : "password"}
      required
      autoComplete="current-password"
      hasError={hasError}
      aria-invalid={hasError}
      aria-describedby={hasError ? ERROR_ALERT_ID : undefined}
      value={controller.password}
      onChange={(event) => controller.setPassword(event.target.value)}
      disabled={controller.isLoading}
      placeholder="••••••••••••"
      endIcon={
        <VisibilityControl
          visible={controller.showPassword}
          onToggle={controller.togglePasswordVisibility}
        />
      }
    />
  );
}

/** Existing-password input bound to the collision-challenge controller. */
export function LinkAccountPasswordField({
  controller,
  hasError,
}: LinkAccountPasswordFieldProps) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={PASSWORD_FIELD_ID} required>
        Existing Password
      </Label>
      <PasswordInput controller={controller} hasError={hasError} />
    </div>
  );
}