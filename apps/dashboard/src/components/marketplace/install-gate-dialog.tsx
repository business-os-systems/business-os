"use client";

import React, { useState, useEffect } from "react";
import { Button } from "@suite/ui";
import { AlertTriangleIcon } from "@suite/ui/icons";

export interface InstallGateDialogProps {
  isOpen: boolean;
  onClose: () => void;
  userEmail?: string;
}

export function InstallGateDialog({
  isOpen,
  onClose,
  userEmail,
}: InstallGateDialogProps) {
  const [cooldown, setCooldown] = useState(0);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [statusMessage, setStatusMessage] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);

  useEffect(() => {
    if (cooldown <= 0) return;
    const interval = setInterval(() => {
      setCooldown((prev) => prev - 1);
    }, 1000);
    return () => clearInterval(interval);
  }, [cooldown]);

  if (!isOpen) return null;

  const handleResend = async () => {
    if (cooldown > 0 || isSubmitting) return;

    setIsSubmitting(true);
    setStatusMessage(null);

    try {
      const res = await fetch("/api/auth/verify-email/request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: userEmail }),
      });

      const data = await res.json();

      if (res.ok) {
        setStatusMessage({
          type: "success",
          text: "Verification link dispatched to your inbox.",
        });
        setCooldown(60);
      } else {
        setStatusMessage({
          type: "error",
          text: data.detail || "Unable to dispatch verification link.",
        });
        if (res.status === 429 && data.retryAfter) {
          setCooldown(Math.min(data.retryAfter, 60));
        }
      }
    } catch {
      setStatusMessage({
        type: "error",
        text: "Network error. Please try again.",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="install-gate-title"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-150"
    >
      {/* modal-sm envelope (max-w-[400px], 400px width constraint) */}
      <div className="w-full max-w-[400px] rounded-2xl border border-border bg-surface p-6 shadow-2xl flex flex-col gap-4 text-center">
        {/* Warning Icon Badge */}
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-warning/15 text-warning border border-warning/30">
          <AlertTriangleIcon size={24} className="text-warning" />
        </div>


        {/* Headline */}
        <div className="flex flex-col gap-1.5">
          <h2
            id="install-gate-title"
            className="text-lg font-bold text-text tracking-tight"
          >
            Email verification required
          </h2>
          <p className="text-xs text-text-muted leading-relaxed">
            You must verify your email address before installing new applications to your workspace.
          </p>
        </div>

        {statusMessage && (
          <div
            className={`p-2.5 rounded-lg text-xs font-medium text-left ${
              statusMessage.type === "success"
                ? "bg-action/10 text-action border border-action/20"
                : "bg-danger/10 text-danger border border-danger/20"
            }`}
          >
            {statusMessage.text}
          </div>
        )}

        {/* Actions */}
        <div className="flex flex-col gap-2 pt-2 border-t border-border-hairline">
          <Button
            type="button"
            variant="primary"
            fullWidth
            disabled={isSubmitting || cooldown > 0}
            isLoading={isSubmitting}
            onClick={handleResend}
            className="py-2.5 text-xs font-semibold"
          >
            {isSubmitting
              ? "Sending..."
              : cooldown > 0
              ? `Resend available in ${cooldown}s`
              : "Resend verification email"}
          </Button>


          <Button
            type="button"
            variant="ghost"
            onClick={onClose}
            className="w-full text-xs text-text-muted hover:text-text hover:bg-surface-hover py-2 rounded-lg transition-colors"
          >
            Cancel
          </Button>
        </div>
      </div>
    </div>
  );
}
