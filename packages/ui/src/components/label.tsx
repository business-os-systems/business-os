import React from "react";
import { cn } from "../lib/utils.js";

export interface LabelProps extends React.LabelHTMLAttributes<HTMLLabelElement> {
  required?: boolean;
  size?: "sm" | "md";
}

const sizeStyles: Record<NonNullable<LabelProps["size"]>, string> = {
  sm: "text-xs font-medium text-text-secondary mb-1",
  md: "text-sm font-medium text-text mb-1.5",
};

export const Label = React.forwardRef<HTMLLabelElement, LabelProps>(
  ({ className, size = "sm", required = false, children, ...props }, ref) => {
    return (
      <label
        ref={ref}
        className={cn(
          "block select-none cursor-pointer",
          sizeStyles[size],
          className,
        )}
        {...props}
      >
        {children}
        {required && (
          <span className="text-danger font-mono ml-0.5" aria-hidden="true">
            *
          </span>
        )}
      </label>
    );
  },
);

Label.displayName = "Label";
