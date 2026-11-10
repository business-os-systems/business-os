"use client";

import React, { useState, useEffect, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@suite/ui";
import { AlertTriangleIcon, ArrowLeftIcon, ArrowRightIcon } from "@suite/ui/icons";
import { AppSelectionCard } from "@/components/onboarding/app-selection-card";
import { OnboardingStepper } from "@/components/onboarding/onboarding-stepper";
import { groupOnboardingApps, listOnboardingApps } from "@/lib/onboarding-apps";

const NEXT_ONBOARDING_STEP = "/onboarding/step-3";
const ONBOARDING_APP_COUNT = listOnboardingApps().length;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readIndustries(payload: unknown): string[] {
  if (!isRecord(payload) || !isRecord(payload.data)) {
    return [];
  }
  const industries = payload.data.industries;
  if (!Array.isArray(industries)) {
    return [];
  }
  return industries.filter(
    (industry): industry is string => typeof industry === "string"
  );
}

function readProblemDetail(payload: unknown): string | null {
  if (!isRecord(payload) || typeof payload.detail !== "string") {
    return null;
  }
  return payload.detail;
}

function readRedirectUrl(payload: unknown): string {
  if (!isRecord(payload) || typeof payload.redirectUrl !== "string") {
    return NEXT_ONBOARDING_STEP;
  }
  return payload.redirectUrl;
}

export default function OnboardingStep2Page() {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const [selectedApps, setSelectedApps] = useState<string[]>([]);
  const [userIndustries, setUserIndustries] = useState<string[]>([]);
  const [formError, setFormError] = useState<string | null>(null);

  // Recommendations read the industries captured in onboarding step 1; the
  // picker itself carries no app or industry data of its own.
  useEffect(() => {
    let isMounted = true;

    async function loadTenantIndustries() {
      try {
        const response = await fetch("/api/v1/onboarding/step-1");
        if (!response.ok) {
          console.error(
            `Failed to load onboarding industries: ${response.status} ${response.statusText}`
          );
          return;
        }
        const payload: unknown = await response.json();
        if (isMounted) {
          setUserIndustries(readIndustries(payload));
        }
      } catch (error) {
        console.error("Failed to load onboarding industries.", error);
      }
    }

    void loadTenantIndustries();
    return () => {
      isMounted = false;
    };
  }, []);

  const { recommended, additional } = groupOnboardingApps(userIndustries);

  const toggleApp = (appId: string) => {
    setSelectedApps((prev) =>
      prev.includes(appId)
        ? prev.filter((id) => id !== appId)
        : [...prev, appId]
    );
    setFormError(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    if (selectedApps.length === 0) {
      setFormError("Please select at least one application to install.");
      return;
    }

    startTransition(async () => {
      try {
        const res = await fetch("/api/v1/onboarding/step-2", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ selectedApps }),
        });

        const payload: unknown = await res.json().catch(() => null);
        if (!res.ok) {
          setFormError(
            readProblemDetail(payload) ??
              "Failed to persist application selection."
          );
          return;
        }

        router.push(readRedirectUrl(payload));
      } catch (error) {
        console.error("Failed to persist the onboarding app selection.", error);
        setFormError(
          "A network error occurred. Please check your connection and try again."
        );
      }
    });
  };

  return (
    <div className="w-full max-w-3xl bg-surface border border-border rounded-xl shadow-sm p-6 sm:p-8">
      <OnboardingStepper currentStep={2} />

      <div className="mb-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
          <div>
            <h1 className="text-xl sm:text-2xl font-bold font-heading tracking-tight text-text">
              Choose applications for your workspace
            </h1>
            <p className="text-sm text-text-secondary mt-1">
              Select the modular software suites you want enabled in your workspace. You can always add or remove apps later.
            </p>
          </div>
          <div className="shrink-0 self-start sm:self-center">
            <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold bg-action/10 text-action border border-action/30">
              {selectedApps.length} applications selected
            </span>
          </div>
        </div>
      </div>

      {formError && (
        <div className="mb-6 p-3.5 bg-danger/10 border border-danger/30 text-danger rounded-lg text-xs font-medium flex items-center gap-2">
          <AlertTriangleIcon size={16} className="shrink-0" />
          <span>{formError}</span>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-6">
        {ONBOARDING_APP_COUNT === 0 && (
          <p className="text-sm text-text-secondary">
            No applications are registered for this workspace yet.
          </p>
        )}

        {recommended.length > 0 && (
          <div>
            <div className="flex items-center gap-2 mb-3">
              <span className="text-xs font-bold uppercase tracking-wider text-action flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full bg-action animate-pulse" />
                Recommended for your industry
              </span>
              <span className="text-[11px] text-text-muted">
                (Tailored based on your profile)
              </span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {recommended.map((app) => (
                <AppSelectionCard
                  key={app.appId}
                  app={app}
                  isSelected={selectedApps.includes(app.appId)}
                  isRecommended
                  onToggle={toggleApp}
                />
              ))}
            </div>
          </div>
        )}

        {additional.length > 0 && (
          <div>
            <div className="mb-3">
              <span className="text-xs font-bold uppercase tracking-wider text-text-secondary">
                Additional workspace applications
              </span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {additional.map((app) => (
                <AppSelectionCard
                  key={app.appId}
                  app={app}
                  isSelected={selectedApps.includes(app.appId)}
                  isRecommended={false}
                  onToggle={toggleApp}
                />
              ))}
            </div>
          </div>
        )}

        <div className="pt-4 border-t border-border flex flex-col sm:flex-row items-center justify-between gap-3">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => router.push("/onboarding/step-1")}
            className="w-full sm:w-auto"
            startIcon={
              <ArrowLeftIcon size={16} className="shrink-0 transition-transform group-hover:-translate-x-0.5" />
            }
          >
            Back to Organization
          </Button>

          <Button
            type="submit"
            variant="primary"
            disabled={isPending || selectedApps.length === 0}
            isLoading={isPending}
            className="w-full sm:w-auto px-6 py-2.5"
            endIcon={
              !isPending && (
                <ArrowRightIcon size={16} className="shrink-0 transition-transform group-hover:translate-x-0.5" />
              )
            }
          >
            {isPending ? "Saving selection..." : `Continue to Workspace Setup (${selectedApps.length} apps)`}
          </Button>
        </div>
      </form>
    </div>
  );
}
