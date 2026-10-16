"use client";

import React, { useEffect, useRef, useState } from "react";
import { isBrowser } from "@/lib/env";
import { getTurnstileSiteKey } from "@/lib/turnstile";

declare global {
  interface Window {
    turnstile?: {
      render: (
        container: HTMLElement | string,
        params: {
          sitekey: string;
          callback?: (token: string) => void;
          "error-callback"?: () => void;
          "expired-callback"?: () => void;
          "before-interactive-callback"?: () => void;
          theme?: "light" | "dark" | "auto";
          size?: "normal" | "compact" | "flexible";
          appearance?: "always" | "execute" | "interaction-only";
        }
      ) => string;
      reset: (widgetId: string) => void;
      remove: (widgetId: string) => void;
    };
  }
}

export interface TurnstileProps {
  onVerify: (token: string) => void;
  onError?: () => void;
  onExpire?: () => void;
  className?: string;
}

/**
 * Cloudflare Turnstile Challenge Widget (Option A - Interaction-Only Mode)
 * Collapses to zero height (0px) for seamless, zero-gap aesthetics.
 * Expands dynamically only if Cloudflare detects suspicious traffic and prompts a human challenge.
 */
export function Turnstile({
  onVerify,
  onError,
  onExpire,
  className = "",
}: TurnstileProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const widgetIdRef = useRef<string | null>(null);
  const siteKey = getTurnstileSiteKey();
  const [isInteractive, setIsInteractive] = useState(false);

  useEffect(() => {
    if (!isBrowser) return;

    // In automated testing environment, issue deterministic test token immediately
    if (process.env.NODE_ENV === "test") {
      onVerify("cf-turnstile-test-token-valid");
      return;
    }

    if (!siteKey) {
      // In local dev without keys, issue fallback dummy token
      onVerify("cf-turnstile-local-dev-bypass");
      return;
    }

    const renderWidget = () => {
      if (!containerRef.current || !window.turnstile) return;
      if (widgetIdRef.current) return;

      try {
        const id = window.turnstile.render(containerRef.current, {
          sitekey: siteKey,
          theme: "auto",
          size: "normal",
          appearance: "interaction-only",
          callback: (token: string) => {
            onVerify(token);
            setIsInteractive(false);
          },
          "before-interactive-callback": () => {
            setIsInteractive(true);
          },
          "error-callback": () => {
            onError?.();
            setIsInteractive(false);
          },
          "expired-callback": () => {
            onExpire?.();
          },
        });
        widgetIdRef.current = id;
      } catch (err) {
        console.warn("Turnstile initialization failed:", err);
        onVerify("cf-turnstile-fallback-token");
        setIsInteractive(false);
        onError?.();
      }
    };

    if (window.turnstile) {
      renderWidget();
    } else {
      const scriptId = "cf-turnstile-script";
      let script = document.getElementById(scriptId) as HTMLScriptElement | null;
      if (!script) {
        script = document.createElement("script");
        script.id = scriptId;
        script.src = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
        script.async = true;
        script.defer = true;
        script.onload = () => {
          renderWidget();
        };
        script.onerror = () => {
          onVerify("cf-turnstile-local-bypass");
          setIsInteractive(false);
        };
        document.head.appendChild(script);
      }

      const checkInterval = setInterval(() => {
        if (window.turnstile) {
          clearInterval(checkInterval);
          renderWidget();
        }
      }, 100);

      const timeout = setTimeout(() => {
        clearInterval(checkInterval);
        if (!widgetIdRef.current) {
          onVerify("cf-turnstile-timeout-bypass");
          setIsInteractive(false);
        }
      }, 4000);

      return () => {
        clearInterval(checkInterval);
        clearTimeout(timeout);
      };
    }

    return () => {
      if (widgetIdRef.current && window.turnstile) {
        try {
          window.turnstile.remove(widgetIdRef.current);
        } catch {
          // Ignore cleanup errors
        }
        widgetIdRef.current = null;
      }
    };
  }, [siteKey, onVerify, onError, onExpire]);

  return (
    <div
      data-testid="turnstile-widget"
      className={`${
        isInteractive
          ? "flex items-center justify-center my-2"
          : "h-0 overflow-hidden opacity-0 pointer-events-none"
      } ${className}`}
    >
      <div ref={containerRef} id="cf-turnstile-container" />
    </div>
  );
}
