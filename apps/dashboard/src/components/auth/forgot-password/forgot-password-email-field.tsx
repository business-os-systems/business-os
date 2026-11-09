"use client";

import React from "react";
import { Input, Label } from "@suite/ui";

const EMAIL_FIELD_ID = "recovery-email";
const ERROR_ALERT_ID = "forgot-password-error";

export interface ForgotPasswordEmailFieldProps {
  email: string;
  isLoading: boolean;
  hasError: boolean;
  onEmailChange: (value: string) => void;
}

/** Email input with the shared invalid/described-by wiring for the recovery form. */
export function ForgotPasswordEmailField({
  email,
  isLoading,
  hasError,
  onEmailChange,
}: ForgotPasswordEmailFieldProps) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={EMAIL_FIELD_ID} required>
        Email Address
      </Label>
      <Input
        id={EMAIL_FIELD_ID}
        name="email"
        type="email"
        required
        autoComplete="email"
        aria-invalid={hasError}
        aria-describedby={hasError ? ERROR_ALERT_ID : undefined}
        value={email}
        onChange={(event) => onEmailChange(event.target.value)}
        disabled={isLoading}
        placeholder="operator@company.com"
        hasError={hasError}
      />
    </div>
  );
}
