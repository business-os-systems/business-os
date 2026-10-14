import React from "react";
import { cn } from "../lib/utils.js";

export interface TextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  hasError?: boolean;
}

export const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ className, hasError = false, disabled, ...props }, ref) => {
    return (
      <textarea
        ref={ref}
        disabled={disabled}
        className={cn(
          "flex min-h-[88px] w-full rounded-DEFAULT border border-border-strong bg-surface px-3 py-2 text-sm text-text placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-focus-ring focus:border-transparent disabled:cursor-not-allowed disabled:opacity-50",
          hasError && "border-danger focus:ring-danger",
          className,
        )}
        {...props}
      />
    );
  },
);

Textarea.displayName = "Textarea";
