import React from "react";
import { cn } from "../lib/utils.js";

export interface InputVariantProps {
  inputSize?: "sm" | "default" | "lg";
  hasError?: boolean;
  fullWidth?: boolean;
}

export interface InputAdornmentProps {
  startIcon?: React.ReactNode;
  endIcon?: React.ReactNode;
}

export interface InputProps
  extends Omit<React.InputHTMLAttributes<HTMLInputElement>, "size">,
    InputVariantProps,
    InputAdornmentProps {}

const sizeStyles: Record<NonNullable<InputVariantProps["inputSize"]>, string> = {
  sm: "h-8 px-2.5 text-xs rounded-lg",
  default: "h-9 px-3 text-sm rounded-lg",
  lg: "h-11 px-4 text-base rounded-lg",
};

export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  (
    {
      className,
      type = "text",
      inputSize = "default",
      hasError = false,
      fullWidth = true,
      startIcon,
      endIcon,
      disabled,
      ...props
    },
    ref,
  ) => {
    const inputElement = (
      <input
        type={type}
        ref={ref}
        disabled={disabled}
        aria-invalid={hasError ? "true" : undefined}
        className={cn(
          "border border-border-strong bg-surface text-text placeholder:text-text-muted transition-colors focus:outline-none focus:ring-2 focus:ring-focus-ring focus:border-transparent disabled:cursor-not-allowed disabled:opacity-50",
          sizeStyles[inputSize],
          fullWidth && "w-full",
          hasError && "border-danger focus:ring-danger text-text",
          startIcon && (inputSize === "sm" ? "pl-8" : "pl-9"),
          endIcon && (inputSize === "sm" ? "pr-8" : "pr-9"),
          className,
        )}
        {...props}
      />
    );

    if (!startIcon && !endIcon) {
      return inputElement;
    }

    return (
      <div className={cn("relative flex items-center", fullWidth && "w-full")}>
        {startIcon && (
          <div className="pointer-events-none absolute left-3 flex items-center justify-center text-text-muted">
            {startIcon}
          </div>
        )}
        {inputElement}
        {endIcon && (
          <div className="absolute right-3 flex items-center justify-center text-text-muted">
            {endIcon}
          </div>
        )}
      </div>
    );
  },
);

Input.displayName = "Input";
