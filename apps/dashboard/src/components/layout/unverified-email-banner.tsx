"use client";

import React, { useState, useEffect } from "react";
import { Button } from "@suite/ui";

interface UnverifiedEmailBannerProps {
  email?: string;
}

export function UnverifiedEmailBanner({ email }: UnverifiedEmailBannerProps) {
  const [cooldown, setCooldown] = useState(0);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);

  useEffect(() => {
    if (cooldown <= 0) return;
    const interval = setInterval(() => {
      setCooldown((prev) => prev - 1);
    }, 1000);
    return () => clearInterval(interval);
  }, [cooldown]);

  const handleResend = async () => {
    if (cooldown > 0 || isSubmitting) return;

    setIsSubmitting(true);
    setFeedback(null);

    try {
      const res = await fetch("/api/auth/verify-email/request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });

      const data = await res.json();

      if (res.ok) {
        setFeedback("Verification link dispatched to your inbox.");
        setCooldown(60); // 60s client cooldown timer
      } else {
        setFeedback(data.detail || "Unable to dispatch verification link.");
        if (res.status === 429 && data.retryAfter) {
          setCooldown(Math.min(data.retryAfter, 60));
        }
      }
    } catch {
      setFeedback("Network error. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <aside
      aria-label="Email Verification Notice"
      className="w-full bg-warning/15 text-warning-text border-b border-warning/30 px-4 py-2.5 flex flex-wrap items-center justify-between gap-3 text-xs"
    >
      <div className="flex items-center gap-2 min-w-0">
        <svg
          className="h-4 w-4 text-warning shrink-0"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth="2"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
          />
        </svg>
        <span className="font-semibold text-warning-text truncate">
          Your email address {email ? `(${email})` : ""} is unverified. Application installation is restricted until verified.
        </span>
        {feedback && (
          <span className="font-semibold text-action ml-2 animate-in fade-in duration-200">
            • {feedback}
          </span>
        )}
      </div>

      <div className="flex items-center gap-2 shrink-0">
        <Button
          type="button"
          size="sm"
          variant="secondary"
          onClick={handleResend}
          disabled={isSubmitting || cooldown > 0}
          className="text-xs h-7 px-3 bg-surface hover:bg-surface-hover border border-warning/40 text-warning-text font-medium disabled:opacity-50"
        >
          {isSubmitting
            ? "Sending..."
            : cooldown > 0
            ? `Resend available in ${cooldown}s`
            : "Resend verification email"}
        </Button>
      </div>
    </aside>
  );
}
