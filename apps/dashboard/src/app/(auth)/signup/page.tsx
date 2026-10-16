"use client";

import React, { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AuthCard } from "@/components/auth/auth-card";
import { OAuthProviders } from "@/components/auth/oauth-providers";
import { EmailPasswordForm } from "@/components/auth/email-password-form";

export default function SignupPage() {
  const router = useRouter();
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const handleSignup = async (data: {
    email: string;
    password: string;
    turnstileToken?: string | null;
  }) => {
    setErrorMessage(null);
    setIsLoading(true);

    try {
      const response = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: data.email,
          password: data.password,
          turnstileToken: data.turnstileToken,
        }),
      });

      const result = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(
          result.detail ||
            result.error ||
            "Failed to create account. Please try again.",
        );
      }

      // Redirect directly to initial step-by-step onboarding pipeline
      const targetUrl = result.redirectUrl || "/onboarding/step-1";
      router.push(targetUrl);
      router.refresh();
    } catch (err) {
      setErrorMessage(
        err instanceof Error ? err.message : "Registration failed",
      );
      setIsLoading(false);
    }
  };

  return (
    <AuthCard
      title="Create your Workspace"
      footer={
        <p className="text-xs text-text-muted">
          Already have an active account?{" "}
          <Link
            href="/login"
            className="text-action hover:text-action-hover font-semibold underline-offset-2 hover:underline"
          >
            Sign in
          </Link>
        </p>
      }
    >
      {/* OAuth Fast Registration */}
      <OAuthProviders disabled={isLoading} />

      {/* Registration Form with Real-Time Password Complexity */}
      <EmailPasswordForm
        mode="signup"
        onSubmit={handleSignup}
        isLoading={isLoading}
        errorMessage={errorMessage}
      />

      {/* Legal & Compliance Microcopy */}
      <p className="text-[11px] text-text-muted text-center leading-relaxed">
        By creating an account, you agree to our{" "}
        <a
          href="#terms"
          className="text-text-secondary hover:text-text underline underline-offset-2"
        >
          Terms of Service
        </a>{" "}
        and acknowledge our{" "}
        <a
          href="#privacy"
          className="text-text-secondary hover:text-text underline underline-offset-2"
        >
          Privacy Policy
        </a>
        .
      </p>
    </AuthCard>
  );
}
