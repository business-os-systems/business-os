"use client";

import React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { SettingsCategoryConfig, SettingsGroupConfig } from "@suite/ui";
import { hasPermission } from "@suite/core";
import { SettingsIcon } from "@suite/ui/icons";
import { settingsGroupsConfig } from "./settings.config";
import { getSettingsIcon } from "./icon-registry";

export interface SettingsNavProps {
  userPermissions?: readonly string[];
  groups?: SettingsGroupConfig[];
  categories?: SettingsCategoryConfig[];
  className?: string;
  isMobile?: boolean;
  onSelectCategory?: (id: string) => void;
}

export function SettingsNav({
  userPermissions,
  groups,
  categories,
  className,
  isMobile = false,
  onSelectCategory,
}: SettingsNavProps) {
  const pathname = usePathname();

  const resolvedGroups: SettingsGroupConfig[] =
    groups ??
    (categories
      ? [{ id: "categories", items: categories }]
      : settingsGroupsConfig);

  // Capability-based permission evaluator: STRICTLY FAIL-CLOSED
  const isCategoryAuthorized = (category: SettingsCategoryConfig): boolean => {
    if (!category.permission) return true;
    if (!userPermissions || userPermissions.length === 0) return false;
    return hasPermission(userPermissions, category.permission);
  };

  const renderCategoryItem = (category: SettingsCategoryConfig) => {
    const currentPath = pathname ?? "";
    const isActive =
      currentPath === category.href ||
      currentPath.startsWith(`${category.href}/`);
    const IconComponent = getSettingsIcon(category.icon);

    return (
      <Link
        key={category.id}
        href={category.href}
        prefetch={false}
        onClick={() => onSelectCategory?.(category.id)}
        className={`group relative flex items-center gap-3 rounded-lg px-3 py-2 text-xs sm:text-[13px] min-h-[38px] transition-colors ${
          isActive
            ? "bg-brand-tint/70 text-brand font-semibold shadow-2xs before:absolute before:left-0 before:top-2 before:bottom-2 before:w-1 before:bg-brand before:rounded-r-sm"
            : "text-text-secondary hover:bg-surface-hover hover:text-text font-medium"
        }`}
      >
        <IconComponent
          className={`h-4 w-4 flex-shrink-0 transition-colors ${
            isActive ? "text-brand" : "text-text-muted group-hover:text-text"
          }`}
        />
        <span className="truncate">{category.label}</span>
      </Link>
    );
  };

  return (
    <aside
      className={`flex flex-col border-r border-border bg-surface ${
        isMobile ? "w-full" : "w-56 sm:w-60"
      } ${className || ""}`}
    >
      <div className="flex h-12 items-center border-b border-border px-4 bg-surface flex-shrink-0">
        <div className="flex items-center gap-2">
          <div className="flex h-6 w-6 items-center justify-center rounded-md bg-brand-tint text-brand">
            <SettingsIcon className="h-3.5 w-3.5" />
          </div>
          <span className="font-bold text-text text-xs tracking-tight">
            Settings
          </span>
        </div>
      </div>

      <nav className="flex-1 space-y-3 p-2.5 overflow-y-auto">
        {resolvedGroups.map((group, groupIdx) => {
          const authorizedItems = group.items.filter(isCategoryAuthorized);
          if (authorizedItems.length === 0) return null;

          return (
            <div
              key={group.id}
              className={`space-y-0.5 ${groupIdx > 0 ? "pt-2.5 border-t border-border" : ""}`}
            >
              {group.label && (
                <div className="px-3 pb-1.5 pt-0.5 text-[10px] font-semibold uppercase tracking-wider text-text-muted">
                  {group.label}
                </div>
              )}
              {authorizedItems.map(renderCategoryItem)}
            </div>
          );
        })}
      </nav>
    </aside>
  );
}
