"use client";

import React from "react";
import type { AppManifest } from "@suite/core";
import { Checkbox } from "@suite/ui";
import { getNavIcon } from "@/components/layout/icon-registry";
import { describeTargetIndustries } from "@/lib/onboarding-apps";

interface AppSelectionCardProps {
  readonly app: AppManifest;
  readonly isSelected: boolean;
  readonly isRecommended: boolean;
  readonly onToggle: (appId: string) => void;
}

/**
 * One selectable application card. The icon resolves through the exhaustive
 * navigation icon registry, so an app with an unregistered icon key fails
 * loudly instead of rendering a placeholder glyph.
 */
export function AppSelectionCard({
  app,
  isSelected,
  isRecommended,
  onToggle,
}: AppSelectionCardProps) {
  const AppIcon = getNavIcon(app.iconKey);
  const supportingLabel = isRecommended ? "Recommended" : app.category;
  const targetIndustrySummary = describeTargetIndustries(app);
  const selectionClassName = isSelected
    ? "bg-action/5 border-action shadow-xs ring-1 ring-action"
    : "bg-surface border-border hover:border-text-secondary/40";

  return (
    <div
      onClick={() => onToggle(app.appId)}
      className={`cursor-pointer p-4 rounded-xl border transition-all duration-fast select-none flex flex-col justify-between ${selectionClassName}`}
    >
      <div>
        <div className="flex items-start justify-between gap-3 mb-2">
          <div className="flex items-center gap-2.5">
            <span className="h-9 w-9 rounded-lg bg-surface-muted border border-border text-text-secondary flex items-center justify-center">
              <AppIcon size={18} />
            </span>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-bold text-text">{app.title}</h3>
                <span className="px-1.5 py-0.5 rounded text-[10px] font-mono font-bold bg-surface-muted text-text-secondary border border-border">
                  {app.code}
                </span>
              </div>
              {supportingLabel !== undefined && (
                <span
                  className={
                    isRecommended
                      ? "text-[10px] font-semibold text-action uppercase tracking-wide"
                      : "text-[10px] text-text-muted"
                  }
                >
                  {supportingLabel}
                </span>
              )}
            </div>
          </div>
          <Checkbox checked={isSelected} readOnly className="mt-1" />
        </div>
        <p className="text-xs text-text-secondary line-clamp-2">
          {app.description}
        </p>
        <p className="text-[10px] text-text-muted mt-1">
          {targetIndustrySummary}
        </p>
      </div>
    </div>
  );
}
