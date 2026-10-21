"use client";

import { useEffect, useState } from "react";
import { isBrowser } from "./env";
import { getTurnstileSiteKey } from "./turnstile";

export interface TurnstileClientConfig {
  siteKey: string;
  isConfigured: boolean;
  isLoading: boolean;
}

let cachedConfig: { siteKey: string; isConfigured: boolean } | null = null;
let pendingFetch: Promise<{ siteKey: string; isConfigured: boolean }> | null = null;

async function fetchTurnstileConfig(): Promise<{ siteKey: string; isConfigured: boolean }> {
  if (cachedConfig) return cachedConfig;
  if (pendingFetch) return pendingFetch;

  pendingFetch = fetch("/api/auth/turnstile/config")
    .then((res) => (res.ok ? res.json() : { siteKey: "", isConfigured: false }))
    .then((data) => {
      cachedConfig = {
        siteKey: typeof data.siteKey === "string" ? data.siteKey : "",
        isConfigured: Boolean(data.isConfigured),
      };
      pendingFetch = null;
      return cachedConfig;
    })
    .catch(() => {
      pendingFetch = null;
      return { siteKey: "", isConfigured: false };
    });

  return pendingFetch;
}

/**
 * React hook to retrieve Cloudflare Turnstile configuration dynamically.
 * Prioritizes build-time NEXT_PUBLIC_TURNSTILE_SITE_KEY if present;
 * otherwise gracefully hydrates from /api/auth/turnstile/config at runtime.
 */
export function useTurnstileConfig(): TurnstileClientConfig {
  const buildSiteKey = getTurnstileSiteKey();
  const [config, setConfig] = useState<TurnstileClientConfig>(() => {
    if (cachedConfig) {
      return { ...cachedConfig, isLoading: false };
    }
    if (buildSiteKey) {
      return { siteKey: buildSiteKey, isConfigured: true, isLoading: false };
    }
    return { siteKey: "", isConfigured: false, isLoading: isBrowser };
  });

  useEffect(() => {
    if (!isBrowser) return;
    if (config.siteKey || (cachedConfig && !config.isLoading)) return;

    let isMounted = true;
    fetchTurnstileConfig().then((res) => {
      if (isMounted) {
        setConfig({
          siteKey: res.siteKey,
          isConfigured: res.isConfigured,
          isLoading: false,
        });
      }
    });

    return () => {
      isMounted = false;
    };
  }, [config.siteKey, config.isLoading]);

  return config;
}
