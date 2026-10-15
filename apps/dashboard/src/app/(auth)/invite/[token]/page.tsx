"use client";

import React, { useState, useTransition } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { AuthCard } from "@/components/auth/auth-card";

export default function AcceptInvitationPage() {
  const params = useParams();
  const router = useRouter();
  const token = typeof params.token === "string" ? params.token : "";

  const [isPending, startTransition] = useTransition();
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const handleAccept = () => {
    setErrorMessage(null);

    if (!token) {
      setErrorMessage("Missing invitation token.");
      return;
    }

    startTransition(async () => {
      try {
        const res = await fetch("/api/v1/auth/invitation/accept", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ token }),
        });

        if (!res.ok) {
          if (res.status === 401) {
            router.push(`/login?redirect=/invite/${token}`);
            return;
          }
          const err = await res.json().catch(() => null);
          setErrorMessage(err?.detail || "Failed to accept workspace invitation.");
          return;
        }

        const data = await res.json();
        router.push(data.redirectUrl || "/dashboard");
      } catch {
        setErrorMessage("A network error occurred. Please try again.");
      }
    });
  };

  return (
    <AuthCard
      title="Workspace Invitation"
      subtitle="You have been invited to join an organization workspace on Business OS."
      footer={
        <p className="text-center text-xs text-text-secondary">
          Need help or signed into the wrong account?{" "}
          <Link href="/login" className="font-semibold text-action hover:underline">
            Sign out
          </Link>
        </p>
      }
    >
      <div className="space-y-4">
        {errorMessage && (
          <div className="p-3 bg-danger/10 border border-danger/30 text-danger rounded-lg text-xs font-medium">
            {errorMessage}
          </div>
        )}

        <div className="p-4 bg-surface-muted border border-border rounded-xl text-center space-y-2">
          <div className="w-10 h-10 rounded-full bg-brand/10 text-brand flex items-center justify-center mx-auto text-lg font-bold">
            ✉
          </div>
          <p className="text-xs text-text-secondary">
            Click below to accept this invitation and immediately access your workspace dashboard.
          </p>
        </div>

        <button
          type="button"
          onClick={handleAccept}
          disabled={isPending || !token}
          className="w-full py-2.5 px-4 bg-action text-on-action rounded-lg text-sm font-semibold hover:opacity-95 active:scale-[0.98] disabled:opacity-50 disabled:pointer-events-none transition-all duration-fast flex items-center justify-center gap-2 shadow-xs"
        >
          {isPending ? (
            <>
              <svg className="w-4 h-4 animate-spin" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
              </svg>
              <span>Joining workspace...</span>
            </>
          ) : (
            <span>Accept Invitation & Join Workspace →</span>
          )}
        </button>
      </div>
    </AuthCard>
  );
}
