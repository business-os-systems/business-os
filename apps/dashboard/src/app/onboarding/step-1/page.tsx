"use client";

import React, { useState, useEffect, useCallback, useTransition } from "react";
import { useRouter } from "next/navigation";
import { OnboardingStepper } from "@/components/onboarding/onboarding-stepper";

const INDUSTRY_OPTIONS = [
  { id: "healthcare", name: "Healthcare & Medical" },
  { id: "hospitality", name: "Hospitality & Lodging" },
  { id: "food_beverage", name: "Restaurant & Food Service" },
  { id: "retail", name: "Retail & E-Commerce" },
  { id: "real_estate", name: "Real Estate & Property" },
  { id: "professional_services", name: "Professional Services & Consulting" },
  { id: "technology", name: "Technology & Software" },
  { id: "education", name: "Education & Training" },
  { id: "manufacturing", name: "Manufacturing & Logistics" },
  { id: "construction", name: "Construction & Trades" },
  { id: "entertainment", name: "Media & Entertainment" },
  { id: "finance", name: "Finance & FinTech" },
  { id: "non_profit", name: "Non-Profit & NGO" },
  { id: "wellness", name: "Wellness, Fitness & Beauty" },
];

function slugify(text: string): string {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 100);
}

export default function OnboardingStep1Page() {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const [orgName, setOrgName] = useState("");
  const [slug, setSlug] = useState("");
  const [isSlugManuallyEdited, setIsSlugManuallyEdited] = useState(false);
  const [selectedIndustries, setSelectedIndustries] = useState<string[]>([]);
  const [industrySearch, setIndustrySearch] = useState("");

  const [slugStatus, setSlugStatus] = useState<"idle" | "checking" | "available" | "taken" | "invalid">("idle");
  const [slugMessage, setSlugMessage] = useState("");
  const [formError, setFormError] = useState<string | null>(null);

  // Pre-populate data if returning from step 2
  useEffect(() => {
    let isMounted = true;
    async function loadExisting() {
      try {
        const res = await fetch("/api/v1/onboarding/step-1");
        if (res.ok) {
          const data = await res.json();
          if (isMounted && data.organizationName) {
            setOrgName(data.organizationName);
            if (data.organizationSlug) {
              setSlug(data.organizationSlug);
              setIsSlugManuallyEdited(true);
              setSlugStatus("available");
              setSlugMessage(`${data.organizationSlug}.businessos.app`);
            }
            if (Array.isArray(data.industries) && data.industries.length > 0) {
              setSelectedIndustries(data.industries);
            }
          }
        }
      } catch {
        // Fallback gracefully to blank form
      }
    }
    loadExisting();
    return () => {
      isMounted = false;
    };
  }, []);

  // Debounced slug check
  const checkSlugAvailability = useCallback(async (slugToCheck: string) => {
    if (!slugToCheck || slugToCheck.length < 2) {
      setSlugStatus("idle");
      setSlugMessage("");
      return;
    }

    if (!/^[a-z0-9-]+$/.test(slugToCheck)) {
      setSlugStatus("invalid");
      setSlugMessage("Workspace domain can only contain lowercase letters, numbers, and hyphens.");
      return;
    }

    setSlugStatus("checking");
    setSlugMessage("Checking availability...");

    try {
      const res = await fetch(`/api/v1/onboarding/check-slug?slug=${encodeURIComponent(slugToCheck)}`);
      if (res.ok) {
        const data = await res.json();
        if (data.available) {
          setSlugStatus("available");
          if (data.isCurrentOrg) {
            setSlugMessage(`${slugToCheck}.businessos.app (your current workspace domain)`);
          } else {
            setSlugMessage(`${slugToCheck}.businessos.app is available`);
          }
        } else {
          setSlugStatus("taken");
          setSlugMessage(`Domain "${slugToCheck}" is already taken. Please choose another.`);
        }
      } else {
        const err = await res.json().catch(() => null);
        setSlugStatus("taken");
        setSlugMessage(err?.detail || "Domain is unavailable.");
      }
    } catch {
      setSlugStatus("idle");
      setSlugMessage("Could not check availability. Try again.");
    }
  }, []);

  useEffect(() => {
    if (!slug) {
      setSlugStatus("idle");
      setSlugMessage("");
      return;
    }
    const timer = setTimeout(() => {
      checkSlugAvailability(slug);
    }, 350);
    return () => clearTimeout(timer);
  }, [slug, checkSlugAvailability]);

  const handleNameChange = (val: string) => {
    setOrgName(val);
    setFormError(null);
    if (!isSlugManuallyEdited) {
      const generated = slugify(val);
      setSlug(generated);
    }
  };

  const handleSlugChange = (val: string) => {
    setIsSlugManuallyEdited(true);
    setSlug(slugify(val));
    setFormError(null);
  };

  const toggleIndustry = (industryName: string) => {
    setSelectedIndustries((prev) =>
      prev.includes(industryName)
        ? prev.filter((i) => i !== industryName)
        : [...prev, industryName]
    );
    setFormError(null);
  };

  const filteredIndustries = INDUSTRY_OPTIONS.filter((opt) =>
    opt.name.toLowerCase().includes(industrySearch.toLowerCase())
  );

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    if (!orgName.trim() || orgName.trim().length < 2) {
      setFormError("Organization name must be at least 2 characters.");
      return;
    }

    if (!slug.trim() || slug.trim().length < 2) {
      setFormError("Workspace domain must be at least 2 characters.");
      return;
    }

    if (slugStatus === "taken" || slugStatus === "invalid") {
      setFormError("Please choose a valid and available workspace domain.");
      return;
    }

    if (selectedIndustries.length === 0) {
      setFormError("Please select at least one operating industry.");
      return;
    }

    startTransition(async () => {
      try {
        const res = await fetch("/api/v1/onboarding/step-1", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            organizationName: orgName.trim(),
            organizationSlug: slug.trim(),
            industries: selectedIndustries,
          }),
        });

        if (!res.ok) {
          const err = await res.json().catch(() => null);
          setFormError(err?.detail || "Failed to initialize organization workspace.");
          return;
        }

        const data = await res.json();
        router.push(data.redirectUrl || "/onboarding/step-2");
      } catch {
        setFormError("A network error occurred. Please check your connection and try again.");
      }
    });
  };

  return (
    <div className="w-full max-w-2xl bg-surface border border-border rounded-xl shadow-sm p-6 sm:p-8">
      <OnboardingStepper currentStep={1} />

      <div className="mb-6">
        <h1 className="text-xl sm:text-2xl font-bold font-heading tracking-tight text-text">
          Name your workspace
        </h1>
        <p className="text-sm text-text-secondary mt-1">
          Set up your organization's legal name, choose your unique workspace domain, and select your operating industries.
        </p>
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
        {/* Field 1: Organization Name */}
        <div>
          <label htmlFor="orgName" className="block text-xs font-semibold uppercase tracking-wider text-text-secondary mb-1.5">
            Organization Name <span className="text-danger">*</span>
          </label>
          <input
            id="orgName"
            type="text"
            required
            value={orgName}
            onChange={(e) => handleNameChange(e.target.value)}
            placeholder="e.g. Acme Corporation or Starlight Resorts"
            className="w-full px-3.5 py-2.5 bg-background border border-border rounded-lg text-sm text-text placeholder:text-text-muted focus:outline-none focus:ring-1 focus:ring-brand focus:border-brand transition-colors duration-fast"
          />
        </div>

        {/* Field 2: Workspace Domain */}
        <div>
          <div className="flex items-center justify-between mb-1.5">
            <label htmlFor="slug" className="block text-xs font-semibold uppercase tracking-wider text-text-secondary">
              Workspace Domain <span className="text-danger">*</span>
            </label>
            {slugStatus === "available" && (
              <span className="text-[11px] font-semibold text-action flex items-center gap-1">
                ✓ Available
              </span>
            )}
            {slugStatus === "taken" && (
              <span className="text-[11px] font-semibold text-danger flex items-center gap-1">
                ✗ Domain taken
              </span>
            )}
          </div>
          <div className="flex items-center rounded-lg border border-border bg-background focus-within:border-brand focus-within:ring-1 focus-within:ring-brand overflow-hidden transition-colors duration-fast">
            <span className="px-3 py-2.5 text-xs text-text-muted bg-surface-muted border-r border-border select-none">
              https://
            </span>
            <input
              id="slug"
              type="text"
              required
              value={slug}
              onChange={(e) => handleSlugChange(e.target.value)}
              placeholder="acme-corp"
              className="flex-1 px-3 py-2.5 bg-transparent text-sm text-text placeholder:text-text-muted focus:outline-none"
            />
            <span className="px-3 py-2.5 text-xs font-medium text-text-secondary bg-surface-muted border-l border-border select-none">
              .businessos.app
            </span>
          </div>
          {slugMessage && (
            <p
              className={`mt-1.5 text-xs ${
                slugStatus === "available"
                  ? "text-action"
                  : slugStatus === "taken" || slugStatus === "invalid"
                  ? "text-danger"
                  : "text-text-muted"
              }`}
            >
              {slugMessage}
            </p>
          )}
        </div>

        {/* Field 3: Industry Multi-Select */}
        <div>
          <div className="flex items-center justify-between mb-1.5">
            <label className="block text-xs font-semibold uppercase tracking-wider text-text-secondary">
              Industry Domains <span className="text-danger">*</span>
            </label>
            <span className="text-xs text-text-muted">
              {selectedIndustries.length} selected
            </span>
          </div>
          <p className="text-xs text-text-muted mb-3">
            Select one or more industries that best describe your operations to tailor your workspace applications.
          </p>

          {/* Active selection pills */}
          {selectedIndustries.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mb-3 p-2.5 bg-surface-muted border border-border/80 rounded-lg">
              {selectedIndustries.map((ind) => (
                <button
                  key={ind}
                  type="button"
                  onClick={() => toggleIndustry(ind)}
                  className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-semibold bg-action text-on-action shadow-xs hover:opacity-90 transition-opacity"
                >
                  <span>{ind}</span>
                  <span className="text-on-action/80 hover:text-on-action">×</span>
                </button>
              ))}
            </div>
          )}

          {/* Search box for industries */}
          <div className="mb-2.5">
            <input
              type="text"
              value={industrySearch}
              onChange={(e) => setIndustrySearch(e.target.value)}
              placeholder="Search industries (e.g. Hospitality, Healthcare, Retail)..."
              className="w-full px-3 py-2 text-xs bg-background border border-border rounded-md text-text placeholder:text-text-muted focus:outline-none focus:ring-1 focus:ring-brand focus:border-brand"
            />
          </div>

          {/* Industry Pills Options */}
          <div className="flex flex-wrap gap-2 max-h-48 overflow-y-auto p-1">
            {filteredIndustries.map((item) => {
              const isSelected = selectedIndustries.includes(item.name);
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => toggleIndustry(item.name)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors duration-fast ${
                    isSelected
                      ? "bg-action/15 border-action text-action font-semibold"
                      : "bg-surface border-border text-text-secondary hover:border-text-secondary/40 hover:text-text"
                  }`}
                >
                  {isSelected ? `✓ ${item.name}` : `+ ${item.name}`}
                </button>
              );
            })}
            {filteredIndustries.length === 0 && (
              <span className="text-xs text-text-muted p-2">
                No matching industries found for "{industrySearch}".
              </span>
            )}
          </div>
        </div>

        {/* Submit action */}
        <div className="pt-4 border-t border-border flex justify-end">
          <button
            type="submit"
            disabled={
              isPending ||
              !orgName.trim() ||
              !slug.trim() ||
              slugStatus === "taken" ||
              slugStatus === "invalid" ||
              selectedIndustries.length === 0
            }
            className="w-full sm:w-auto px-6 py-2.5 bg-action text-on-action rounded-lg text-sm font-semibold hover:opacity-95 active:scale-[0.98] disabled:opacity-50 disabled:pointer-events-none transition-all duration-fast flex items-center justify-center gap-2 shadow-xs"
          >
            {isPending ? (
              <>
                <svg className="w-4 h-4 animate-spin" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                </svg>
                <span>Creating workspace...</span>
              </>
            ) : (
              <span className="flex items-center gap-2">
                <span>Continue to App Selection</span>
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
