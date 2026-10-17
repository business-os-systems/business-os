"use client";

import React, { useState, useEffect, Suspense } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { AuthCard } from "@/components/auth/auth-card";
import { Button, Input, Label, Spinner } from "@suite/ui";
import { AlertTriangleIcon, EyeIcon, EyeOffIcon } from "@suite/ui/icons";

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
            <AlertTriangleIcon size={20} />
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
            <AlertTriangleIcon size={16} className="shrink-0 mt-0.5" />
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
          <Label htmlFor="account-password" required>
            Existing Password
          </Label>
          <Input
            id="account-password"
            name="password"
            type={showPassword ? "text" : "password"}
            required
            autoComplete="current-password"
            hasError={Boolean(errorMessage)}
            aria-describedby={errorMessage ? "link-account-error" : undefined}
            value={password}
            onChange={(e) => {
              setPassword(e.target.value);
              if (errorMessage) setErrorMessage(null);
            }}
            disabled={isLoading}
            placeholder="••••••••••••"
            endIcon={
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setShowPassword(!showPassword)}
                tabIndex={-1}
                aria-label={showPassword ? "Hide password" : "Show password"}
                className="w-8 h-8 p-0 flex items-center justify-center text-text-muted hover:text-text hover:bg-transparent"
              >
                {showPassword ? <EyeOffIcon size={16} /> : <EyeIcon size={16} />}
              </Button>
            }
          />

        </div>

        <Button
          type="submit"
          variant="primary"
          fullWidth
          isLoading={isLoading}
          disabled={isLoading || !password}
          className="mt-1 min-h-[44px]"
        >
          {isLoading ? "Verifying & Linking..." : `Link ${providerName} Account`}
        </Button>
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
            <Spinner size="md" color="action" />
          </div>
        </AuthCard>
      }
    >
      <LinkAccountChallengeForm />
    </Suspense>
  );
}
