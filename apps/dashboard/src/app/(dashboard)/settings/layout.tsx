"use client";

import React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronLeftIcon } from "@suite/ui/icons";
import { settingsCategoriesConfig } from "@/components/layout/settings.config";

export default function SettingsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const isRootSettings = pathname === "/settings";

  // Find active category for mobile breadcrumb
  const activeCategory = settingsCategoriesConfig.find(
    (c) => pathname === c.href || pathname?.startsWith(`${c.href}/`)
  );

  return (
    <div className="flex flex-col w-full h-full">
      {/* Mobile Master-Detail Drill-Down Back Header (< 768px) */}
      {!isRootSettings && (
        <div className="md:hidden flex items-center justify-between pb-4 mb-4 border-b border-border">
          <Link
            href="/settings"
            className="inline-flex items-center gap-1.5 text-sm font-medium text-text-secondary hover:text-text transition-colors"
          >
            <ChevronLeftIcon className="h-4 w-4" />
            <span>Back to Settings</span>
          </Link>
          {activeCategory && (
            <span className="text-xs font-semibold uppercase tracking-wider text-text-muted">
              {activeCategory.label}
            </span>
          )}
        </div>
      )}

      {/* Main Settings Panel Content */}
      <div className="flex-1">{children}</div>
    </div>
  );
}
