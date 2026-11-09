"use client";

import React from "react";
import { EyeIcon, EyeOffIcon } from "@suite/ui/icons";

export interface PasswordVisibilityButtonProps {
  visible: boolean;
  onToggle: () => void;
}

/** Shared show/hide control used by every password input on the auth pages. */
export function PasswordVisibilityButton({
  visible,
  onToggle,
}: PasswordVisibilityButtonProps) {
  const label = visible ? "Hide password" : "Show password";
  return (
    <button
      type="button"
      onClick={onToggle}
      tabIndex={-1}
      className="text-text-muted hover:text-text transition-colors p-0.5"
      aria-label={label}
    >
      {visible ? <EyeOffIcon size={16} /> : <EyeIcon size={16} />}
    </button>
  );
}
