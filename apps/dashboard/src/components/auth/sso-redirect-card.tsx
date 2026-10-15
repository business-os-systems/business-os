"use client";

import React from "react";

export interface SSORedirectCardProps {
  organizationName?: string | null;
  domain: string;
  providerType?: string | null;
  ssoLoginUrl?: string | null;
  onSwitchToPassword?: () => void;
  isLoading?: boolean;
}

export function SSORedirectCard({
  organizationName,
  domain,
  providerType,
  ssoLoginUrl,
  onSwitchToPassword,
  isLoading = false,
}: SSORedirectCardProps) {
  const formatProviderName = (type?: string | null): string => {
    if (!type) return "Enterprise Identity Provider";
    if (type.includes("google")) return "Google Workspace";
    if (type.includes("azure") || type.includes("entra") || type.includes("microsoft")) {
      return "Microsoft Entra ID";
    }
    if (type.includes("okta")) return "Okta SSO";
    if (type.includes("saml")) return "SAML 2.0 IdP";
    if (type.includes("oidc")) return "OpenID Connect";
    return type;
  };

  const providerDisplayName = formatProviderName(providerType);

  const handleSsoRedirect = () => {
    if (ssoLoginUrl) {
      window.location.href = ssoLoginUrl;
    }
  };

  return (
    <div className="space-y-4 pt-1 animate-in fade-in duration-200">
      {/* Enterprise Organization Banner */}
      <div className="p-3.5 bg-surface-muted border border-border rounded-xl space-y-2">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-action/15 text-action flex items-center justify-center shrink-0 border border-action/25">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4"
              />
            </svg>
          </div>
          <div className="min-w-0 flex-1">
            <h4 className="text-xs font-bold text-text truncate">
              {organizationName || domain}
            </h4>
            <p className="text-[11px] text-text-secondary truncate">
              {providerDisplayName} • Managed Workspace
            </p>
          </div>
          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold bg-action/15 text-action border border-action/30">
            SSO
          </span>
        </div>
      </div>

      {/* Enterprise SSO CTA Button */}
      <button
        type="button"
        onClick={handleSsoRedirect}
        disabled={isLoading || !ssoLoginUrl}
        className="w-full py-2.5 px-4 bg-action text-on-action rounded-lg text-sm font-semibold hover:opacity-95 active:scale-[0.98] disabled:opacity-50 disabled:pointer-events-none transition-all duration-fast flex items-center justify-center gap-2 shadow-xs group"
      >
        <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"
          />
        </svg>
        <span>Sign in with Enterprise SSO</span>
        <svg
          className="w-4 h-4 shrink-0 transition-transform group-hover:translate-x-0.5"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M14 5l7 7m0 0l-7 7m7-7H3" />
        </svg>
      </button>

      {/* Fallback to Standard Credentials */}
      {onSwitchToPassword && (
        <div className="text-center pt-1">
          <button
            type="button"
            onClick={onSwitchToPassword}
            className="text-xs text-text-secondary hover:text-text font-medium underline underline-offset-4 transition-colors"
          >
            Use standard password instead
          </button>
        </div>
      )}
    </div>
  );
}
