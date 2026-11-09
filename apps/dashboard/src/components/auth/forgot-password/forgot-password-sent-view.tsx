"use client";

import React from "react";
import { Button } from "@suite/ui";
import { CheckIcon } from "@suite/ui/icons";

export interface ForgotPasswordSentViewProps {
  email: string;
  onReset: () => void;
}

/** Post-submission confirmation; the copy is address-neutral by design (P17). */
export function ForgotPasswordSentView({
  email,
  onReset,
}: ForgotPasswordSentViewProps) {
  return (
    <div className="flex flex-col items-center gap-3 py-2 text-center">
      <div className="w-10 h-10 rounded-full bg-success/10 text-success flex items-center justify-center">
        <CheckIcon size={20} />
      </div>
      <p className="text-sm font-semibold text-text">Check your inbox</p>
      <p className="text-xs text-text-secondary leading-relaxed">
        If an account exists for{" "}
        <span className="font-medium text-text">{email}</span>, we have
        dispatched a secure password reset link. Please check your email.
      </p>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        onClick={onReset}
        className="mt-2 text-xs text-action hover:text-action-hover font-medium underline underline-offset-2 hover:bg-transparent h-auto p-0"
      >
        Try another email
      </Button>
    </div>
  );
}
