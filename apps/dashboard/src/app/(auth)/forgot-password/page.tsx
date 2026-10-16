"use client";

import React, { useState } from "react";
import Link from "next/link";
import { AuthCard } from "@/components/auth/auth-card";
import { Turnstile } from "@/components/auth/turnstile";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim() || isLoading) return;

    setIsLoading(true);
    setErrorMessage(null);

    try {
      const response = await fetch("/api/auth/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim(), turnstileToken }),
      });

      if (!response.ok && response.status !== 404) {
        const data = await response.json().catch(() => ({}));
        if (response.status === 429) {
          setErrorMessage(
            data.detail || "Rate limit exceeded. Maximum 5 password reset requests allowed per hour."
          );
          return;
        }
        throw new Error(
          data.detail || data.error || "Failed to process request",
        );
      }

      // Security practice: Always show success even if email is not found to prevent user enumeration
      setIsSubmitted(true);
    } catch (err: unknown) {
      if (err instanceof Error && err.message !== "Failed to process request") {
        setErrorMessage(err.message);
      } else {
        setIsSubmitted(true);
      }
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <AuthCard
      title="Reset your password"
      subtitle="Enter your email address to reset your password."
      footer={
        <p className="text-xs text-text-muted">
          Remember your password?{" "}
          <Link
            href="/login"
            className="text-action hover:text-action-hover font-semibold underline-offset-2 hover:underline"
          >
            Sign in
          </Link>
        </p>
      }
    >
      {isSubmitted ? (
        <div className="flex flex-col items-center gap-3 py-2 text-center">
          <div className="w-10 h-10 rounded-full bg-success/10 text-success flex items-center justify-center">
            <svg
              className="w-5 h-5"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M5 13l4 4L19 7"
              />
            </svg>
          </div>
          <p className="text-sm font-semibold text-text">Check your inbox</p>
          <p className="text-xs text-text-secondary leading-relaxed">
            If an account exists for{" "}
            <span className="font-medium text-text">{email}</span>, we have
            dispatched a secure password reset link. Please check your email.
          </p>
          <button
            type="button"
            onClick={() => setIsSubmitted(false)}
            className="mt-2 text-xs text-action hover:text-action-hover font-medium underline underline-offset-2"
          >
            Try another email
          </button>
        </div>
      ) : (
        <form
          onSubmit={handleSubmit}
          className="flex flex-col gap-3.5 text-text"
          noValidate
        >
          {errorMessage && (
            <div
              id="forgot-password-error"
              role="alert"
              className="p-3 text-xs rounded-lg border border-danger/30 bg-danger/10 text-danger flex items-start gap-2"
            >
              <svg
                className="w-4 h-4 shrink-0 mt-0.5"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
                />
              </svg>
              <span className="leading-tight">{errorMessage}</span>
            </div>
          )}

          <div className="flex flex-col gap-1.5">
            <label
              htmlFor="recovery-email"
              className="text-xs font-semibold text-text"
            >
              Email Address
            </label>
            <input
              id="recovery-email"
              name="email"
              type="email"
              required
              autoComplete="email"
              aria-invalid={Boolean(errorMessage)}
              aria-describedby={errorMessage ? "forgot-password-error" : undefined}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              disabled={isLoading}
              placeholder="operator@company.com"
              className="w-full px-3 py-2 text-sm rounded-lg bg-surface border border-border text-text placeholder:text-text-disabled focus:outline-none focus:border-action focus:ring-1 focus:ring-action transition-colors"
            />
          </div>

          {/* Cloudflare Turnstile Bot Defense (SPEC-02) */}
          <Turnstile onVerify={(token) => setTurnstileToken(token)} />

          <button
            type="submit"
            disabled={isLoading || !email.trim()}
            className="w-full mt-1 py-2.5 px-4 min-h-[44px] rounded-lg bg-action hover:bg-action-hover active:bg-action-active text-on-action font-semibold text-sm shadow-xs transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          >
            {isLoading ? "Sending recovery link..." : "Send reset link"}
          </button>
        </form>
      )}
    </AuthCard>
  );
}
