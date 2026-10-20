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
 * Cloudflare Turnstile Challenge Widget (Interaction-Only Mode)
 * Collapses to zero height (0px) for seamless, zero-gap aesthetics.
 * Expands dynamically only if Cloudflare detects suspicious traffic and prompts a human challenge.
 * Returns null if Turnstile is unconfigured in environment.
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
    if (!isBrowser || !siteKey) return;

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
        console.warn("[Turnstile] Widget rendering failed:", err);
        onError?.();
        setIsInteractive(false);
      }
    };

    if (window.turnstile) {
      renderWidget();
    } else {
      const existingScript = document.querySelector(
        'script[src^="https://challenges.cloudflare.com/turnstile/v0/api.js"]'
      );

      if (!existingScript) {
        const script = document.createElement("script");
        script.src =
          "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
        script.async = true;
        script.defer = true;
        script.onload = () => renderWidget();
        script.onerror = () => {
          console.warn("[Turnstile] Script load error");
          onError?.();
        };
        document.head.appendChild(script);
      } else {
        const interval = setInterval(() => {
          if (window.turnstile) {
            clearInterval(interval);
            renderWidget();
          }
        }, 50);
        return () => clearInterval(interval);
      }
    }

    return () => {
      if (widgetIdRef.current && window.turnstile) {
        try {
          window.turnstile.remove(widgetIdRef.current);
        } catch {
          // Ignore teardown error
        }
        widgetIdRef.current = null;
      }
    };
  }, [siteKey, onVerify, onError, onExpire]);

  // If Turnstile is unconfigured, render nothing
  if (!siteKey) {
    return null;
  }

  return (
    <div
      className={`turnstile-widget relative transition-all duration-300 ease-out ${
        isInteractive ? "min-h-[65px] opacity-100 my-2" : "h-0 opacity-0 overflow-hidden"
      } ${className}`}
      aria-hidden={!isInteractive}
    >
      <div
        ref={containerRef}
        className="cf-turnstile-container flex justify-center w-full"
      />
    </div>
  );
}
