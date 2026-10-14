import React from "react";
import { cn } from "../lib/utils.js";

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  hasError?: boolean;
}

export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, type = "text", hasError = false, disabled, ...props }, ref) => {
    return (
      <input
        type={type}
        ref={ref}
        disabled={disabled}
        className={cn(
          "flex h-9 w-full rounded-DEFAULT border border-border-strong bg-surface px-3 py-2 text-sm text-text placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-focus-ring focus:border-transparent disabled:cursor-not-allowed disabled:opacity-50",
          hasError && "border-danger focus:ring-danger",
          className,
        )}
        {...props}
      />
    );
  },
);

Input.displayName = "Input";
