"use client";

import React, { useState, useEffect, useTransition } from "react";
import { useRouter } from "next/navigation";
import { OnboardingStepper } from "@/components/onboarding/onboarding-stepper";

export interface CatalogApp {
  id: string;
  code: string;
  title: string;
  description: string;
  category: string;
  targetIndustries: string[];
  icon: string;
}

const APP_CATALOG: CatalogApp[] = [
  {
    id: "website-builder",
    code: "CMS",
    title: "Website & Headless CMS",
    description: "Visual drag-and-drop web builder, block library, custom domain publishing, and headless CMS.",
    category: "Core Suite",
    targetIndustries: ["*"],
    icon: "🌐",
  },
  {
    id: "lodging-pms",
    code: "PMS",
    title: "Property & Room Management",
    description: "Room inventory, reservation timeline, front desk check-in/out, rate plans, and night audit.",
    category: "Hospitality",
    targetIndustries: ["Hospitality & Lodging", "Real Estate & Property"],
    icon: "🏨",
  },
  {
    id: "retail-pos",
    code: "POS",
    title: "Point of Sale & Checkout",
    description: "Cashier terminals, barcode scanning, split billing, table ordering, and receipt printing.",
    category: "Commerce",
    targetIndustries: [
      "Restaurant & Food Service",
      "Retail & E-Commerce",
      "Hospitality & Lodging",
      "Wellness, Fitness & Beauty",
    ],
    icon: "💳",
  },
  {
    id: "inventory-manager",
    code: "INV",
    title: "Inventory & Stock Control",
    description: "Multi-warehouse tracking, stock movements, purchase orders, reorder thresholds, and batches.",
    category: "Operations",
    targetIndustries: [
      "Manufacturing & Logistics",
      "Retail & E-Commerce",
      "Restaurant & Food Service",
      "Healthcare & Medical",
    ],
    icon: "📦",
  },
  {
    id: "customer-crm",
    code: "CRM",
    title: "Customer CRM & Pipeline",
    description: "Lead pipeline, client profiles, communication logs, automated follow-ups, and lifecycle stages.",
    category: "Sales & Growth",
    targetIndustries: [
      "Professional Services & Consulting",
      "Technology & Software",
      "Real Estate & Property",
      "Finance & FinTech",
    ],
    icon: "👥",
  },
  {
    id: "financial-ledger",
    code: "FIN",
    title: "Invoicing & Financial Ledger",
    description: "Double-entry general ledger, automated tax invoices, receivables/payables, and reconciliation.",
    category: "Finance",
    targetIndustries: ["*"],
    icon: "📊",
  },
  {
    id: "executive-analytics",
    code: "BI",
    title: "Executive Dashboard & BI",
    description: "Real-time KPI metrics, cross-module revenue reporting, cohort analysis, and trend forecasting.",
    category: "Analytics",
    targetIndustries: ["*"],
    icon: "📈",
  },
  {
    id: "hr-payroll",
    code: "HRM",
    title: "HR & Workforce Management",
    description: "Staff directory, shift rosters, clock-in tracking, leave requests, and payroll calculation.",
    category: "Workforce",
    targetIndustries: [
      "Healthcare & Medical",
      "Manufacturing & Logistics",
      "Education & Training",
      "Hospitality & Lodging",
    ],
    icon: "🧑‍💼",
  },
];

export default function OnboardingStep2Page() {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const [selectedApps, setSelectedApps] = useState<string[]>(["website-builder"]);
  const [userIndustries, setUserIndustries] = useState<string[]>([]);
  const [formError, setFormError] = useState<string | null>(null);

  // Load tenant industries from user session metadata if available
  useEffect(() => {
    async function loadUserSession() {
      try {
        const res = await fetch("/api/v1/user/profile");
        if (res.ok) {
          const data = await res.json();
          const meta = (data.user?.metadata || {}) as Record<string, unknown>;
          if (Array.isArray(meta.industries)) {
            setUserIndustries(meta.industries as string[]);
          }
        }
      } catch {
        // Fallback to empty user industries
      }
    }
    loadUserSession();
  }, []);

  const isAppRecommended = (app: CatalogApp): boolean => {
    if (app.id === "website-builder" || app.id === "financial-ledger") return true;
    if (userIndustries.length === 0) {
      return app.targetIndustries.includes("*");
    }
    return (
      app.targetIndustries.includes("*") ||
      app.targetIndustries.some((ind) => userIndustries.includes(ind))
    );
  };

  const recommendedApps = APP_CATALOG.filter(isAppRecommended);
  const additionalApps = APP_CATALOG.filter((a) => !isAppRecommended(a));

  // Auto-select recommended apps initially
  useEffect(() => {
    const initialSelected = APP_CATALOG.filter(isAppRecommended).map((a) => a.id);
    setSelectedApps((prev) => {
      const merged = Array.from(new Set([...prev, ...initialSelected]));
      return merged.length > 0 ? merged : ["website-builder"];
    });
  }, [userIndustries]);

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
          body: JSON.stringify({
            selectedApps,
          }),
        });

        if (!res.ok) {
          const err = await res.json().catch(() => null);
          setFormError(err?.detail || "Failed to persist application selection.");
          return;
        }

        const data = await res.json();
        router.push(data.redirectUrl || "/onboarding/step-3");
      } catch {
        setFormError("A network error occurred. Please check your connection and try again.");
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
          <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
          <span>{formError}</span>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Section 1: Recommended Apps */}
        {recommendedApps.length > 0 && (
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
              {recommendedApps.map((app) => {
                const isSelected = selectedApps.includes(app.id);
                return (
                  <div
                    key={app.id}
                    onClick={() => toggleApp(app.id)}
                    className={`cursor-pointer p-4 rounded-xl border transition-all duration-fast select-none flex flex-col justify-between ${
                      isSelected
                        ? "bg-action/5 border-action shadow-xs ring-1 ring-action"
                        : "bg-surface border-border hover:border-text-secondary/40"
                    }`}
                  >
                    <div>
                      <div className="flex items-start justify-between gap-3 mb-2">
                        <div className="flex items-center gap-2.5">
                          <span className="text-2xl p-1.5 rounded-lg bg-surface-muted border border-border">
                            {app.icon}
                          </span>
                          <div>
                            <div className="flex items-center gap-2">
                              <h3 className="text-sm font-bold text-text">
                                {app.title}
                              </h3>
                              <span className="px-1.5 py-0.5 rounded text-[10px] font-mono font-bold bg-surface-muted text-text-secondary border border-border">
                                {app.code}
                              </span>
                            </div>
                            <span className="text-[10px] font-semibold text-action uppercase tracking-wide">
                              Recommended
                            </span>
                          </div>
                        </div>
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => {}} // handled by parent div click
                          className="h-4 w-4 mt-1 rounded border-border text-action focus:ring-action"
                        />
                      </div>
                      <p className="text-xs text-text-secondary line-clamp-2">
                        {app.description}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Section 2: Additional Apps */}
        {additionalApps.length > 0 && (
          <div>
            <div className="mb-3">
              <span className="text-xs font-bold uppercase tracking-wider text-text-secondary">
                Additional workspace applications
              </span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {additionalApps.map((app) => {
                const isSelected = selectedApps.includes(app.id);
                return (
                  <div
                    key={app.id}
                    onClick={() => toggleApp(app.id)}
                    className={`cursor-pointer p-4 rounded-xl border transition-all duration-fast select-none flex flex-col justify-between ${
                      isSelected
                        ? "bg-action/5 border-action shadow-xs ring-1 ring-action"
                        : "bg-surface border-border hover:border-text-secondary/40"
                    }`}
                  >
                    <div>
                      <div className="flex items-start justify-between gap-3 mb-2">
                        <div className="flex items-center gap-2.5">
                          <span className="text-2xl p-1.5 rounded-lg bg-surface-muted border border-border">
                            {app.icon}
                          </span>
                          <div>
                            <div className="flex items-center gap-2">
                              <h3 className="text-sm font-bold text-text">
                                {app.title}
                              </h3>
                              <span className="px-1.5 py-0.5 rounded text-[10px] font-mono font-bold bg-surface-muted text-text-secondary border border-border">
                                {app.code}
                              </span>
                            </div>
                            <span className="text-[10px] text-text-muted">
                              {app.category}
                            </span>
                          </div>
                        </div>
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => {}}
                          className="h-4 w-4 mt-1 rounded border-border text-action focus:ring-action"
                        />
                      </div>
                      <p className="text-xs text-text-secondary line-clamp-2">
                        {app.description}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Navigation & Submit Actions */}
        <div className="pt-4 border-t border-border flex flex-col sm:flex-row items-center justify-between gap-3">
          <button
            type="button"
            onClick={() => router.push("/onboarding/step-1")}
            className="w-full sm:w-auto px-4 py-2.5 text-xs font-semibold text-text-secondary hover:text-text rounded-lg border border-border hover:bg-surface-muted transition-colors flex items-center justify-center gap-2 group"
          >
            <svg className="w-4 h-4 shrink-0 transition-transform group-hover:-translate-x-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
            </svg>
            <span>Back to Organization</span>
          </button>

          <button
            type="submit"
            disabled={isPending || selectedApps.length === 0}
            className="w-full sm:w-auto px-6 py-2.5 bg-action text-on-action rounded-lg text-sm font-semibold hover:opacity-95 active:scale-[0.98] disabled:opacity-50 disabled:pointer-events-none transition-all duration-fast flex items-center justify-center gap-2 shadow-xs group"
          >
            {isPending ? (
              <>
                <svg className="w-4 h-4 animate-spin" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                </svg>
                <span>Saving selection...</span>
              </>
            ) : (
              <span className="flex items-center gap-2">
                <span>Continue to Workspace Setup ({selectedApps.length} apps)</span>
                <svg className="w-4 h-4 shrink-0 transition-transform group-hover:translate-x-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M14 5l7 7m0 0l-7 7m7-7H3" />
                </svg>
              </span>
            )}
          </button>
        </div>
      </form>
    </div>
  );
}
