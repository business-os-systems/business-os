import React from "react";
import { CheckIcon } from "@suite/ui/icons";

export interface OnboardingStepperProps {
  currentStep: 1 | 2 | 3;
}

const STEPS = [
  { step: 1, label: "Organization Details" },
  { step: 2, label: "Application Selection" },
  { step: 3, label: "Workspace Setup" },
] as const;

export function OnboardingStepper({ currentStep }: OnboardingStepperProps) {
  return (
    <div className="w-full flex items-center justify-between gap-2 px-2 py-3 border-b border-border/80 mb-6">
      {STEPS.map((item, index) => {
        const isDone = item.step < currentStep;
        const isActive = item.step === currentStep;

        return (
          <React.Fragment key={item.step}>
            <div className="flex items-center gap-2">
              <div
                className={`h-7 w-7 rounded-full flex items-center justify-center text-xs font-semibold transition-colors duration-fast ${
                  isDone
                    ? "bg-action text-on-action"
                    : isActive
                    ? "bg-brand text-on-brand shadow-xs"
                    : "bg-surface-muted text-text-muted border border-border"
                }`}
              >
                {isDone ? (
                  <CheckIcon size={16} />
                ) : (
                  `0${item.step}`
                )}
              </div>

              <span
                className={`hidden sm:inline text-xs font-medium tracking-tight ${
                  isActive
                    ? "text-text font-semibold"
                    : isDone
                    ? "text-text-secondary"
                    : "text-text-muted"
                }`}
              >
                {item.label}
              </span>
            </div>
            {index < STEPS.length - 1 && (
              <div
                className={`flex-1 h-[2px] transition-colors duration-base ${
                  item.step < currentStep ? "bg-action" : "bg-border"
                }`}
              />
            )}
          </React.Fragment>
        );
      })}
    </div>
  );
}
