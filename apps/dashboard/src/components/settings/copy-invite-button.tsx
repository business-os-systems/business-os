import React, { useState, useEffect } from "react";
import { Button, CopyIcon, CheckIcon } from "@suite/ui";

export interface CopyInviteButtonProps {
  /**
   * The invitation or onboarding URL to copy.
   */
  inviteUrl: string;
  /**
   * Initial idle button label. Defaults to "Copy Link".
   */
  label?: string;
  /**
   * Temporary label shown upon successful copy. Defaults to "Copied!".
   */
  copiedLabel?: string;
  /**
   * Visual variant from @suite/ui Button.
   */
  variant?: "default" | "secondary" | "outline" | "ghost";
  /**
   * Button size.
   */
  size?: "default" | "sm" | "lg" | "icon";
  /**
   * Optional callback triggered when copying succeeds.
   */
  onCopy?: () => void;
  /**
   * Optional custom CSS class name.
   */
  className?: string;
}

/**
 * CopyInviteButton
 *
 * 1-click clipboard copy button for personal invite links.
 * Provides instant visual confirmation with a checkmark for WhatsApp / chat dispatch.
 */
export function CopyInviteButton({
  inviteUrl,
  label = "Copy Link",
  copiedLabel = "Copied!",
  variant = "outline",
  size = "sm",
  onCopy,
  className = "",
}: CopyInviteButtonProps) {
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => {
      setCopied(false);
    }, 2000);
    return () => clearTimeout(timer);
  }, [copied]);

  const handleCopy = async () => {
    try {
      if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(inviteUrl);
      }
      setCopied(true);
      onCopy?.();
    } catch {
      // Fallback or silently handle copy failure
    }
  };

  return (
    <Button
      type="button"
      variant={variant}
      size={size}
      onClick={handleCopy}
      className={`inline-flex items-center gap-1.5 transition-all ${
        copied ? "text-success border-success/40 bg-success/5" : ""
      } ${className}`}
      aria-label={copied ? copiedLabel : label}
    >
      {copied ? (
        <CheckIcon className="h-4 w-4 text-success shrink-0" aria-hidden="true" />
      ) : (
        <CopyIcon className="h-4 w-4 shrink-0 text-text-muted" aria-hidden="true" />
      )}
      <span className="text-xs font-medium">{copied ? copiedLabel : label}</span>
    </Button>
  );
}
