"use client";

import React, { useState, useMemo, Suspense } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { AuthCard } from "@/components/auth/auth-card";
import { validatePasswordComplexity } from "@suite/auth/rules";

function ResetPasswordForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get("token") || "";

  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const complexity = useMemo(() => {
    return validatePasswordComplexity(newPassword);
  }, [newPassword]);

  const passwordsMatch = newPassword.length > 0 && newPassword === confirmPassword;
  const isSubmitDisabled = isLoading || !token || !complexity.isValid || !passwordsMatch;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSubmitDisabled) return;

    setIsLoading(true);
    setErrorMessage(null);

    try {
      const response = await fetch("/api/auth/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          token,
          newPassword,
          confirmPassword,
        }),
      });

      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(
          data.detail || data.error || "Failed to reset password. Please try again."
        );
      }

      setIsSuccess(true);
      setTimeout(() => {
        router.push(data.redirectUrl || "/dashboard");
      }, 1500);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to reset password.";
      setErrorMessage(msg);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <AuthCard
      title="Set new password"
      subtitle="Enter a new secure password for your account."
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
      {isSuccess ? (
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
          <p className="text-sm font-semibold text-text">Password Reset Complete</p>
          <p className="text-xs text-text-secondary leading-relaxed">
            Your password has been securely updated and all previous sessions have been revoked. Redirecting to workspace...
          </p>
        </div>
      ) : !token ? (
        <div className="flex flex-col items-center gap-3 py-2 text-center">
          <div className="w-10 h-10 rounded-full bg-danger/10 text-danger flex items-center justify-center">
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
                d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
              />
            </svg>
          </div>
          <p className="text-sm font-semibold text-text">Invalid Reset Link</p>
          <p className="text-xs text-text-secondary leading-relaxed">
            Missing verification token. Please initiate a new password reset request.
          </p>
          <Link
            href="/forgot-password"
            className="mt-2 text-xs text-action hover:text-action-hover font-semibold underline underline-offset-2"
          >
            Request new reset link
          </Link>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="flex flex-col gap-3 text-text" noValidate>
          {errorMessage && (
            <div
              id="reset-password-error"
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

          {/* New Password Field */}
          <div className="flex flex-col gap-1.5">
            <label htmlFor="new-password" className="text-xs font-semibold text-text">
              New Password
            </label>
            <div className="relative">
              <input
                id="new-password"
                name="newPassword"
                type={showPassword ? "text" : "password"}
                required
                autoComplete="new-password"
                aria-invalid={Boolean(errorMessage || (newPassword.length > 0 && !complexity.isValid))}
                aria-describedby={errorMessage ? "reset-password-error" : undefined}
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
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

          {/* Real-time Complexity Indicators */}
          {newPassword.length > 0 && (
            <div className="grid grid-cols-2 gap-1.5 p-2 rounded-lg bg-surface-subtle border border-border text-[11px]">
              <div className={`flex items-center gap-1.5 ${complexity.hasMinLength ? "text-success font-medium" : "text-text-muted"}`}>
                <span>{complexity.hasMinLength ? "✓" : "○"}</span>
                <span>8+ characters</span>
              </div>
              <div className={`flex items-center gap-1.5 ${complexity.hasUppercase ? "text-success font-medium" : "text-text-muted"}`}>
                <span>{complexity.hasUppercase ? "✓" : "○"}</span>
                <span>1 uppercase letter</span>
              </div>
              <div className={`flex items-center gap-1.5 ${complexity.hasNumber ? "text-success font-medium" : "text-text-muted"}`}>
                <span>{complexity.hasNumber ? "✓" : "○"}</span>
                <span>1 number</span>
              </div>
              <div className={`flex items-center gap-1.5 ${complexity.hasSpecialSymbol ? "text-success font-medium" : "text-text-muted"}`}>
                <span>{complexity.hasSpecialSymbol ? "✓" : "○"}</span>
                <span>1 special symbol</span>
              </div>
            </div>
          )}

          {/* Confirm Password Field */}
          <div className="flex flex-col gap-1.5">
            <label htmlFor="confirm-password" className="text-xs font-semibold text-text">
              Confirm New Password
            </label>
            <div className="relative">
              <input
                id="confirm-password"
                name="confirmPassword"
                type={showConfirmPassword ? "text" : "password"}
                required
                autoComplete="new-password"
                aria-invalid={Boolean(errorMessage || (confirmPassword.length > 0 && !passwordsMatch))}
                aria-describedby={errorMessage ? "reset-password-error" : undefined}
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                disabled={isLoading}
                placeholder="••••••••••••"
                className="w-full pl-3 pr-11 py-2 text-sm rounded-lg bg-surface border border-border text-text placeholder:text-text-disabled focus:outline-none focus:border-action focus:ring-1 focus:ring-action transition-colors"
              />
              <button
                type="button"
                onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                tabIndex={-1}
                aria-label={showConfirmPassword ? "Hide confirm password" : "Show confirm password"}
                className="absolute right-0 top-1/2 -translate-y-1/2 w-11 h-11 min-w-[44px] min-h-[44px] flex items-center justify-center text-text-muted hover:text-text transition-colors"
              >
                {showConfirmPassword ? (
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
            {confirmPassword.length > 0 && !passwordsMatch && (
              <span className="text-[11px] text-danger">Passwords do not match</span>
            )}
          </div>

          <button
            type="submit"
            disabled={isSubmitDisabled}
            className="w-full mt-1 py-2.5 px-4 min-h-[44px] rounded-lg bg-action hover:bg-action-hover active:bg-action-active text-on-action font-semibold text-sm shadow-xs transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          >
            {isLoading ? "Updating password..." : "Reset Password"}
          </button>
        </form>
      )}
    </AuthCard>
  );
}

export default function ResetPasswordPage() {
  return (
    <Suspense
      fallback={
        <AuthCard title="Set new password" subtitle="Loading verification ticket...">
          <div className="py-6 flex items-center justify-center">
            <div className="w-6 h-6 border-2 border-action border-t-transparent rounded-full animate-spin" />
          </div>
        </AuthCard>
      }
    >
      <ResetPasswordForm />
    </Suspense>
  );
}
