import React from "react";
import { cn } from "../lib/utils.js";
import { Spinner } from "./spinner.js";

export interface ButtonVariantProps {
  variant?:
    | "default"
    | "primary"
    | "secondary"
    | "tertiary"
    | "destructive"
    | "outline"
    | "ghost"
    | "link";
  size?: "default" | "sm" | "lg" | "icon";
  fullWidth?: boolean;
}

export interface ButtonAdornmentProps {
  isLoading?: boolean;
  startIcon?: React.ReactNode;
  endIcon?: React.ReactNode;
}

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    ButtonVariantProps,
    ButtonAdornmentProps {}

const baseStyles =
  "inline-flex items-center justify-center font-medium rounded-lg transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 disabled:opacity-50 disabled:pointer-events-none select-none cursor-pointer";

const variantStyles: Record<NonNullable<ButtonProps["variant"]>, string> = {
  default:
    "bg-action text-on-action hover:bg-action-hover active:bg-action-active focus-visible:ring-focus-ring",
  primary:
    "bg-action text-on-action hover:bg-action-hover active:bg-action-active focus-visible:ring-focus-ring",
  secondary:
    "bg-surface text-text border border-border-strong hover:bg-surface-muted focus-visible:ring-focus-ring",
  tertiary:
    "bg-surface-muted text-text hover:bg-surface-sunken focus-visible:ring-focus-ring",
  destructive:
    "bg-danger text-text-inverse hover:opacity-90 focus-visible:ring-danger",
  outline:
    "border border-border-strong bg-surface hover:bg-surface-muted text-text focus-visible:ring-focus-ring",
  ghost:
    "bg-transparent hover:bg-surface-muted text-text-secondary focus-visible:ring-focus-ring",
  link: "text-action underline-offset-4 hover:underline focus-visible:ring-focus-ring",
};

const sizeStyles: Record<NonNullable<ButtonProps["size"]>, string> = {
  default: "h-10 px-4 py-2.5 text-sm gap-2",
  sm: "h-8 px-3 text-xs gap-1.5",
  lg: "h-11 px-5 text-sm font-semibold gap-2",
  icon: "h-10 w-10 p-2",
};

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      className,
      variant = "default",
      size = "default",
      fullWidth = false,
      isLoading = false,
      startIcon,
      endIcon,
      children,
      disabled,
      type = "button",
      ...props
    },
    ref,
  ) => {
    const spinnerSize = size === "sm" ? "sm" : size === "lg" ? "md" : "default";

    return (
      <button
        ref={ref}
        type={type}
        disabled={disabled || isLoading}
        aria-busy={isLoading ? "true" : undefined}
        aria-disabled={disabled || isLoading ? "true" : undefined}
        className={cn(
          baseStyles,
          variantStyles[variant],
          sizeStyles[size],
          fullWidth && "w-full",
          className,
        )}
        {...props}
      >
        {isLoading ? (
          <Spinner size={spinnerSize} color="current" />
        ) : (
          startIcon && <span className="inline-flex shrink-0">{startIcon}</span>
        )}
        {children}
        {endIcon && !isLoading && (
          <span className="inline-flex shrink-0">{endIcon}</span>
        )}
      </button>
    );
  },
);

Button.displayName = "Button";
