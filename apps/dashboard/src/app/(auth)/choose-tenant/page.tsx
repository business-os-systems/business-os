"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AuthCard } from "@/components/auth/auth-card";

interface TenantCardItem {
  organizationId: string;
  name: string;
  slug: string;
  role: string;
  logoUrl: string | null;
}

export default function ChooseTenantPage() {
  const router = useRouter();
  const [tenants, setTenants] = useState<TenantCardItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [switchingId, setSwitchingId] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const fetchTenants = async () => {
    setIsLoading(true);
    setErrorMessage(null);
    try {
      const res = await fetch("/api/v1/auth/tenants");
      if (!res.ok) {
        throw new Error("Failed to load your workspaces. Please try again.");
      }
      const data = await res.json();
      const list = data.tenants || [];
      setTenants(list);

      // Auto-selection: If user belongs to exactly one organization, switch directly
      if (list.length === 1 && list[0]) {
        await handleSelectTenant(list[0].organizationId);
      }
    } catch (err) {
      setErrorMessage(
        err instanceof Error ? err.message : "An unexpected error occurred."
      );
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchTenants();
  }, []);

  const handleSelectTenant = async (organizationId: string) => {
    setSwitchingId(organizationId);
    setErrorMessage(null);

    try {
      const res = await fetch("/api/v1/auth/switch-tenant", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ organizationId }),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.detail || data.error || "Failed to switch workspace.");
      }

      const destination = data.redirectUrl || "/dashboard";
      router.push(destination);
      router.refresh();
    } catch (err) {
      setErrorMessage(
        err instanceof Error ? err.message : "Failed to select workspace."
      );
      setSwitchingId(null);
    }
  };

  return (
    <AuthCard
      title="Select Workspace"
      subtitle="Choose the organization you want to operate in"
      footer={
        <div className="flex flex-col items-center gap-1.5 text-xs text-text-muted">
          <span>Logged into the wrong account?</span>
          <Link
            href="/login"
            className="text-action hover:text-action-hover font-semibold underline-offset-2 hover:underline"
          >
            Sign in with another email
          </Link>
        </div>
      }
    >
      {/* Error Alert */}
      {errorMessage && (
        <div
          role="alert"
          className="p-3 text-xs rounded-lg border border-danger/30 bg-danger/10 text-danger flex items-start gap-2"
        >
          <svg
            className="w-4 h-4 shrink-0 mt-0.5"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            aria-hidden="true"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
            />
          </svg>
          <div className="flex-1">
            <span>{errorMessage}</span>
            <button
              type="button"
              onClick={fetchTenants}
              className="ml-2 font-semibold underline hover:no-underline"
            >
              Retry
            </button>
          </div>
        </div>
      )}

      {/* Loading Skeleton */}
      {isLoading ? (
        <div className="flex flex-col gap-2.5 py-4">
          {[1, 2].map((i) => (
            <div
              key={i}
              className="h-16 rounded-xl bg-surface-muted border border-border animate-pulse"
            />
          ))}
        </div>
      ) : tenants.length === 0 ? (
        <div className="py-8 text-center text-xs text-text-muted flex flex-col items-center gap-3">
          <p>No active workspaces found for this account.</p>
          <Link
            href="/onboarding/step-1"
            className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-action text-on-action hover:bg-action-hover transition-colors"
          >
            Create New Workspace
          </Link>
        </div>
      ) : (
        <div className="flex flex-col gap-2.5 max-h-[320px] overflow-y-auto pr-0.5">
          {tenants.map((t) => {
            const isPendingThis = switchingId === t.organizationId;
            const initials = t.name.slice(0, 2).toUpperCase();

            return (
              <button
                key={t.organizationId}
                type="button"
                onClick={() => handleSelectTenant(t.organizationId)}
                disabled={switchingId !== null}
                className="w-full text-left p-3.5 rounded-xl border border-border bg-surface hover:border-action/60 hover:bg-surface-hover active:scale-[0.99] transition-all flex items-center justify-between group disabled:opacity-50 disabled:cursor-not-allowed shadow-2xs"
              >
                <div className="flex items-center gap-3 min-w-0">
                  {/* Organization Avatar */}
                  {t.logoUrl ? (
                    <img
                      src={t.logoUrl}
                      alt={t.name}
                      className="w-9 h-9 rounded-lg object-cover border border-border shrink-0"
                    />
                  ) : (
                    <div className="w-9 h-9 rounded-lg bg-action/10 text-action font-bold text-xs flex items-center justify-center shrink-0 border border-action/20">
                      {initials}
                    </div>
                  )}

                  {/* Organization Metadata */}
                  <div className="flex flex-col min-w-0">
                    <span className="font-semibold text-sm text-text truncate group-hover:text-action transition-colors">
                      {t.name}
                    </span>
                    <div className="flex items-center gap-2 mt-0.5 text-xs text-text-muted">
                      <span className="truncate">@{t.slug}</span>
                      <span className="text-[10px] font-medium px-1.5 py-0.2 rounded-md bg-surface-muted border border-border text-text-secondary">
                        {t.role}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Right Action / Spinner */}
                <div className="shrink-0 pl-2">
                  {isPendingThis ? (
                    <svg
                      className="animate-spin h-4 w-4 text-action"
                      fill="none"
                      viewBox="0 0 24 24"
                    >
                      <circle
                        className="opacity-25"
                        cx="12"
                        cy="12"
                        r="10"
                        stroke="currentColor"
                        strokeWidth="4"
                      />
                      <path
                        className="opacity-75"
                        fill="currentColor"
                        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                      />
                    </svg>
                  ) : (
                    <svg
                      className="w-4 h-4 text-text-muted group-hover:text-action group-hover:translate-x-0.5 transition-all"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                      aria-hidden="true"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M9 5l7 7-7 7"
                      />
                    </svg>
                  )}
                </div>
              </button>
            );
          })}
        </div>
      )}
    </AuthCard>
  );
}
