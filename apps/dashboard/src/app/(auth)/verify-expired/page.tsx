"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { AuthCard } from "@/components/auth/auth-card";
import { Button, Input, Label } from "@suite/ui";
import { AlertTriangleIcon } from "@suite/ui/icons";
import { isBrowser } from "@/lib/env";

export default function VerifyExpiredPage() {
  const [email, setEmail] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [cooldown, setCooldown] = useState(0);
  const [statusMessage, setStatusMessage] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);

  useEffect(() => {
    if (!isBrowser) return;
    const params = new URLSearchParams(window.location.search);
    const emailParam = params.get("email");
    if (emailParam) {
      setEmail(emailParam);
    }
  }, []);

  useEffect(() => {
    if (cooldown <= 0) return;
    const interval = setInterval(() => {
      setCooldown((prev) => prev - 1);
    }, 1000);
    return () => clearInterval(interval);
  }, [cooldown]);

  const handleResend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || cooldown > 0 || isSubmitting) return;

    setIsSubmitting(true);
    setStatusMessage(null);

    try {
      const res = await fetch("/api/auth/verify-email/request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });

      const data = await res.json();

      if (res.ok) {
        setStatusMessage({
          type: "success",
          text: "A fresh verification link has been dispatched to your inbox.",
        });
        setCooldown(60); // 60s cooldown timer
      } else {
        setStatusMessage({
          type: "error",
          text: data.detail || "Unable to dispatch verification email.",
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
    <AuthCard
      title="Link Expired"
      subtitle="Your email verification link has expired"
    >
      <div className="flex flex-col gap-4 text-center">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-status-warning/15 text-status-warning border border-status-warning/30">
          <AlertTriangleIcon size={24} className="text-status-warning" />
        </div>


        <p className="text-xs text-text-muted leading-relaxed">
          For your security, verification links expire after 24 hours. Request a new link below to verify your email and unlock marketplace app installation.
        </p>

        {statusMessage && (
          <div
            className={`p-3 rounded-lg text-xs font-medium text-left ${
              statusMessage.type === "success"
                ? "bg-action/10 text-action border border-action/20"
                : "bg-danger/10 text-danger border border-danger/20"
            }`}
          >
            {statusMessage.text}
          </div>
        )}

        <form onSubmit={handleResend} className="flex flex-col gap-3 mt-1">
          <div className="flex flex-col text-left gap-1.5">
            <Label
              htmlFor="verify-email-input"
              required
            >
              Account Email
            </Label>
            <Input
              id="verify-email-input"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="name@company.com"
              required
            />
          </div>

          <Button
            type="submit"
            variant="primary"
            fullWidth
            disabled={isSubmitting || cooldown > 0 || !email}
            isLoading={isSubmitting}
          >
            {isSubmitting
              ? "Sending..."
              : cooldown > 0
              ? `Resend available in ${cooldown}s`
              : "Resend Verification Email"}
          </Button>
        </form>

        <div className="pt-2 border-t border-border-hairline flex items-center justify-between text-xs text-text-muted">
          <Link
            href="/login"
            className="hover:text-text hover:underline transition-colors"
          >
            Sign in
          </Link>
          <Link
            href="/dashboard"
            className="hover:text-action hover:underline transition-colors"
          >
            Go to Dashboard &rarr;
          </Link>
        </div>
      </div>
    </AuthCard>
  );
}
