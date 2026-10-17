"use client";

import React from "react";
import { Button } from "@suite/ui";
import { GoogleIcon, MicrosoftIcon, GitHubIcon, KeyIcon } from "@suite/ui/icons";
import { oauthRegistry, type OAuthProviderDescriptor } from "@/lib/oauth-registry";
import { isBrowser } from "@/lib/env";

/**
 * OAuth redirect and state parameters (ISP).
 */
export interface OAuthRedirectConfig {
  redirectUri?: string;
  state?: string;
}

/**
 * UI interaction and provider selection handler (ISP).
 */
export interface OAuthInteractionProps {
  onProviderSelect?: (providerId: string) => void;
  onActionTrigger?: () => void;
  disabled?: boolean;
}

/**
 * Composite OAuthProviders properties.
 */
export interface OAuthProvidersProps
  extends OAuthRedirectConfig,
    OAuthInteractionProps {}

function ProviderIcon({ iconName }: { iconName: string }) {
  switch (iconName) {
    case "google":
      return <GoogleIcon size={16} className="shrink-0" />;
    case "microsoft":
      return <MicrosoftIcon size={16} className="shrink-0" />;
    case "github":
      return <GitHubIcon size={16} className="shrink-0" />;
    default:
      return <KeyIcon size={16} className="shrink-0 text-text-muted" />;
  }
}


export function OAuthProviders({
  redirectUri: _redirectUri = "/auth/callback",
  state: _state = "auth_state",
  onProviderSelect,
  onActionTrigger,
  disabled = false,
}: OAuthProvidersProps) {
  const providers = oauthRegistry.getActiveProviders();

  const handleProviderClick = (provider: OAuthProviderDescriptor) => {
    if (disabled) return;
    onActionTrigger?.();
    if (onProviderSelect) {
      onProviderSelect(provider.id);
      return;
    }
    if (isBrowser) {
      window.location.href = `/api/auth/oauth/${provider.id}`;
    }
  };

  if (providers.length === 0) {
    return null;
  }

  return (
    <div className="flex flex-col gap-2.5 w-full">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
        {providers.map((p) => (
          <Button
            key={p.id}
            type="button"
            variant="secondary"
            size="sm"
            fullWidth
            startIcon={<ProviderIcon iconName={p.iconName} />}
            onClick={() => handleProviderClick(p)}
            disabled={disabled}
            className="text-xs"
          >
            <span>{p.name}</span>
          </Button>
        ))}
      </div>

      {/* Divider */}
      <div className="relative flex py-2 items-center">
        <div className="grow border-t border-border" />
        <span className="shrink mx-3 text-[11px] text-text-muted uppercase tracking-wider font-medium">
          or continue with
        </span>
        <div className="grow border-t border-border" />
      </div>
    </div>
  );
}
