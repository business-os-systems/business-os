"use client";

import React, { useState, Suspense } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { AuthCard } from "@/components/auth/auth-card";
import { OAuthProviders } from "@/components/auth/oauth-providers";
import { EmailPasswordForm } from "@/components/auth/email-password-form";
import { PasskeyButton, type PasskeyVerificationResult } from "@/components/auth/passkey-button";
import { resolvePostLoginRoute } from "@/lib/route-dispatcher";
import { isBrowser } from "@/lib/env";

export function sanitizeRedirect(
  queryRedirect: string | null,
  onboardingStatus?: string
): string | null {
  const isSafe =
    queryRedirect !== null &&
    queryRedirect.startsWith("/") &&
    !queryRedirect.startsWith("//") &&
    !queryRedirect.startsWith("/\\") &&
    !queryRedirect.startsWith("/login") &&
    !queryRedirect.startsWith("/signup") &&
    !queryRedirect.startsWith("/forgot-password") &&
    !queryRedirect.startsWith("/reset-password") &&
    (!onboardingStatus || onboardingStatus === "COMPLETED");

  return isSafe ? queryRedirect : null;
}

function LoginFormContent() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const getInitialErrorMessage = (): string | null => {
    const noticeParam = searchParams?.get("notice");
    if (noticeParam === "archived") {
      return "This organization has been archived. Please sign in to an active organization.";
    }

    const errorParam = searchParams?.get("error");
    if (!errorParam) return null;
    if (errorParam === "sso_unconfigured") {
      const org = searchParams.get("org") || searchParams.get("domain") || "your organization";
      return `Enterprise SSO is not yet configured for ${org}. Please sign in with your email and password.`;
    }
    if (errorParam === "sso_not_found") {
      return "Enterprise SSO connection not found. Please sign in with your email and password.";
    }
    if (errorParam === "oauth_cancelled") {
      return "Sign-in was cancelled. You can sign in using your email and password or try another provider.";
    }
    if (errorParam === "oauth_failed") {
      return "Authentication failed. Please check your credentials or try again.";
    }
    return null;
  };

  const [errorMessage, setErrorMessage] = useState<string | null>(getInitialErrorMessage);
  const [isLoading, setIsLoading] = useState(false);

  const clearError = () => {
    setErrorMessage(null);
    if (isBrowser) {
      const url = new URL(window.location.href);
      if (url.searchParams.has("error") || url.searchParams.has("notice")) {
        url.searchParams.delete("error");
        url.searchParams.delete("notice");
        url.searchParams.delete("org");
        url.searchParams.delete("domain");
        url.searchParams.delete("provider");
        const query = url.searchParams.toString();
        const cleanUrl = url.pathname + (query ? `?${query}` : "");
        window.history.replaceState({}, "", cleanUrl);
      }
    }
  };

  const handleLogin = async (data: {
    email: string;
    password: string;
    keepSignedIn?: boolean;
    turnstileToken?: string | null;
  }) => {
    setErrorMessage(null);
    setIsLoading(true);

    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: data.email,
          password: data.password,
          keepSignedIn: data.keepSignedIn,
          turnstileToken: data.turnstileToken,
        }),
      });

      const result = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(
          result.detail ||
            result.error ||
            "Failed to sign in. Please check your credentials.",
        );
      }

      // Synchronize session and navigate to target workspace route
      handleAuthSuccess(result);
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : "Failed to sign in");
      setIsLoading(false);
    }
  };

  const handleAuthSuccess = (result: PasskeyVerificationResult) => {
    // Synchronize theme preference if returned
    if (result.themePreference && isBrowser) {
      document.documentElement.setAttribute(
        "data-theme",
        result.themePreference,
      );
      try {
        localStorage.setItem("business_os_theme", result.themePreference);
      } catch {
        // Ignore localStorage errors
      }
    }

    // Route user using resolvePostLoginRoute dispatcher handshake
    const user = result.user;
    const dispatcherRoute = resolvePostLoginRoute({
      permissions: user?.permissions,
      onboardingStatus: user?.onboardingStatus,
      currentOnboardingStep: user?.currentOnboardingStep,
    });

    // Safe query redirect (?redirect=...) takes precedence only if onboarding is complete
    const queryRedirect = isBrowser
      ? new URLSearchParams(window.location.search).get("redirect")
      : null;
    const safeRedirect = sanitizeRedirect(queryRedirect, user?.onboardingStatus);

    const targetUrl =
      safeRedirect || result.redirectUrl || dispatcherRoute || "/dashboard";

    router.push(targetUrl);
    router.refresh();
  };

  return (
    <AuthCard
      title="Sign In to Workspace"
      footer={
        <p className="text-xs text-text-muted">
          Don&apos;t have an account yet?{" "}
          <Link
            href="/signup"
            className="text-action hover:text-action-hover font-semibold underline-offset-2 hover:underline"
          >
            Sign up
          </Link>
        </p>
      }
    >
      {/* OAuth Fast Providers */}
      <OAuthProviders disabled={isLoading} onActionTrigger={clearError} />

      {/* Primary Email & Password Form */}
      <EmailPasswordForm
        mode="login"
        onSubmit={handleLogin}
        isLoading={isLoading}
        errorMessage={errorMessage}
        onClearError={clearError}
      />

      {/* FIDO2 / WebAuthn Passkeys */}
      <PasskeyButton
        disabled={isLoading}
        onActionTrigger={clearError}
        onSuccess={handleAuthSuccess}
        onError={(err) => setErrorMessage(err.message)}
      />
    </AuthCard>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginFormContent />
    </Suspense>
  );
}
