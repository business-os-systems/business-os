"use client";

import React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { SettingsCategoryConfig } from "@suite/ui";
import { hasPermission } from "@suite/core";
import { SettingsIcon } from "@suite/ui/icons";
import { settingsCategoriesConfig } from "./settings.config";
import { getSettingsIcon } from "./icon-registry";

export interface SettingsNavProps {
  userPermissions?: readonly string[];
  categories?: SettingsCategoryConfig[];
  className?: string;
  isMobile?: boolean;
  onSelectCategory?: (id: string) => void;
}

export function SettingsNav({
  userPermissions,
  categories = settingsCategoriesConfig,
  className,
  isMobile = false,
  onSelectCategory,
}: SettingsNavProps) {
  const pathname = usePathname();

  // Capability-based permission evaluator: STRICTLY FAIL-CLOSED
  const isCategoryAuthorized = (category: SettingsCategoryConfig): boolean => {
    if (!category.permission) return true;
    if (!userPermissions || userPermissions.length === 0) return false;
    return hasPermission(userPermissions, category.permission);
  };

  const authorizedCategories = categories.filter(isCategoryAuthorized);

  return (
    <aside
      className={`flex flex-col border-r border-border bg-surface ${
        isMobile ? "w-full" : "w-64"
      } ${className || ""}`}
    >
      <div className="flex h-16 items-center border-b border-border px-5 bg-surface flex-shrink-0">
        <div className="flex items-center gap-2.5">
          <div className="flex h-7 w-7 items-center justify-center rounded-md bg-brand-tint text-brand">
            <SettingsIcon className="h-4 w-4" />
          </div>
          <div className="flex flex-col">
            <h2 className="font-bold text-text text-sm tracking-tight">Settings</h2>
            <p className="text-[11px] text-text-muted font-medium">Core Workspace Hub</p>
          </div>
        </div>
      </div>

      <nav className="flex-1 space-y-1 p-3 overflow-y-auto">
        <div className="px-3 pb-2 pt-1 text-[11px] font-semibold uppercase tracking-wider text-text-muted">
          Core Settings
        </div>
        {authorizedCategories.map((category) => {
          const currentPath = pathname ?? "";
          const isActive =
            currentPath === category.href ||
            currentPath.startsWith(`${category.href}/`);
          const IconComponent = getSettingsIcon(category.icon);

          return (
            <Link
              key={category.id}
              href={category.href}
              onClick={() => onSelectCategory?.(category.id)}
              className={`flex items-start gap-3 rounded-lg px-3 py-2.5 text-sm transition-colors ${
                isActive
                  ? "border border-brand bg-brand-tint text-brand font-semibold shadow-xs"
                  : "text-text-secondary hover:bg-surface-hover hover:text-text font-medium"
              }`}
            >
              <IconComponent
                className={`h-5 w-5 mt-0.5 flex-shrink-0 ${
                  isActive ? "text-brand" : "text-text-muted"
                }`}
              />
              <div className="flex flex-col flex-1 overflow-hidden">
                <span className="truncate">{category.label}</span>
                {category.description && (
                  <span className="text-xs text-text-muted line-clamp-1 mt-0.5 font-normal">
                    {category.description}
                  </span>
                )}
              </div>
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}
