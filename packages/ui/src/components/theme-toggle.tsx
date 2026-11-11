"use client";

import React, { useEffect, useState } from "react";
import { Button } from "./button.js";
import {
  SunIcon,
  MoonIcon,
  MonitorIcon,
  type IconProps,
} from "../icons/index.js";

export type ThemeMode = "system" | "light" | "dark";

const THEME_SEQUENCE: Readonly<Record<ThemeMode, ThemeMode>> = {
  system: "light",
  light: "dark",
  dark: "system",
};

const THEME_META: Readonly<
  Record<
    ThemeMode,
    {
      readonly label: string;
      readonly title: string;
      readonly Icon: React.FC<IconProps>;
      readonly iconClass: string;
    }
  >
> = {
  system: {
    label: "Auto",
    title: "System Default (Auto)",
    Icon: MonitorIcon,
    iconClass: "text-text-muted",
  },
  light: {
    label: "Light",
    title: "Light Mode",
    Icon: SunIcon,
    iconClass: "text-warning",
  },
  dark: {
    label: "Dark",
    title: "Dark Mode",
    Icon: MoonIcon,
    iconClass: "text-action",
  },
};

export function ThemeToggle() {
  const [theme, setTheme] = useState<ThemeMode>("system");
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    try {
      const stored = localStorage.getItem("business-os-theme");
      if (stored === "light" || stored === "dark") {
        setTheme(stored);
        document.documentElement.setAttribute("data-theme", stored);
      } else {
        setTheme("system");
        document.documentElement.removeAttribute("data-theme");
      }
    } catch (error) {
      console.error("[theme-toggle] failed to read the theme preference", error);
    }
  }, []);

  const handleCycleTheme = () => {
    const nextTheme = THEME_SEQUENCE[theme];
    setTheme(nextTheme);

    try {
      if (nextTheme === "system") {
        localStorage.removeItem("business-os-theme");
        document.documentElement.removeAttribute("data-theme");
      } else {
        localStorage.setItem("business-os-theme", nextTheme);
        document.documentElement.setAttribute("data-theme", nextTheme);
      }
    } catch (error) {
      console.error("[theme-toggle] failed to persist the theme preference", error);
    }
  };

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

  const meta = THEME_META[theme];
  const Icon = meta.Icon;

  return (
    <Button
      variant="ghost"
      size="sm"
      onClick={handleCycleTheme}
      className="h-8 px-2 gap-1.5 text-xs text-text-muted hover:text-text hover:bg-surface-hover rounded-DEFAULT border border-transparent hover:border-border transition-colors"
      title={`Theme: ${meta.title} — Click to switch`}
      aria-label={`Current theme is ${meta.label} (${theme}). Click to change.`}
    >
      <Icon className={`w-4 h-4 ${meta.iconClass}`} />
      <span className="hidden lg:inline text-[11px] font-medium">
        {meta.label}
      </span>
    </Button>
  );
}
