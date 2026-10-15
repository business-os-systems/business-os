"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { AuthCard } from "@/components/auth/auth-card";
import { Button } from "@suite/ui";
import { isBrowser } from "@/lib/env";

export default function VerifyExpiredPage() {
  const [email, setEmail] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [cooldown, setCooldown] = useState(0);
  const [statusMessage, setStatusMessage] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);

  useEffect(() => {
    if (!isBrowser) return;
    const params = new URLSearchParams(window.location.search);
    const emailParam = params.get("email");
    if (emailParam) {
      setEmail(emailParam);
    }
  }, []);

  useEffect(() => {
    if (cooldown <= 0) return;
    const interval = setInterval(() => {
      setCooldown((prev) => prev - 1);
    }, 1000);
    return () => clearInterval(interval);
  }, [cooldown]);

  const handleResend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || cooldown > 0 || isSubmitting) return;

    setIsSubmitting(true);
    setStatusMessage(null);

    try {
      const res = await fetch("/api/auth/verify-email/request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });

      const data = await res.json();

      if (res.ok) {
        setStatusMessage({
          type: "success",
          text: "A fresh verification link has been dispatched to your inbox.",
        });
        setCooldown(60); // 60s cooldown timer
      } else {
        setStatusMessage({
          type: "error",
          text: data.detail || "Unable to dispatch verification email.",
        });
        if (res.status === 429 && data.retryAfter) {
          setCooldown(Math.min(data.retryAfter, 60));
        }
      }
    } catch {
      setStatusMessage({
        type: "error",
        text: "Network error. Please try again.",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <AuthCard
      title="Link Expired"
      subtitle="Your email verification link has expired"
    >
      <div className="flex flex-col gap-4 text-center">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-status-warning/15 text-status-warning border border-status-warning/30">
          <svg
            className="h-6 w-6 text-status-warning"
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
        </div>

        <p className="text-xs text-text-muted leading-relaxed">
          For your security, verification links expire after 24 hours. Request a new link below to verify your email and unlock marketplace app installation.
        </p>

        {statusMessage && (
          <div
            className={`p-3 rounded-lg text-xs font-medium text-left ${
              statusMessage.type === "success"
                ? "bg-action/10 text-action border border-action/20"
                : "bg-danger/10 text-danger border border-danger/20"
            }`}
          >
            {statusMessage.text}
          </div>
        )}

        <form onSubmit={handleResend} className="flex flex-col gap-3 mt-1">
          <div className="flex flex-col text-left gap-1.5">
            <label
              htmlFor="verify-email-input"
              className="text-xs font-medium text-text"
            >
              Account Email
            </label>
            <input
              id="verify-email-input"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="name@company.com"
              required
              className="w-full px-3 py-2 rounded-lg border border-border bg-surface text-text text-sm placeholder:text-text-muted focus:outline-hidden focus:ring-2 focus:ring-action/20 focus:border-action transition-all"
            />
          </div>

          <Button
            type="submit"
            disabled={isSubmitting || cooldown > 0 || !email}
            className="w-full bg-action hover:bg-action-hover text-white font-semibold py-2.5 rounded-lg text-sm transition-all disabled:opacity-50"
          >
            {isSubmitting ? (
              <span className="flex items-center justify-center gap-2">
                <svg
                  className="animate-spin h-4 w-4 text-white"
                  viewBox="0 0 24 24"
                  fill="none"
                >
                  <circle
                    className="opacity-25"
                    cx="12"
                    cy="12"
                    r="10"
                    stroke="currentColor"
                    strokeWidth="4"
                  />
                  <path
                    className="opacity-75"
                    fill="currentColor"
                    d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                  />
                </svg>
                Sending...
              </span>
            ) : cooldown > 0 ? (
              `Resend available in ${cooldown}s`
            ) : (
              "Resend Verification Email"
            )}
          </Button>
        </form>

        <div className="pt-2 border-t border-border-hairline flex items-center justify-between text-xs text-text-muted">
          <Link
            href="/login"
            className="hover:text-text hover:underline transition-colors"
          >
            Sign in
          </Link>
          <Link
            href="/dashboard"
            className="hover:text-action hover:underline transition-colors"
          >
            Go to Dashboard &rarr;
          </Link>
        </div>
      </div>
    </AuthCard>
  );
}
