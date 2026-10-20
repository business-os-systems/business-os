"use client";

import React, { useState, useEffect, useId, useRef } from "react";
import Link from "next/link";
import { validatePasswordComplexity } from "@suite/auth/rules";
import { TIMEOUTS } from "@suite/core";
import { Button, Input, Label, Checkbox } from "@suite/ui";
import { AlertTriangleIcon, EyeIcon, EyeOffIcon } from "@suite/ui/icons";
import { SSORedirectCard } from "./sso-redirect-card";
import { Turnstile } from "./turnstile";
import { isBrowser, isProduction } from "@/lib/env";
import { getTurnstileSiteKey } from "@/lib/turnstile";

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
  onClearError?: () => void;
}

/**
 * Composite EmailPasswordForm properties.
 */
export interface EmailPasswordFormProps
  extends AuthFormSubmissionProps,
    AuthFormStateProps,
    AuthFormActionProps {}

export interface SsoDiscoveryPayload {
  domain: string;
  isEnterprise: boolean;
  providerType: string | null;
  organizationName: string | null;
  ssoLoginUrl: string | null;
}

// Client-side in-memory domain cache to eliminate keystroke fetch spam (Issue 17 & 25)
const ssoDomainMemoryCache = new Map<string, SsoDiscoveryPayload | null>();

export function EmailPasswordForm({
  mode,
  onSubmit,
  isLoading = false,
  errorMessage = null,
  onForgotPassword,
  onClearError,
}: EmailPasswordFormProps) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [keepSignedIn, setKeepSignedIn] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [hasInteractedWithPassword, setHasInteractedWithPassword] = useState(false);
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null);

  // Home Realm Discovery (HRD) State
  const [ssoData, setSsoData] = useState<SsoDiscoveryPayload | null>(null);
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

    const domain = parts[1].toLowerCase();

    // Check client-side memory cache first: zero network cost for cached domains
    if (ssoDomainMemoryCache.has(domain)) {
      const cached = ssoDomainMemoryCache.get(domain) ?? null;
      setSsoData(cached);
      setIsDiscoveringSso(false);
      return;
    }

    const abortController = new AbortController();

    const timer = setTimeout(async () => {
      setIsDiscoveringSso(true);
      try {
        const res = await fetch("/api/auth/sso/discover", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email: trimmed }),
          signal: abortController.signal,
        });
        if (res.ok) {
          const data: SsoDiscoveryPayload = await res.json();
          if (data.isEnterprise && data.ssoLoginUrl) {
            ssoDomainMemoryCache.set(domain, data);
            setSsoData(data);
          } else {
            ssoDomainMemoryCache.set(domain, null);
            setSsoData(null);
          }
        }
      } catch (err: unknown) {
        if (err instanceof DOMException && err.name === "AbortError") {
          return;
        }
        console.error("SSO discovery error:", err);
      } finally {
        setIsDiscoveringSso(false);
      }
    }, TIMEOUTS.SSO_DISCOVERY_DEBOUNCE_MS);

    return () => {
      clearTimeout(timer);
      abortController.abort();
    };
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
          <AlertTriangleIcon size={16} className="shrink-0 mt-0.5" aria-hidden="true" />
          <span className="leading-tight">{errorMessage}</span>
        </div>

      )}

      {/* Email */}
      <div className="flex flex-col gap-1.5">
        <div className="flex items-center justify-between">
          <Label htmlFor={emailId} required>
            Email Address
          </Label>
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
        <Input
          ref={emailInputRef}
          id={emailId}
          name="email"
          type="email"
          required
          autoComplete="username webauthn email"
          hasError={Boolean(errorMessage)}
          aria-describedby={errorMessage ? "auth-error-alert" : undefined}
          value={email}
          onChange={(e) => {
            setEmail(e.target.value);
            if (preferPassword) setPreferPassword(false);
            onClearError?.();
          }}
          disabled={isLoading}
          placeholder="operator@company.com"
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
              <Label htmlFor={passwordId} required>
                Password
              </Label>
              {mode === "login" && (
                onForgotPassword ? (
                  <Button
                    type="button"
                    variant="link"
                    size="sm"
                    onClick={onForgotPassword}
                    className="p-0 h-auto text-xs font-medium text-action hover:text-action-hover underline-offset-2 hover:underline"
                  >
                    Forgot password?
                  </Button>
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
            <Input
              id={passwordId}
              name="password"
              type={showPassword ? "text" : "password"}
              required
              autoComplete={mode === "signup" ? "new-password" : "current-password"}
              hasError={Boolean(errorMessage || (mode === "signup" && hasInteractedWithPassword && !complexity.isValid))}
              aria-describedby={errorMessage ? "auth-error-alert" : undefined}
              value={password}
              onChange={(e) => {
                setPassword(e.target.value);
                setHasInteractedWithPassword(true);
                onClearError?.();
              }}
              disabled={isLoading}
              placeholder="••••••••••••"
              endIcon={
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setShowPassword((prev) => !prev)}
                  aria-label={showPassword ? "Hide password" : "Show password"}
                  className="w-8 h-8 p-0 flex items-center justify-center text-text-muted hover:text-text hover:bg-transparent"
                >
                  {showPassword ? <EyeOffIcon size={16} /> : <EyeIcon size={16} />}

                </Button>
              }
            />

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
                    {complexity.hasMinLength ? "✓" : "○"} 12+ characters
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
            <div className="mt-0.5">
              <Checkbox
                id={keepSignedInId}
                checked={keepSignedIn}
                onChange={(e) => setKeepSignedIn(e.target.checked)}
                disabled={isLoading}
                label="Keep me signed in for 30 days"
              />
            </div>
          )}

          {/* Cloudflare Turnstile Bot Defense (SPEC-02) */}
          <Turnstile onVerify={(token) => setTurnstileToken(token)} />

          {/* Submit Action */}
          <Button
            type="submit"
            variant="primary"
            fullWidth
            isLoading={isLoading}
            disabled={
              isLoading ||
              (isProduction && Boolean(getTurnstileSiteKey()) && !turnstileToken) ||
              (mode === "signup" && hasInteractedWithPassword && !complexity.isValid)
            }
            className="mt-2 min-h-[44px]"
          >
            {mode === "signup" ? "Create Account" : "Sign In with Password"}
          </Button>
        </>
      )}
    </form>
  );
}
