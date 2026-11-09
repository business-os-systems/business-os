"use client";

import React from "react";
import Link from "next/link";

/** Secondary navigation footer rendered inside the sign-in envelope card. */
export function LoginCardFooter() {
  return (
    <p className="text-xs text-text-muted">
      Don&apos;t have an account yet?{" "}
      <Link
        href="/signup"
        className="text-action hover:text-action-hover font-semibold underline-offset-2 hover:underline"
      >
        Sign up
      </Link>
    </p>
  );
}
