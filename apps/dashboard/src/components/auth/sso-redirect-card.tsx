"use client";

import React from "react";
import { Button } from "@suite/ui";
import { BuildingIcon, ShieldCheckIcon, ArrowRightIcon } from "@suite/ui/icons";

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
            <BuildingIcon size={16} />
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
      <Button
        type="button"
        variant="primary"
        fullWidth
        isLoading={isLoading}
        onClick={handleSsoRedirect}
        disabled={isLoading || !ssoLoginUrl}
        startIcon={<ShieldCheckIcon size={16} className="shrink-0" />}
        endIcon={<ArrowRightIcon size={16} className="shrink-0" />}
        className="group shadow-xs min-h-[44px]"
      >
        <span>Sign in with Enterprise SSO</span>
      </Button>


      {/* Fallback to Standard Credentials */}
      {onSwitchToPassword && (
        <div className="text-center pt-1">
          <Button
            type="button"
            variant="link"
            size="sm"
            onClick={onSwitchToPassword}
            className="text-xs text-text-secondary hover:text-text font-medium underline-offset-4"
          >
            Use standard password instead
          </Button>
        </div>
      )}
    </div>
  );
}
