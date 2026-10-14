import React from "react";
import { cn } from "../lib/utils.js";

export interface BadgeProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: "default" | "primary" | "secondary" | "tertiary" | "destructive" | "outline" | "success";
}

export function Badge({
  className,
  variant = "default",
  ...props
}: BadgeProps) {
  const variantStyles = {
    default: "border-transparent bg-primary text-white hover:bg-brand-hover",
    primary: "border-transparent bg-primary text-white hover:bg-brand-hover",
    secondary:
      "border-transparent bg-secondary-container text-on-secondary-container hover:bg-secondary hover:text-white",
    tertiary:
      "border-transparent bg-tertiary-container text-on-tertiary-container hover:bg-tertiary hover:text-white",
    destructive:
      "border-transparent bg-error text-on-error hover:bg-red-700",
    outline: "text-on-surface border border-outline-variant",
    success:
      "border-transparent bg-emerald-600 text-white hover:bg-emerald-700",
  };

  return (
    <div
      className={cn(
        "inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-slate-950 focus:ring-offset-2",
        variantStyles[variant],
        className
      )}
      {...props}
    />
  );
}
