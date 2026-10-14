"use client";

import React, { useEffect, useState } from "react";
import { Button } from "@suite/ui";
import { SunIcon, MoonIcon, MonitorIcon } from "@suite/ui/icons";

export type ThemeMode = "system" | "light" | "dark";

export function ThemeToggle() {
  const [theme, setTheme] = useState<ThemeMode>("system");
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    try {
      const stored = localStorage.getItem("business-os-theme") as ThemeMode | null;
      if (stored === "light" || stored === "dark") {
        setTheme(stored);
        document.documentElement.setAttribute("data-theme", stored);
      } else {
        setTheme("system");
        document.documentElement.removeAttribute("data-theme");
      }
    } catch {
      // Ignore localStorage errors in restricted contexts
    }
  }, []);

  const handleCycleTheme = () => {
    const nextTheme: ThemeMode =
      theme === "system" ? "light" : theme === "light" ? "dark" : "system";

    setTheme(nextTheme);

    try {
      if (nextTheme === "system") {
        localStorage.removeItem("business-os-theme");
        document.documentElement.removeAttribute("data-theme");
      } else {
        localStorage.setItem("business-os-theme", nextTheme);
        document.documentElement.setAttribute("data-theme", nextTheme);
      }
    } catch {
      // Ignore localStorage errors
    }
  };

  // Avoid hydration mismatch by rendering a neutral placeholder until mounted
  if (!mounted) {
    return (
      <Button
        variant="ghost"
        size="sm"
        className="h-8 w-8 p-0 text-text-muted hover:text-text rounded-DEFAULT"
        aria-label="Theme toggle"
        disabled
      >
        <span className="h-4 w-4" />
      </Button>
    );
  }

  return (
    <Button
      variant="ghost"
      size="sm"
      onClick={handleCycleTheme}
      className="h-8 px-2 gap-1.5 text-xs text-text-muted hover:text-text hover:bg-surface-hover rounded-DEFAULT border border-transparent hover:border-border transition-colors"
      title={`Theme: ${
        theme === "system"
          ? "System Default (Auto)"
          : theme === "light"
          ? "Light Mode"
          : "Dark Mode"
      } — Click to switch`}
      aria-label={`Current theme is ${theme}. Click to change.`}
    >
      {theme === "system" && (
        <>
          <MonitorIcon className="w-4 h-4 text-text-muted" />
          <span className="hidden lg:inline text-[11px] font-medium">Auto</span>
        </>
      )}
      {theme === "light" && (
        <>
          <SunIcon className="w-4 h-4 text-warning" />
          <span className="hidden lg:inline text-[11px] font-medium">Light</span>
        </>
      )}
      {theme === "dark" && (
        <>
          <MoonIcon className="w-4 h-4 text-action" />
          <span className="hidden lg:inline text-[11px] font-medium">Dark</span>
        </>
      )}
    </Button>
  );
}
