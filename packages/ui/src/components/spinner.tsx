import React from "react";
import { cn } from "../lib/utils.js";

export interface SpinnerProps extends React.SVGAttributes<SVGSVGElement> {
  size?: "sm" | "default" | "md" | "lg";
  color?: "current" | "action" | "brand";
}

const sizeStyles: Record<NonNullable<SpinnerProps["size"]>, string> = {
  sm: "h-3.5 w-3.5",
  default: "h-4 w-4",
  md: "h-5 w-5",
  lg: "h-8 w-8",
};

const colorStyles: Record<NonNullable<SpinnerProps["color"]>, string> = {
  current: "text-current",
  action: "text-action",
  brand: "text-brand",
};

export const Spinner = React.forwardRef<SVGSVGElement, SpinnerProps>(
  ({ className, size = "default", color = "current", ...props }, ref) => {
    return (
      <svg
        ref={ref}
        className={cn(
          "animate-spin shrink-0",
          sizeStyles[size],
          colorStyles[color],
          className,
        )}
        xmlns="http://www.w3.org/2000/svg"
        fill="none"
        viewBox="0 0 24 24"
        aria-hidden="true"
        {...props}
      >
        <circle
          className="opacity-25"
          cx="12"
          cy="12"
          r="10"
          stroke="currentColor"
          strokeWidth="4"
        />
        <path
          className="opacity-75"
          fill="currentColor"
          d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
        />
      </svg>
    );
  },
);

Spinner.displayName = "Spinner";
