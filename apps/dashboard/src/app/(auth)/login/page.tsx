"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AuthCard } from "@/components/auth/auth-card";
import { OAuthProviders } from "@/components/auth/oauth-providers";
import { EmailPasswordForm } from "@/components/auth/email-password-form";
import { PasskeyButton } from "@/components/auth/passkey-button";
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

export default function LoginPage() {
  const router = useRouter();
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (!isBrowser) return;
    const params = new URLSearchParams(window.location.search);
    const errorParam = params.get("error");
    if (errorParam === "sso_unconfigured") {
      const org = params.get("org") || params.get("domain") || "your organization";
      setErrorMessage(
        `Enterprise SSO is not yet configured for ${org}. Please sign in with your email and password.`
      );
    } else if (errorParam === "sso_not_found") {
      setErrorMessage(
        "Enterprise SSO connection not found. Please sign in with your email and password."
      );
    }
  }, []);

  const handleLogin = async (data: {
    email: string;
    password: string;
    keepSignedIn?: boolean;
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
        assignedAppIds: user?.assignedAppIds,
        assignedAppCodes: user?.assignedAppCodes,
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
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : "Failed to sign in");
      setIsLoading(false);
    }
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
      <OAuthProviders disabled={isLoading} />

      {/* Primary Email & Password Form */}
      <EmailPasswordForm
        mode="login"
        onSubmit={handleLogin}
        isLoading={isLoading}
        errorMessage={errorMessage}
      />

      {/* FIDO2 / WebAuthn Passkeys */}
      <PasskeyButton disabled={isLoading} />
    </AuthCard>
  );
}
