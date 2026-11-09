"use client";

import React from "react";
import Link from "next/link";

/** Secondary navigation footer rendered inside the recovery envelope card. */
export function ForgotPasswordCardFooter() {
  return (
    <p className="text-xs text-text-muted">
      Remember your password?{" "}
      <Link
        href="/login"
        className="text-action hover:text-action-hover font-semibold underline-offset-2 hover:underline"
      >
        Sign in
      </Link>
    </p>
  );
}
