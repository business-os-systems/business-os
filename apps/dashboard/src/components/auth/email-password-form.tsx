"use client";

import React, { useState, useEffect, useId, useRef } from "react";
import Link from "next/link";
import { validatePasswordComplexity } from "@suite/auth/rules";
import { SSORedirectCard } from "./sso-redirect-card";
import { Turnstile } from "./turnstile";
import { isBrowser } from "@/lib/env";

/**
 * User credentials payload for authentication submission (ISP).
 */
export interface AuthCredentialsData {
  email: string;
  password: string;
  keepSignedIn?: boolean;
  turnstileToken?: string | null;
}

/**
 * Primary form mode & dispatch handler (ISP).
 */
export interface AuthFormSubmissionProps {
  mode: "login" | "signup";
  onSubmit: (data: AuthCredentialsData) => Promise<void> | void;
}

/**
 * Async mutation & feedback status state (ISP).
 */
export interface AuthFormStateProps {
  isLoading?: boolean;
  errorMessage?: string | null;
}

/**
 * Supplementary action triggers (ISP).
 */
export interface AuthFormActionProps {
  onForgotPassword?: () => void;
}

/**
 * Composite EmailPasswordForm properties.
 */
export interface EmailPasswordFormProps
  extends AuthFormSubmissionProps,
    AuthFormStateProps,
    AuthFormActionProps {}

export function EmailPasswordForm({
  mode,
  onSubmit,
  isLoading = false,
  errorMessage = null,
  onForgotPassword,
}: EmailPasswordFormProps) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [keepSignedIn, setKeepSignedIn] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [hasInteractedWithPassword, setHasInteractedWithPassword] = useState(false);
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null);

  // Home Realm Discovery (HRD) State
  const [ssoData, setSsoData] = useState<{
    domain: string;
    isEnterprise: boolean;
    providerType: string | null;
    organizationName: string | null;
    ssoLoginUrl: string | null;
  } | null>(null);
  const [preferPassword, setPreferPassword] = useState(false);
  const [isDiscoveringSso, setIsDiscoveringSso] = useState(false);

  const emailId = useId();
  const passwordId = useId();
  const keepSignedInId = useId();
  const emailInputRef = useRef<HTMLInputElement>(null);

  const complexity = validatePasswordComplexity(password);

  // Hydrate email on mount from URL parameters or autofilled input DOM
  useEffect(() => {
    if (!isBrowser) return;
    const params = new URLSearchParams(window.location.search);
    const queryEmail = params.get("email");
    if (queryEmail) {
      setEmail(queryEmail);
    } else if (emailInputRef.current?.value) {
      setEmail(emailInputRef.current.value);
    }

    if (params.get("error") === "sso_unconfigured") {
      setPreferPassword(true);
    }
  }, []);

  useEffect(() => {
    if (mode !== "login") return;

    const trimmed = email.trim().toLowerCase();
    const parts = trimmed.split("@");
    if (parts.length !== 2 || !parts[1] || !parts[1].includes(".")) {
      setSsoData(null);
      setPreferPassword(false);
      return;
    }

    const timer = setTimeout(async () => {
      setIsDiscoveringSso(true);
      try {
        const res = await fetch("/api/auth/sso/discover", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email: trimmed }),
        });
        if (res.ok) {
          const data = await res.json();
          if (data.isEnterprise && data.ssoLoginUrl) {
            setSsoData(data);
          } else {
            setSsoData(null);
          }
        }
      } catch (err) {
        console.error("SSO discovery error:", err);
      } finally {
        setIsDiscoveringSso(false);
      }
    }, 300);

    return () => clearTimeout(timer);
  }, [email, mode]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isLoading) return;

    // If enterprise SSO is active and user has not chosen password, Enter triggers SSO
    if (mode === "login" && ssoData?.isEnterprise && !preferPassword && ssoData.ssoLoginUrl) {
      const finalUrl = `${ssoData.ssoLoginUrl}?email=${encodeURIComponent(email.trim().toLowerCase())}`;
      window.location.href = finalUrl;
      return;
    }

    if (mode === "signup" && !complexity.isValid) {
      setHasInteractedWithPassword(true);
      return;
    }
    await onSubmit({
      email: email.trim(),
      password,
      keepSignedIn: mode === "login" ? keepSignedIn : undefined,
      turnstileToken,
    });
  };

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4 text-text" noValidate>
      {/* Global Error Banner */}
      {errorMessage && (
        <div
          id="auth-error-alert"
          role="alert"
          className="p-3 text-xs rounded-lg border border-danger/30 bg-danger/10 text-danger flex items-start gap-2"
        >
          <svg
            className="w-4 h-4 shrink-0 mt-0.5"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            aria-hidden="true"
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

      {/* Email */}
      <div className="flex flex-col gap-1.5">
        <div className="flex items-center justify-between">
          <label htmlFor={emailId} className="text-xs font-semibold text-text">
            Email Address
          </label>
          {isDiscoveringSso && (
            <span className="text-[10px] text-text-muted flex items-center gap-1 animate-pulse">
              Checking SSO...
            </span>
          )}
          {ssoData?.isEnterprise && !isDiscoveringSso && (
            <span className="text-[10px] font-medium text-action flex items-center gap-1">
              ✓ SSO Enabled
            </span>
          )}
        </div>
        <input
          ref={emailInputRef}
          id={emailId}
          name="email"
          type="email"
          required
          autoComplete="username webauthn email"
          aria-invalid={Boolean(errorMessage)}
          aria-describedby={errorMessage ? "auth-error-alert" : undefined}
          value={email}
          onChange={(e) => {
            setEmail(e.target.value);
            if (preferPassword) setPreferPassword(false);
          }}
          disabled={isLoading}
          placeholder="operator@company.com"
          className="w-full px-3 py-2 text-sm rounded-lg bg-surface border border-border text-text placeholder:text-text-disabled focus:outline-none focus:border-action focus:ring-1 focus:ring-action transition-colors"
        />
      </div>

      {mode === "login" && ssoData?.isEnterprise && !preferPassword ? (
        <SSORedirectCard
          organizationName={ssoData.organizationName}
          domain={ssoData.domain}
          providerType={ssoData.providerType}
          ssoLoginUrl={
            ssoData.ssoLoginUrl
              ? `${ssoData.ssoLoginUrl}?email=${encodeURIComponent(email.trim().toLowerCase())}`
              : null
          }
          onSwitchToPassword={() => setPreferPassword(true)}
          isLoading={isLoading}
        />
      ) : (
        <>
          {/* Password with Visibility Toggle */}
          <div className="flex flex-col gap-1.5">
            <div className="flex items-center justify-between">
              <label htmlFor={passwordId} className="text-xs font-semibold text-text">
                Password
              </label>
              {mode === "login" && (
                onForgotPassword ? (
                  <button
                    type="button"
                    onClick={onForgotPassword}
                    className="text-xs text-action hover:text-action-hover font-medium underline-offset-2 hover:underline"
                  >
                    Forgot password?
                  </button>
                ) : (
                  <Link
                    href="/forgot-password"
                    className="text-xs text-action hover:text-action-hover font-medium underline-offset-2 hover:underline"
                  >
                    Forgot password?
                  </Link>
                )
              )}
            </div>
            <div className="relative flex items-center">
              <input
                id={passwordId}
                name="password"
                type={showPassword ? "text" : "password"}
                required
                autoComplete={mode === "signup" ? "new-password" : "current-password"}
                aria-invalid={Boolean(errorMessage || (mode === "signup" && hasInteractedWithPassword && !complexity.isValid))}
                aria-describedby={errorMessage ? "auth-error-alert" : undefined}
                value={password}
                onChange={(e) => {
                  setPassword(e.target.value);
                  setHasInteractedWithPassword(true);
                }}
                disabled={isLoading}
                placeholder="••••••••••••"
                className="w-full pl-3 pr-11 py-2 text-sm rounded-lg bg-surface border border-border text-text placeholder:text-text-disabled focus:outline-none focus:border-action focus:ring-1 focus:ring-action transition-colors"
              />
              <button
                type="button"
                onClick={() => setShowPassword((prev) => !prev)}
                aria-label={showPassword ? "Hide password" : "Show password"}
                className="absolute right-0 w-11 h-11 min-w-[44px] min-h-[44px] flex items-center justify-center text-text-muted hover:text-text transition-colors focus:outline-none"
              >
                {showPassword ? (
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l18 18"
                    />
                  </svg>
                ) : (
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
                    />
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"
                    />
                  </svg>
                )}
              </button>
            </div>

            {/* Real-Time Password Complexity Indicator (Signup mode) */}
            {mode === "signup" && hasInteractedWithPassword && (
              <div className="mt-1 p-2.5 rounded-lg bg-surface-muted border border-border text-xs flex flex-col gap-1.5">
                <span className="font-semibold text-text-secondary">Password Requirements:</span>
                <div className="grid grid-cols-2 gap-1 text-[11px]">
                  <span
                    className={`flex items-center gap-1 ${
                      complexity.hasMinLength ? "text-success" : "text-text-muted"
                    }`}
                  >
                    {complexity.hasMinLength ? "✓" : "○"} 8+ characters
                  </span>
                  <span
                    className={`flex items-center gap-1 ${
                      complexity.hasUppercase ? "text-success" : "text-text-muted"
                    }`}
                  >
                    {complexity.hasUppercase ? "✓" : "○"} 1 uppercase
                  </span>
                  <span
                    className={`flex items-center gap-1 ${
                      complexity.hasNumber ? "text-success" : "text-text-muted"
                    }`}
                  >
                    {complexity.hasNumber ? "✓" : "○"} 1 number
                  </span>
                  <span
                    className={`flex items-center gap-1 ${
                      complexity.hasSpecialSymbol ? "text-success" : "text-text-muted"
                    }`}
                  >
                    {complexity.hasSpecialSymbol ? "✓" : "○"} 1 symbol
                  </span>
                </div>
              </div>
            )}
          </div>

          {/* Keep me signed in (Login mode) */}
          {mode === "login" && (
            <div className="flex items-center gap-2 mt-0.5">
              <input
                id={keepSignedInId}
                type="checkbox"
                checked={keepSignedIn}
                onChange={(e) => setKeepSignedIn(e.target.checked)}
                disabled={isLoading}
                className="w-4 h-4 rounded border-border text-action focus:ring-action"
              />
              <label htmlFor={keepSignedInId} className="text-xs text-text-secondary cursor-pointer select-none">
                Keep me signed in for 30 days
              </label>
            </div>
          )}

          {/* Cloudflare Turnstile Bot Defense (SPEC-02) */}
          <Turnstile onVerify={(token) => setTurnstileToken(token)} />

          {/* Submit Action */}
          <button
            type="submit"
            disabled={isLoading || (mode === "signup" && hasInteractedWithPassword && !complexity.isValid)}
            className="w-full mt-2 py-2.5 px-4 min-h-[44px] rounded-lg bg-action hover:bg-action-hover active:bg-action-active text-on-action font-semibold text-sm shadow-xs transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          >
            {isLoading && (
              <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-on-action" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path
                  className="opacity-75"
                  fill="currentColor"
                  d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                />
              </svg>
            )}
            {mode === "signup" ? "Create Account" : "Sign In with Password"}
          </button>
        </>
      )}
    </form>
  );
}
