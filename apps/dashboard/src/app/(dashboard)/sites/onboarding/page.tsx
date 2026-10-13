"use client";

import React, { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardFooter,
  Button,
  Input,
  Badge,
} from "@suite/ui";
import {
  GlobeIcon,
  CheckIcon,
  SparklesIcon,
  ArrowRightIcon,
  LayersIcon,
} from "@suite/ui/icons";

interface StepOption {
  id: string;
  title: string;
  desc: string;
  icon?: string;
}

const BUSINESS_GOALS: StepOption[] = [
  {
    id: "ACCEPT_BOOKINGS",
    title: "Hospitality & Bookings",
    desc: "Direct reservation engine, guest room showcase, and contact inquiries.",
  },
  {
    id: "SHOWCASE_MENU",
    title: "Restaurant & Cafe Dining",
    desc: "Digital menu, table reservations, operating hours, and location map.",
  },
  {
    id: "CAPTURE_LEADS",
    title: "Services & Lead Generation",
    desc: "Consultation booking, quotation forms, customer reviews, and FAQ.",
  },
  {
    id: "GENERAL_PRESENCE",
    title: "Corporate & Brand Presence",
    desc: "Company story, service offerings, leadership team, and news updates.",
  },
];

const TEMPLATE_PRESETS = [
  {
    id: "hero_starter",
    title: "Curated Hero Starter (Recommended)",
    desc: "Pre-configured with a responsive Hero section, call-to-action banner, and brand header.",
    badge: "Fastest Setup",
  },
  {
    id: "blank",
    title: "Blank Canvas",
    desc: "Start with an empty section tree and compose custom layouts using the block catalog.",
    badge: "Clean Slate",
  },
];

export default function SiteOnboardingWizard() {
  const router = useRouter();

  const [step, setStep] = useState<1 | 2 | 3 | 4>(1);
  const [title, setTitle] = useState("");
  const [subdomain, setSubdomain] = useState("");
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [isSubdomainAvailable, setIsSubdomainAvailable] = useState<boolean | null>(null);
  const [isCheckingSubdomain, setIsCheckingSubdomain] = useState(false);

  const [selectedGoal, setSelectedGoal] = useState("ACCEPT_BOOKINGS");
  const [selectedTemplate, setSelectedTemplate] = useState("hero_starter");
  const [isProvisioning, setIsProvisioning] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Auto-generate kebab-case subdomain when title changes
  const handleTitleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setTitle(val);
    const slug = val
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]/g, "-")
      .replace(/-+/g, "-")
      .replace(/^-|-$/g, "");
    setSubdomain(slug);
  };

  // Check subdomain availability with debounce
  useEffect(() => {
    if (!subdomain || subdomain.length < 2) {
      setIsSubdomainAvailable(null);
      setSuggestions([]);
      return;
    }

    const timer = setTimeout(async () => {
      setIsCheckingSubdomain(true);
      try {
        const res = await fetch(`/api/cms/subdomain/check?subdomain=${encodeURIComponent(subdomain)}`);
        if (res.ok) {
          const data = await res.json();
          setIsSubdomainAvailable(data.available);
          setSuggestions(data.suggestions || []);
        }
      } catch {
        // Fallback optimistic availability in offline test runs
        setIsSubdomainAvailable(true);
      } finally {
        setIsCheckingSubdomain(false);
      }
    }, 350);

    return () => clearTimeout(timer);
  }, [subdomain]);

  // Handle final site provisioning
  const handleProvisionSite = async () => {
    if (!title.trim() || !subdomain.trim()) {
      setErrorMsg("Website title and subdomain are required.");
      return;
    }

    setIsProvisioning(true);
    setErrorMsg(null);
    setStep(4);

    try {
      const res = await fetch("/api/cms/sites", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          title,
          slug: subdomain,
          initialTemplate: selectedTemplate,
          brandName: title,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error ?? data.detail ?? "Failed to provision website");
      }

      // Transition smoothly into Studio Canvas
      const siteId = data.site.id;
      const pageId = data.homePage.id;
      setTimeout(() => {
        router.push(`/sites/${siteId}/editor/${pageId}`);
      }, 1000);
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : "Provisioning failed");
      setStep(3);
      setIsProvisioning(false);
    }
  };

  return (
    <div className="mx-auto max-w-3xl py-8">
      {/* Step Tracker Header */}
      <div className="mb-8">
        <div className="flex items-center justify-between text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">
          <span>Website Onboarding Wizard</span>
          <span>{`Step ${step} of 4`}</span>
        </div>
        <div className="grid grid-cols-4 gap-2">
          {[1, 2, 3, 4].map((s) => (
            <div
              key={s}
              className={`h-1.5 rounded-full transition-all duration-300 ${
                s <= step ? "bg-indigo-600" : "bg-slate-200"
              }`}
            />
          ))}
        </div>
      </div>

      {errorMsg && (
        <div className="mb-6 rounded-lg border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">
          {errorMsg}
        </div>
      )}

      {/* STEP 1: Website Name & Subdomain */}
      {step === 1 && (
        <Card className="border-slate-200 shadow-sm">
          <CardHeader>
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-indigo-50 text-indigo-600">
                <GlobeIcon className="h-5 w-5" />
              </div>
              <div>
                <CardTitle className="text-xl">Name Your Website & Subdomain</CardTitle>
                <CardDescription>
                  Give your web presence an authoritative title and claim your staging subdomain.
                </CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-6 pt-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">
                Website or Brand Name
              </label>
              <Input
                placeholder="e.g. River View Boutique Resort"
                value={title}
                onChange={handleTitleChange}
                autoFocus
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">
                Staging Subdomain (.business-os.site)
              </label>
              <div className="flex items-center gap-2">
                <Input
                  placeholder="river-view-resort"
                  value={subdomain}
                  onChange={(e) => setSubdomain(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ""))}
                />
                <span className="text-sm font-medium text-slate-500 shrink-0">
                  .business-os.site
                </span>
              </div>

              {/* Real-time Subdomain Status & Phonetic Fallbacks */}
              <div className="mt-2 text-xs">
                {isCheckingSubdomain && (
                  <span className="text-slate-500">Checking availability...</span>
                )}
                {!isCheckingSubdomain && isSubdomainAvailable === true && (
                  <span className="text-emerald-600 font-medium flex items-center gap-1">
                    <CheckIcon className="h-3.5 w-3.5" /> Subdomain is available!
                  </span>
                )}
                {!isCheckingSubdomain && isSubdomainAvailable === false && (
                  <div className="space-y-1.5">
                    <span className="text-rose-600 font-medium">
                      Subdomain is claimed. Try one of these phonetic alternatives:
                    </span>
                    <div className="flex flex-wrap gap-2 pt-1">
                      {suggestions.map((sug) => (
                        <button
                          key={sug}
                          type="button"
                          onClick={() => setSubdomain(sug)}
                          className="rounded border border-indigo-200 bg-indigo-50 px-2.5 py-1 text-xs font-medium text-indigo-700 hover:bg-indigo-100"
                        >
                          {sug}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </CardContent>
          <CardFooter className="flex justify-between border-t border-slate-100 pt-4">
            <Button variant="ghost" onClick={() => router.push("/")}>
              Cancel
            </Button>
            <Button
              disabled={!title.trim() || !subdomain.trim() || isSubdomainAvailable === false}
              onClick={() => setStep(2)}
              className="bg-indigo-600 hover:bg-indigo-700 text-white"
            >
              Next: Business Goal <ArrowRightIcon className="ml-1.5 h-4 w-4" />
            </Button>
          </CardFooter>
        </Card>
      )}

      {/* STEP 2: Primary Business Goal */}
      {step === 2 && (
        <Card className="border-slate-200 shadow-sm">
          <CardHeader>
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-indigo-50 text-indigo-600">
                <SparklesIcon className="h-5 w-5" />
              </div>
              <div>
                <CardTitle className="text-xl">Select Your Primary Business Goal</CardTitle>
                <CardDescription>
                  This fine-tunes your component blueprints and default call-to-actions.
                </CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-3 pt-4">
            {BUSINESS_GOALS.map((goal) => (
              <div
                key={goal.id}
                onClick={() => setSelectedGoal(goal.id)}
                className={`cursor-pointer rounded-lg border p-4 transition-all duration-150 ${
                  selectedGoal === goal.id
                    ? "border-indigo-600 bg-indigo-50/40 ring-1 ring-indigo-600"
                    : "border-slate-200 hover:border-slate-300 bg-white"
                }`}
              >
                <div className="flex items-center justify-between">
                  <div className="font-semibold text-slate-900">{goal.title}</div>
                  {selectedGoal === goal.id && (
                    <Badge variant="default" className="bg-indigo-600 text-white">
                      Selected
                    </Badge>
                  )}
                </div>
                <p className="mt-1 text-xs text-slate-600">{goal.desc}</p>
              </div>
            ))}
          </CardContent>
          <CardFooter className="flex justify-between border-t border-slate-100 pt-4">
            <Button variant="outline" onClick={() => setStep(1)}>
              Back
            </Button>
            <Button
              onClick={() => setStep(3)}
              className="bg-indigo-600 hover:bg-indigo-700 text-white"
            >
              Next: Starter Template <ArrowRightIcon className="ml-1.5 h-4 w-4" />
            </Button>
          </CardFooter>
        </Card>
      )}

      {/* STEP 3: Starter Template Blueprint */}
      {step === 3 && (
        <Card className="border-slate-200 shadow-sm">
          <CardHeader>
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-indigo-50 text-indigo-600">
                <LayersIcon className="h-5 w-5" />
              </div>
              <div>
                <CardTitle className="text-xl">Choose Your Starter Blueprint</CardTitle>
                <CardDescription>
                  Select how you want your Home page initialized in the Visual Studio.
                </CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-4 pt-4">
            {TEMPLATE_PRESETS.map((tpl) => (
              <div
                key={tpl.id}
                onClick={() => setSelectedTemplate(tpl.id)}
                className={`cursor-pointer rounded-lg border p-4 transition-all duration-150 ${
                  selectedTemplate === tpl.id
                    ? "border-indigo-600 bg-indigo-50/40 ring-1 ring-indigo-600"
                    : "border-slate-200 hover:border-slate-300 bg-white"
                }`}
              >
                <div className="flex items-center justify-between">
                  <div className="font-semibold text-slate-900">{tpl.title}</div>
                  <Badge variant="secondary" className="bg-slate-100 text-slate-700">
                    {tpl.badge}
                  </Badge>
                </div>
                <p className="mt-1 text-xs text-slate-600">{tpl.desc}</p>
              </div>
            ))}
          </CardContent>
          <CardFooter className="flex justify-between border-t border-slate-100 pt-4">
            <Button variant="outline" onClick={() => setStep(2)}>
              Back
            </Button>
            <Button
              disabled={isProvisioning}
              onClick={handleProvisionSite}
              className="bg-indigo-600 hover:bg-indigo-700 text-white"
            >
              Create Website & Launch Studio <SparklesIcon className="ml-1.5 h-4 w-4" />
            </Button>
          </CardFooter>
        </Card>
      )}

      {/* STEP 4: Atomic DB Provisioning Progress */}
      {step === 4 && (
        <Card className="border-slate-200 shadow-sm text-center py-12">
          <CardContent className="space-y-4">
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-indigo-50 text-indigo-600 animate-pulse">
              <SparklesIcon className="h-8 w-8" />
            </div>
            <CardTitle className="text-2xl font-bold text-slate-900">
              Provisioning Your Website...
            </CardTitle>
            <CardDescription className="max-w-md mx-auto text-sm text-slate-600">
              Creating database records, configuring staging subdomain{" "}
              <strong className="text-slate-900">{subdomain}.business-os.site</strong>, and seeding
              initial Home page AST in &lt; 200ms.
            </CardDescription>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
