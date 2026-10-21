"use client";

import React, { useState } from "react";
import Link from "next/link";
import { Button, Input, Label } from "@suite/ui";
import { CheckIcon, AlertTriangleIcon } from "@suite/ui/icons";
import { AuthCard } from "@/components/auth/auth-card";
import { Turnstile } from "@/components/auth/turnstile";
import { useTurnstileConfig } from "@/lib/turnstile-client";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null);
  const turnstileConfig = useTurnstileConfig();
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
            onClick={() => setIsSubmitted(false)}
            className="mt-2 text-xs text-action hover:text-action-hover font-medium underline underline-offset-2 hover:bg-transparent h-auto p-0"
          >
            Try another email
          </Button>
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
              <AlertTriangleIcon size={16} className="shrink-0 mt-0.5" />
              <span className="leading-tight">{errorMessage}</span>
            </div>
          )}


          <div className="flex flex-col gap-1.5">
            <Label
              htmlFor="recovery-email"
              required
            >
              Email Address
            </Label>
            <Input
              id="recovery-email"
              name="email"
              type="email"
              required
              autoComplete="email"
              aria-invalid={Boolean(errorMessage)}
              aria-describedby={errorMessage ? "forgot-password-error" : undefined}
              value={email}
              onChange={(e) => {
                setEmail(e.target.value);
                if (errorMessage) setErrorMessage(null);
              }}
              disabled={isLoading}
              placeholder="operator@company.com"
              hasError={Boolean(errorMessage)}
            />
          </div>

          {/* Cloudflare Turnstile Bot Defense (SPEC-02) */}
          <Turnstile
            siteKey={turnstileConfig.siteKey}
            onVerify={(token) => setTurnstileToken(token)}
          />

          <Button
            type="submit"
            variant="primary"
            fullWidth
            disabled={
              isLoading ||
              !email.trim() ||
              (turnstileConfig.isConfigured && !turnstileToken)
            }
            isLoading={isLoading}
            className="mt-1 min-h-[44px]"
          >
            {isLoading ? "Sending recovery link..." : "Send reset link"}
          </Button>
        </form>
      )}
    </AuthCard>
  );
}
