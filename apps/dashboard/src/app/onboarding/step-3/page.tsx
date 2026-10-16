"use client";

import React, { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { OnboardingStepper } from "@/components/onboarding/onboarding-stepper";

interface SetupStep {
  id: string;
  label: string;
  detail: string;
}

const SETUP_STEPS: SetupStep[] = [
  {
    id: "tenant",
    label: "Tenant Boundary & Isolation",
    detail: "Configuring encrypted tenant boundary and branch root...",
  },
  {
    id: "security",
    label: "Role & Permission Matrix",
    detail: "Establishing organization owner permissions and access policies...",
  },
  {
    id: "modules",
    label: "Application Modules",
    detail: "Provisioning modular application entitlements and database tables...",
  },
  {
    id: "network",
    label: "Workspace Launchpad",
    detail: "Configuring workspace domain routes and dashboard endpoints...",
  },
];

// Expansive full-page celebratory confetti & paper glitter explosion
function ConfettiBurst() {
  const particles = React.useMemo(() => {
    const items: React.ReactNode[] = [];
    const colors = [
      "bg-brand",
      "bg-brand-tint",
      "bg-action",
      "bg-action-tint",
      "bg-success",
      "bg-warning",
      "bg-warning-fill",
      "bg-danger",
      "bg-info",
      "bg-primary",
      "bg-secondary",
    ];

    const shapes = ["rect", "ribbon", "circle", "diamond"] as const;
    const totalCount = 136;

    for (let i = 0; i < totalCount; i++) {
      // Angles distributed 360° with slight jitter
      const baseAngle = (i / totalCount) * 360;
      const jitter = (Math.random() - 0.5) * 16;
      const angle = baseAngle + jitter;
      const angleRad = (angle * Math.PI) / 180;

      // Varied burst distances spanning near, mid, and far viewport edges (up to 950px)
      const distance = 140 + Math.random() * (i % 3 === 0 ? 820 : 540);
      const tx = Math.round(Math.cos(angleRad) * distance);
      const ty = Math.round(Math.sin(angleRad) * distance);

      // Downward gravity pull
      const drop = Math.round(140 + Math.random() * 320);

      // Staggered launch waves
      const wave = i % 4;
      const delay = wave === 0 ? Math.random() * 0.08 : wave === 1 ? 0.08 + Math.random() * 0.12 : wave === 2 ? 0.18 + Math.random() * 0.16 : 0.28 + Math.random() * 0.2;
      const duration = 1.8 + Math.random() * 1.4;

      const shape = shapes[i % shapes.length];
      const color = colors[i % colors.length];

      let sizeClasses = "w-2.5 h-3.5 rounded-xs";
      if (shape === "ribbon") {
        sizeClasses = "w-1.5 h-6 rounded-xs";
      } else if (shape === "circle") {
        sizeClasses = "w-2.5 h-2.5 rounded-full";
      } else if (shape === "diamond") {
        sizeClasses = "w-3 h-3 rotate-45 rounded-2xs";
      }

      const rotMid = Math.round(180 + Math.random() * 360);
      const rotMid2 = Math.round(rotMid + 360 + Math.random() * 360);
      const rotEnd = Math.round(rotMid2 + 360 + Math.random() * 720);

      items.push(
        <span
          key={i}
          className={`absolute pointer-events-none opacity-0 shadow-xs ${color} ${sizeClasses}`}
          style={{
            top: "40%",
            left: "50%",
            animation: `celebration-burst ${duration}s cubic-bezier(0.12, 0.85, 0.32, 1) ${delay}s forwards`,
            ["--tx" as string]: `${tx}px`,
            ["--ty" as string]: `${ty}px`,
            ["--drop" as string]: `${drop}px`,
            ["--rot-mid" as string]: `${rotMid}deg`,
            ["--rot-mid2" as string]: `${rotMid2}deg`,
            ["--rot-end" as string]: `${rotEnd}deg`,
          }}
        />
      );
    }
    return items;
  }, []);

  return (
    <>
      <style jsx global>{`
        @keyframes celebration-burst {
          0% {
            opacity: 0;
            transform: translate(-50%, -50%) scale(0) rotate(0deg);
          }
          10% {
            opacity: 1;
            transform: translate(-50%, -50%) scale(1.3) rotate(var(--rot-mid));
          }
          55% {
            opacity: 1;
            transform: translate(calc(-50% + var(--tx)), calc(-50% + var(--ty))) rotate(var(--rot-mid2));
          }
          85% {
            opacity: 0.9;
          }
          100% {
            opacity: 0;
            transform: translate(
                calc(-50% + var(--tx) * 1.1),
                calc(-50% + var(--ty) + var(--drop))
              )
              rotate(var(--rot-end)) scale(0.65);
          }
        }
      `}</style>
      <div className="fixed inset-0 pointer-events-none z-50 overflow-hidden" aria-hidden="true">
        {particles}
      </div>
    </>
  );
}

export default function OnboardingStep3Page() {
  const router = useRouter();

  const [phase, setPhase] = useState<"provisioning" | "ready">("provisioning");
  const [progress, setProgress] = useState(10);
  const [currentStepIdx, setCurrentStepIdx] = useState(0);
  const [countdown, setCountdown] = useState(5);
  const [installedApps, setInstalledApps] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);

  const completionTriggeredRef = useRef(false);

  // Phase A: Orchestrate visual progression and trigger backend provisioning
  useEffect(() => {
    if (phase !== "provisioning") return;

    // Simulate progress increments while backend provisions
    const progressInterval = setInterval(() => {
      setProgress((prev) => {
        if (prev >= 92) {
          clearInterval(progressInterval);
          return prev;
        }
        const next = prev + Math.floor(Math.random() * 14) + 6;
        if (next > 30 && next <= 60) setCurrentStepIdx(1);
        else if (next > 60 && next <= 85) setCurrentStepIdx(2);
        else if (next > 85) setCurrentStepIdx(3);
        return Math.min(next, 92);
      });
    }, 350);

    // Trigger complete API
    async function completeSetup() {
      if (completionTriggeredRef.current) return;
      completionTriggeredRef.current = true;

      try {
        const res = await fetch("/api/v1/onboarding/complete", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({}),
        });

        if (!res.ok) {
          const err = await res.json().catch(() => null);
          setError(err?.detail || "Failed to finalize workspace setup.");
          clearInterval(progressInterval);
          return;
        }

        const data = await res.json();
        setInstalledApps(data.installedApps || []);

        // Smooth transition to 100%
        setTimeout(() => {
          setProgress(100);
          setCurrentStepIdx(3);
          setTimeout(() => {
            setPhase("ready");
          }, 500);
        }, 1200);
      } catch {
        setError("Network error while configuring workspace.");
        clearInterval(progressInterval);
      }
    }

    completeSetup();

    return () => clearInterval(progressInterval);
  }, [phase]);

  // Phase B: 5-second countdown timer for auto-redirect
  useEffect(() => {
    if (phase !== "ready") return;

    if (countdown <= 0) {
      router.push("/dashboard");
      return;
    }

    const timer = setTimeout(() => {
      setCountdown((prev) => prev - 1);
    }, 1000);

    return () => clearTimeout(timer);
  }, [phase, countdown, router]);

  const handleGoToDashboard = () => {
    router.push("/dashboard");
  };

  return (
    <div className="relative w-full max-w-2xl bg-surface border border-border rounded-xl shadow-sm p-6 sm:p-8 overflow-hidden">
      {phase === "ready" && <ConfettiBurst />}

      <OnboardingStepper currentStep={3} />

      {error ? (
        <div className="space-y-4">
          <div className="p-4 bg-danger/10 border border-danger/30 text-danger rounded-xl flex items-start gap-3">
            <svg className="w-5 h-5 shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
            <div>
              <h3 className="text-sm font-bold">Workspace Configuration Error</h3>
              <p className="text-xs mt-1 text-danger/90">{error}</p>
            </div>
          </div>
          <button
            onClick={() => window.location.reload()}
            className="w-full px-4 py-2 bg-surface border border-border text-xs font-semibold text-text rounded-lg hover:bg-surface-muted"
          >
            Retry Setup
          </button>
        </div>
      ) : phase === "provisioning" ? (
        <div className="space-y-6">
          <div>
            <h1 className="text-xl sm:text-2xl font-bold font-heading tracking-tight text-text">
              Preparing your workspace
            </h1>
            <p className="text-sm text-text-secondary mt-1">
              Please wait while we initialize your organization database, configure tenant isolation, and provision selected apps.
            </p>
          </div>

          {/* Master Progress Bar */}
          <div className="space-y-2">
            <div className="flex items-center justify-between text-xs font-semibold">
              <span className="text-text">Workspace Provisioning</span>
              <span className="font-mono text-action">{progress}%</span>
            </div>
            <div className="w-full h-2.5 bg-surface-muted rounded-full overflow-hidden border border-border">
              <div
                className="h-full bg-action rounded-full transition-all duration-300 ease-out"
                style={{ width: `${progress}%` }}
              />
            </div>
          </div>

          {/* Step Pipeline Checklist */}
          <div className="space-y-3 pt-2">
            {SETUP_STEPS.map((step, idx) => {
              const isCompleted = idx < currentStepIdx || progress === 100;
              const isCurrent = idx === currentStepIdx && progress < 100;

              return (
                <div
                  key={step.id}
                  className={`flex items-start gap-3 p-3 rounded-lg border transition-all duration-fast ${
                    isCurrent
                      ? "bg-action/5 border-action/40 ring-1 ring-action/20"
                      : isCompleted
                      ? "bg-surface-muted border-border"
                      : "bg-surface border-border/60 opacity-60"
                  }`}
                >
                  <div className="shrink-0 mt-0.5">
                    {isCompleted ? (
                      <div className="h-5 w-5 rounded-full bg-action text-on-action flex items-center justify-center">
                        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                        </svg>
                      </div>
                    ) : isCurrent ? (
                      <div className="h-5 w-5 rounded-full border-2 border-action border-t-transparent animate-spin" />
                    ) : (
                      <div className="h-5 w-5 rounded-full border border-border bg-surface-muted flex items-center justify-center text-[10px] text-text-muted">
                        0{idx + 1}
                      </div>
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className={`text-xs font-semibold ${isCompleted ? "text-text" : isCurrent ? "text-action" : "text-text-muted"}`}>
                      {step.label}
                    </p>
                    <p className="text-[11px] text-text-secondary truncate mt-0.5">
                      {isCompleted ? "Completed successfully" : step.detail}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ) : (
        /* Phase B: Celebration & Ready State */
        <div className="text-center py-4 space-y-6 animate-in fade-in duration-500">
          <div className="mx-auto w-16 h-16 rounded-full bg-action/15 text-action border border-action/30 flex items-center justify-center shadow-sm">
            <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
            </svg>
          </div>

          <div>
            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-action/15 text-action border border-action/30 mb-2">
              Setup Completed
            </span>
            <h1 className="text-2xl font-bold font-heading tracking-tight text-text">
              Your workspace is ready!
            </h1>
            <p className="text-sm text-text-secondary mt-1 max-w-md mx-auto">
              Your organization workspace and selected applications have been provisioned and configured.
            </p>
          </div>

          {/* Provisioned Applications Card */}
          {installedApps.length > 0 && (
            <div className="bg-surface-muted border border-border rounded-xl p-4 text-left">
              <div className="text-xs font-bold uppercase tracking-wider text-text-secondary mb-2.5">
                Installed Applications ({installedApps.length})
              </div>
              <div className="flex flex-wrap gap-2">
                {installedApps.map((app) => (
                  <span
                    key={app}
                    className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-medium bg-surface border border-border text-text shadow-2xs"
                  >
                    <span className="h-1.5 w-1.5 rounded-full bg-action" />
                    <span>{app}</span>
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Auto-redirect Button */}
          <div className="pt-2">
            <button
              onClick={handleGoToDashboard}
              className="w-full sm:w-auto px-8 py-3 bg-action text-on-action rounded-xl text-sm font-bold hover:opacity-95 active:scale-[0.98] transition-all duration-fast shadow-md flex items-center justify-center gap-2.5 mx-auto group"
            >
              <span>Go to dashboard ({countdown}s)</span>
              <svg className="w-4 h-4 shrink-0 transition-transform group-hover:translate-x-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M14 5l7 7m0 0l-7 7m7-7H3" />
              </svg>
            </button>
            <p className="text-[11px] text-text-muted mt-2">
              Automatically redirecting to your workspace dashboard in {countdown} seconds...
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
