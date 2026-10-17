"use client";

import React, { useState, useEffect, useCallback, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button, Input, Label } from "@suite/ui";
import { AlertTriangleIcon, ArrowRightIcon } from "@suite/ui/icons";
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
          <AlertTriangleIcon size={16} className="shrink-0" />
          <span>{formError}</span>
        </div>
      )}


      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Field 1: Organization Name */}
        <div className="space-y-1.5">
          <Label htmlFor="orgName" required>
            Organization Name
          </Label>
          <Input
            id="orgName"
            type="text"
            required
            value={orgName}
            onChange={(e) => handleNameChange(e.target.value)}
            placeholder="e.g. Acme Corporation or Starlight Resorts"
          />
        </div>

        {/* Field 2: Workspace Domain */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <Label htmlFor="slug" required>
              Workspace Domain
            </Label>
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
          <div className="flex items-center rounded-lg border border-border bg-surface focus-within:border-action focus-within:ring-1 focus-within:ring-action overflow-hidden transition-colors duration-fast">
            <span className="px-3 py-2.5 text-xs text-text-muted bg-surface-muted border-r border-border select-none">
              https://
            </span>
            <Input
              id="slug"
              type="text"
              required
              value={slug}
              onChange={(e) => handleSlugChange(e.target.value)}
              placeholder="acme-corp"
              className="flex-1 border-0 bg-transparent rounded-none focus:ring-0 focus:outline-none shadow-none"
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
            <Label required>
              Industry Domains
            </Label>
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
                <Button
                  key={ind}
                  type="button"
                  variant="primary"
                  size="sm"
                  onClick={() => toggleIndustry(ind)}
                  className="h-auto py-1 px-2.5 text-xs rounded-md"
                >
                  <span>{ind}</span>
                  <span className="text-on-action/80 hover:text-on-action ml-1">×</span>
                </Button>
              ))}
            </div>
          )}

          {/* Search box for industries */}
          <div className="mb-2.5">
            <Input
              inputSize="sm"
              value={industrySearch}
              onChange={(e) => setIndustrySearch(e.target.value)}
              placeholder="Search industries (e.g. Hospitality, Healthcare, Retail)..."
            />
          </div>

          {/* Industry Pills Options */}
          <div className="flex flex-wrap gap-2 max-h-48 overflow-y-auto p-1">
            {filteredIndustries.map((item) => {
              const isSelected = selectedIndustries.includes(item.name);
              return (
                <Button
                  key={item.id}
                  type="button"
                  variant={isSelected ? "primary" : "outline"}
                  size="sm"
                  onClick={() => toggleIndustry(item.name)}
                  className={
                    isSelected
                      ? "h-auto py-1.5 px-3 rounded-lg text-xs"
                      : "h-auto py-1.5 px-3 rounded-lg text-xs font-medium text-text-secondary hover:text-text"
                  }
                >
                  {isSelected ? `✓ ${item.name}` : `+ ${item.name}`}
                </Button>
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
          <Button
            type="submit"
            variant="primary"
            disabled={
              isPending ||
              !orgName.trim() ||
              !slug.trim() ||
              slugStatus === "taken" ||
              slugStatus === "invalid" ||
              selectedIndustries.length === 0
            }
            isLoading={isPending}
            className="w-full sm:w-auto px-6 py-2.5"
            endIcon={
              !isPending && (
                <ArrowRightIcon size={16} className="shrink-0 transition-transform group-hover:translate-x-0.5" />
              )
            }

          >
            {isPending ? "Creating workspace..." : "Continue to App Selection"}
          </Button>
        </div>
      </form>
    </div>
  );
}
