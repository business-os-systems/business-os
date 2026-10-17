"use client";

import React, { useState, useMemo, Suspense } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { AuthCard } from "@/components/auth/auth-card";
import { validatePasswordComplexity } from "@suite/auth/rules";
import { Button, Input, Label, Spinner } from "@suite/ui";
import { CheckIcon, AlertTriangleIcon, EyeIcon, EyeOffIcon } from "@suite/ui/icons";

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
            <CheckIcon size={20} />
          </div>
          <p className="text-sm font-semibold text-text">Password Reset Complete</p>
          <p className="text-xs text-text-secondary leading-relaxed">
            Your password has been securely updated and all previous sessions have been revoked. Redirecting to workspace...
          </p>
        </div>
      ) : !token ? (
        <div className="flex flex-col items-center gap-3 py-2 text-center">
          <div className="w-10 h-10 rounded-full bg-danger/10 text-danger flex items-center justify-center">
            <AlertTriangleIcon size={20} />
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
              <AlertTriangleIcon size={16} className="shrink-0 mt-0.5" />
              <span className="leading-tight">{errorMessage}</span>
            </div>
          )}


          {/* New Password Field */}
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="new-password" required>
              New Password
            </Label>
            <Input
              id="new-password"
              name="newPassword"
              type={showPassword ? "text" : "password"}
              required
              autoComplete="new-password"
              hasError={Boolean(errorMessage || (newPassword.length > 0 && !complexity.isValid))}
              aria-describedby={errorMessage ? "reset-password-error" : undefined}
              value={newPassword}
              onChange={(e) => {
                setNewPassword(e.target.value);
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
            <Label htmlFor="confirm-password" required>
              Confirm New Password
            </Label>
            <Input
              id="confirm-password"
              name="confirmPassword"
              type={showConfirmPassword ? "text" : "password"}
              required
              autoComplete="new-password"
              hasError={Boolean(errorMessage || (confirmPassword.length > 0 && !passwordsMatch))}
              aria-describedby={errorMessage ? "reset-password-error" : undefined}
              value={confirmPassword}
              onChange={(e) => {
                setConfirmPassword(e.target.value);
                if (errorMessage) setErrorMessage(null);
              }}
              disabled={isLoading}
              placeholder="••••••••••••"
              endIcon={
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                  tabIndex={-1}
                  aria-label={showConfirmPassword ? "Hide confirm password" : "Show confirm password"}
                  className="w-8 h-8 p-0 flex items-center justify-center text-text-muted hover:text-text hover:bg-transparent"
                >
                  {showConfirmPassword ? <EyeOffIcon size={16} /> : <EyeIcon size={16} />}
                </Button>

              }
            />
            {confirmPassword.length > 0 && !passwordsMatch && (
              <span className="text-[11px] text-danger">Passwords do not match</span>
            )}
          </div>

          <Button
            type="submit"
            variant="primary"
            fullWidth
            isLoading={isLoading}
            disabled={isSubmitDisabled}
            className="mt-1 min-h-[44px]"
          >
            Reset Password
          </Button>
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
            <Spinner size="md" color="action" />
          </div>
        </AuthCard>
      }
    >
      <ResetPasswordForm />
    </Suspense>
  );
}
