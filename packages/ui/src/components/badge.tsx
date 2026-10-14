import React from "react";
import { cn } from "../lib/utils.js";

export interface BadgeProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?:
    | "default"
    | "primary"
    | "secondary"
    | "tertiary"
    | "destructive"
    | "outline"
    | "success";
}

export function Badge({
  className,
  variant = "default",
  ...props
}: BadgeProps) {
  const variantStyles = {
    default: "border-transparent bg-brand text-on-brand hover:bg-brand-hover",
    primary: "border-transparent bg-brand text-on-brand hover:bg-brand-hover",
    secondary:
      "border-transparent bg-brand-tint text-brand hover:bg-brand hover:text-on-brand",
    tertiary:
      "border-transparent bg-surface-muted text-text-secondary hover:bg-surface-sunken",
    destructive:
      "border-transparent bg-danger text-text-inverse hover:opacity-90",
    outline: "text-text border border-border-strong",
    success:
      "border-transparent bg-action text-on-action hover:bg-action-hover",
  };

  return (
    <div
      className={cn(
        "inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-focus-ring focus:ring-offset-2",
        variantStyles[variant],
        className,
      )}
      {...props}
    />
  );
}
