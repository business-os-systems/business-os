"use client";

import React from "react";
import { Input, Label } from "@suite/ui";
import { PasswordVisibilityButton } from "@/components/auth/password-visibility-button";
import type { InvitationAcceptController } from "./use-invitation-accept";

export type InvitationPasswordKind = "password" | "confirmPassword";

export interface InvitationPasswordFieldProps {
  controller: InvitationAcceptController;
  field: InvitationPasswordKind;
  id: string;
  label: string;
  placeholder: string;
}

function FieldLabel({ id, label }: { id: string; label: string }) {
  return (
    <Label size="sm" htmlFor={id} required>
      {label}
    </Label>
  );
}

interface FieldBinding {
  value: string;
  onValueChange: (value: string) => void;
}

function bindField(
  controller: InvitationAcceptController,
  field: InvitationPasswordKind
): FieldBinding {
  if (field === "password") {
    return { value: controller.password, onValueChange: controller.setPassword };
  }
  return {
    value: controller.confirmPassword,
    onValueChange: controller.setConfirmPassword,
  };
}

/** Password input bound to either the password or confirmation value. */
export function InvitationPasswordField({
  controller,
  field,
  id,
  label,
  placeholder,
}: InvitationPasswordFieldProps) {
  const binding = bindField(controller, field);

  return (
    <div className="space-y-1">
      <FieldLabel id={id} label={label} />
      <Input
        id={id}
        type={controller.showPassword ? "text" : "password"}
        placeholder={placeholder}
        value={binding.value}
        onChange={(event) => binding.onValueChange(event.target.value)}
        disabled={controller.isSubmitting}
        fullWidth
        endIcon={
          <PasswordVisibilityButton
            visible={controller.showPassword}
            onToggle={controller.togglePasswordVisibility}
          />
        }
      />
    </div>
  );
}