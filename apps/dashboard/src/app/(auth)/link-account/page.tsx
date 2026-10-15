"use client";

import React, { useState, useEffect, Suspense } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { AuthCard } from "@/components/auth/auth-card";

function LinkAccountChallengeForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const ticket = searchParams.get("ticket") || "";

  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [ticketDetails, setTicketDetails] = useState<{
    email?: string;
    providerId?: string;
    name?: string;
  } | null>(null);

  // Parse ticket details on mount (or via GET /api/auth/link-account)
  useEffect(() => {
    if (!ticket) return;

    // Fetch ticket verification info
    fetch(`/api/auth/link-account?ticket=${encodeURIComponent(ticket)}`)
      .then((res) => {
        if (!res.ok) throw new Error("Invalid ticket");
        return res.json();
      })
      .then((data) => {
        if (data.valid) {
          setTicketDetails({
            email: data.email,
            providerId: data.providerId,
            name: data.name,
          });
        }
      })
      .catch(() => {
        // If query fails, ticket is invalid or expired
        setErrorMessage("This account linking challenge is invalid or has expired. Please sign in again.");
      });
  }, [ticket]);

  const providerName =
    ticketDetails?.providerId
      ? ticketDetails.providerId.charAt(0).toUpperCase() + ticketDetails.providerId.slice(1)
      : "OAuth Provider";

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!ticket || !password || isLoading) return;

    setIsLoading(true);
    setErrorMessage(null);

    try {
      const response = await fetch("/api/auth/link-account", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ticket,
          password,
        }),
      });

      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(
          data.detail || data.error || "Failed to link account. Please check your password."
        );
      }

      router.push(data.redirectUrl || "/dashboard");
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to link account.";
      setErrorMessage(msg);
    } finally {
      setIsLoading(false);
    }
  };

  if (!ticket) {
    return (
      <AuthCard
        title="Account Linking"
        subtitle="Secure account collision defense"
        footer={
          <p className="text-xs text-text-muted">
            Back to{" "}
            <Link
              href="/login"
              className="text-action hover:text-action-hover font-semibold underline-offset-2 hover:underline"
            >
              Sign in
            </Link>
          </p>
        }
      >
        <div className="flex flex-col items-center gap-3 py-2 text-center">
          <div className="w-10 h-10 rounded-full bg-danger/10 text-danger flex items-center justify-center">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
          </div>
          <p className="text-sm font-semibold text-text">Missing Linking Challenge</p>
          <p className="text-xs text-text-secondary leading-relaxed">
            No valid verification challenge was provided. Please sign in with your credentials or OAuth provider.
          </p>
          <Link
            href="/login"
            className="mt-2 text-xs text-action hover:text-action-hover font-semibold underline underline-offset-2"
          >
            Return to Sign in
          </Link>
        </div>
      </AuthCard>
    );
  }

  return (
    <AuthCard
      title="Link your account"
      subtitle={`An account with this email already exists. Enter your existing password to link your ${providerName} account.`}
      badge={ticketDetails?.providerId ? `${providerName} Collision Challenge` : undefined}
      footer={
        <p className="text-xs text-text-muted">
          Not your account?{" "}
          <Link
            href="/login"
            className="text-action hover:text-action-hover font-semibold underline-offset-2 hover:underline"
          >
            Sign in
          </Link>
        </p>
      }
    >
      <form onSubmit={handleSubmit} className="flex flex-col gap-3.5 text-text" noValidate>
        {errorMessage && (
          <div
            id="link-account-error"
            role="alert"
            className="p-3 text-xs rounded-lg border border-danger/30 bg-danger/10 text-danger flex items-start gap-2"
          >
            <svg className="w-4 h-4 shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
            <span className="leading-tight">{errorMessage}</span>
          </div>
        )}

        {ticketDetails?.email && (
          <div className="p-2.5 rounded-lg bg-surface-subtle border border-border text-xs flex flex-col gap-1">
            <span className="text-[10px] uppercase font-semibold text-text-muted">Target Account</span>
            <span className="font-medium text-text">{ticketDetails.email}</span>
          </div>
        )}

        <div className="flex flex-col gap-1.5">
          <label htmlFor="account-password" className="text-xs font-semibold text-text">
            Existing Password
          </label>
          <div className="relative">
            <input
              id="account-password"
              name="password"
              type={showPassword ? "text" : "password"}
              required
              autoComplete="current-password"
              aria-invalid={Boolean(errorMessage)}
              aria-describedby={errorMessage ? "link-account-error" : undefined}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              disabled={isLoading}
              placeholder="••••••••••••"
              className="w-full pl-3 pr-11 py-2 text-sm rounded-lg bg-surface border border-border text-text placeholder:text-text-disabled focus:outline-none focus:border-action focus:ring-1 focus:ring-action transition-colors"
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              tabIndex={-1}
              aria-label={showPassword ? "Hide password" : "Show password"}
              className="absolute right-0 top-1/2 -translate-y-1/2 w-11 h-11 min-w-[44px] min-h-[44px] flex items-center justify-center text-text-muted hover:text-text transition-colors"
            >
              {showPassword ? (
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l18 18" />
                </svg>
              ) : (
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                </svg>
              )}
            </button>
          </div>
        </div>

        <button
          type="submit"
          disabled={isLoading || !password}
          className="w-full mt-1 py-2.5 px-4 min-h-[44px] rounded-lg bg-action hover:bg-action-hover active:bg-action-active text-on-action font-semibold text-sm shadow-xs transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
        >
          {isLoading ? "Verifying & Linking..." : `Link ${providerName} Account`}
        </button>
      </form>
    </AuthCard>
  );
}

export default function LinkAccountPage() {
  return (
    <Suspense
      fallback={
        <AuthCard title="Link your account" subtitle="Loading account linking ticket...">
          <div className="py-6 flex items-center justify-center">
            <div className="w-6 h-6 border-2 border-action border-t-transparent rounded-full animate-spin" />
          </div>
        </AuthCard>
      }
    >
      <LinkAccountChallengeForm />
    </Suspense>
  );
}
